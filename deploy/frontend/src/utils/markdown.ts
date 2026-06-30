import { v4 as uuidv4 } from 'uuid';
import type { Node } from '../api/data';

export interface ParsedNode {
  id: string;
  content: string;
  note?: string;
  is_completed: boolean;
  is_in_progress: boolean;
  is_collapsed: boolean;
  children: ParsedNode[];
  level: number; // For internal processing
}

export const parseMarkdown = (text: string): ParsedNode[] => {
  const lines = text.split('\n');
  const rootNodes: ParsedNode[] = [];
  const stack: ParsedNode[] = [];

  const getIndentLevel = (line: string): number => {
    const match = line.match(/^(\s*)/);
    if (!match) return 0;
    const whitespace = match[1];
    // Assume 2 spaces or 1 tab per level. 
    // If mixed, it's tricky, but let's count spaces/tabs.
    // Convert tabs to 2 spaces?
    // Let's count total length assuming tab=2 spaces for simplicity, or just use length if consistent.
    // Standard markdown uses 2 or 4 spaces.
    const spaces = whitespace.replace(/\t/g, '  ').length;
    return Math.floor(spaces / 2); // 2 spaces per level
  };

  const parseLineContent = (line: string): { content: string, is_completed: boolean, is_in_progress: boolean, is_note: boolean } => {
    let content = line.trim();
    let is_completed = false;
    let is_in_progress = false;
    let is_note = false;

    // Check for note (blockquote)
    const noteMatch = content.match(/^>\s+(.*)/);
    if (noteMatch) {
      is_note = true;
      content = noteMatch[1];
      return { content, is_completed, is_in_progress, is_note };
    }

    // Check for checklist: [ ] unchecked, [-] in-progress, [x] checked
    const checkboxMatch = content.match(/^- \[(x|X|-| )\]\s+(.*)/);
    if (checkboxMatch) {
      const state = checkboxMatch[1];
      is_completed = state.toLowerCase() === 'x';
      is_in_progress = state === '-';
      content = checkboxMatch[2];
    } else {
      // Check for bullet
      const bulletMatch = content.match(/^[-*]\s+(.*)/);
      if (bulletMatch) {
        content = bulletMatch[1];
      } else {
        // Check for headers
        const headerMatch = content.match(/^#+\s+(.*)/);
        if (headerMatch) {
            content = headerMatch[1];
            // Maybe store level? For now just treat as node content.
        }
      }
    }
    return { content, is_completed, is_in_progress, is_note };
  };

  lines.forEach(line => {
    if (!line.trim()) return;

    const level = getIndentLevel(line);
    const { content, is_completed, is_in_progress, is_note } = parseLineContent(line);
    
    // If this is a note line, attach it to the parent node
    if (is_note && stack.length > 0) {
      // Find the parent node (should be at the previous level)
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        // Append to existing note or create new one
        parent.note = parent.note ? `${parent.note}\n${content}` : content;
      }
      return;
    }
    
    const newNode: ParsedNode = {
      id: uuidv4(),
      content,
      is_completed,
      is_in_progress,
      is_collapsed: false,
      children: [],
      level
    };

    // Find parent
    if (level === 0) {
      rootNodes.push(newNode);
      stack.length = 0; // Reset stack
      stack.push(newNode);
    } else {
      // Find the correct parent in stack
      // Parent should have level = newNode.level - 1
      // If stack top has level >= newNode.level, pop until we find a parent with level < newNode.level
      
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      
      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        parent.children.push(newNode);
        stack.push(newNode);
      } else {
        // Fallback: treat as root if no parent found (shouldn't happen with correct logic unless bad indentation)
        rootNodes.push(newNode);
        stack.push(newNode);
      }
    }
  });

  return rootNodes;
};

// Flatten the tree for batch insertion, preserving order and parent links
export const flattenParsedNodes = (
  nodes: ParsedNode[], 
  documentId: string, 
  rootParentId: string | null, 
  startSortOrder: number
): {
  id: string,
  document_id: string,
  parent_node_id: string | null,
  content: string,
  note: string | null,
  sort_order: number,
  is_completed: boolean,
  is_in_progress: boolean,
  is_collapsed: boolean
}[] => {
  const result: any[] = [];

  let currentSortOrder = startSortOrder;

  const process = (nodes: ParsedNode[], parentId: string | null) => {
    nodes.forEach(node => {
      const nodeData = {
        id: node.id,
        document_id: documentId,
        parent_node_id: parentId,
        content: node.content,
        note: node.note || null,
        sort_order: currentSortOrder,
        is_completed: node.is_completed,
        is_in_progress: node.is_in_progress,
        is_collapsed: node.is_collapsed
      };
      
      currentSortOrder += 1000;
      
      result.push(nodeData);
      
      if (node.children.length > 0) {
        process(node.children, node.id);
      }
    });
  };

  process(nodes, rootParentId);
  return result;
};

export const nodesToMarkdown = (nodes: Node[], selectedIds: string[]): string => {
  // Find roots: Selected nodes whose parent is NOT in the selection
  const roots = nodes.filter(n => selectedIds.includes(n.id) && 
      (!n.parent_node_id || !selectedIds.includes(n.parent_node_id))
  ).sort((a, b) => a.sort_order - b.sort_order);
  
  const serialize = (node: Node, depth: number): string => {
      const indent = '  '.repeat(depth);
      const bullet = '- ';
      const check = node.is_completed ? '[x] ' : node.is_in_progress ? '[-] ' : '';
      let line = `${indent}${bullet}${check}${node.content}`;
      
      // Add note if exists
      let noteLine = '';
      if (node.note && node.note.trim() !== '') {
        const noteIndent = '  '.repeat(depth + 1);
        noteLine = `\n${noteIndent}> ${node.note}`;
      }
      
      const children = nodes.filter(n => n.parent_node_id === node.id).sort((a, b) => a.sort_order - b.sort_order);
      const childrenLines = children.map(c => serialize(c, depth + 1)).join('\n');
      
      const result = noteLine ? `${line}${noteLine}` : line;
      return childrenLines ? `${result}\n${childrenLines}` : result;
  };
  
  return roots.map(r => serialize(r, 0)).join('\n');
};

// Export all nodes to markdown file
export const exportToMarkdown = (nodes: Node[], documentTitle: string): void => {
  // Get all root nodes (nodes without parent)
  const rootNodes = nodes.filter(n => !n.parent_node_id)
    .sort((a, b) => a.sort_order - b.sort_order);
  
  const serialize = (node: Node, depth: number): string => {
    const indent = '  '.repeat(depth);
    const bullet = '- ';
    const check = node.is_completed ? '[x] ' : node.is_in_progress ? '[-] ' : '';
    let line = `${indent}${bullet}${check}${node.content}`;
    
    // Add note if exists
    if (node.note) {
      const noteIndent = '  '.repeat(depth + 1);
      const noteLines = node.note.split('\n').map(l => `${noteIndent}> ${l}`).join('\n');
      line += `\n${noteLines}`;
    }
    
    const children = nodes.filter(n => n.parent_node_id === node.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const childrenLines = children.map(c => serialize(c, depth + 1)).join('\n');
    
    return childrenLines ? `${line}\n${childrenLines}` : line;
  };
  
  const markdown = rootNodes.map(r => serialize(r, 0)).join('\n');
  
  // Create and download file
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${documentTitle || 'document'}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
