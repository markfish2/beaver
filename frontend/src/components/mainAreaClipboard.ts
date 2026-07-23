import type { Node } from '../api/data';

export interface ParsedNode {
  content: string;
  note?: string;
  is_completed?: boolean;
  is_todo?: boolean;
  children: ParsedNode[];
}

export function parseMarkdown(text: string): ParsedNode[] {
  const root: ParsedNode[] = [];
  const stack: Array<{ node: ParsedNode; indent: number }> = [];
  text.split('\n').forEach(line => {
    if (!line.trim()) return;
    const indent = (line.match(/^(\s*)/)?.[1] || '').replace(/\t/g, '    ').length;
    const trimmed = line.trim();
    if (trimmed.startsWith('>')) {
      const parent = stack.at(-1)?.node;
      if (parent) {
        const note = trimmed.replace(/^>\s*/, '');
        parent.note = parent.note ? `${parent.note}\n${note}` : note;
      }
      return;
    }
    const checkbox = trimmed.match(/^[-*]\s+\[([ xX])\]\s*(.*)$/);
    const list = checkbox ? null : trimmed.match(/^[-*]\s+(.*)$/);
    const heading = checkbox || list ? null : trimmed.match(/^(#{1,6})\s+(.*)$/);
    const node: ParsedNode = {
      content: (checkbox?.[2] || list?.[1] || heading?.[2] || trimmed).trim(),
      is_todo: Boolean(checkbox),
      is_completed: checkbox?.[1].toLowerCase() === 'x',
      children: [],
    };
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack.at(-1)?.node;
    (parent ? parent.children : root).push(node);
    stack.push({ node, indent });
  });
  return root;
}

export function flattenParsedNodes(parsedNodes: ParsedNode[], documentId: string, parentId: string | null, startOrder: number): Partial<Node>[] {
  const result: Partial<Node>[] = [];
  let order = startOrder;
  const visit = (node: ParsedNode, parent: string | null) => {
    const id = crypto.randomUUID();
    result.push({ id, document_id: documentId, content: node.content, note: node.note, parent_node_id: parent,
      sort_order: order, is_completed: node.is_completed || false, is_todo: node.is_todo || false,
      color: null, is_collapsed: false });
    order += 10000;
    node.children.forEach(child => visit(child, id));
  };
  parsedNodes.forEach(node => visit(node, parentId));
  return result;
}
