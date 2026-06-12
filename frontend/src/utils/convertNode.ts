import type { Node } from '../api/data';
import { getFileUrl } from '../api/data';

/**
 * Convert a node tree into memo markdown.
 * Recursively builds indented list from root nodes and their children.
 */
export function nodesToMemoMarkdown(nodes: Node[], rootParentId: string | null = null): string {
  const childrenMap = new Map<string | null, Node[]>();
  for (const node of nodes) {
    const key = node.parent_node_id || null;
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    childrenMap.get(key)!.push(node);
  }
  // Sort by sort_order
  for (const list of childrenMap.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order);
  }

  const lines: string[] = [];
  const roots = childrenMap.get(rootParentId) || [];

  for (let i = 0; i < roots.length; i++) {
    const node = roots[i];
    const isRoot = rootParentId === null;
    if (isRoot && i === 0) {
      // First root node becomes the memo heading/plain text
      lines.push(nodeToLine(node, 0, true));
    } else {
      lines.push(nodeToLine(node, isRoot ? 0 : 0, false));
    }
    renderChildren(node.id, childrenMap, lines, isRoot ? 1 : 1);
  }

  return lines.join('\n');
}

function nodeToLine(node: Node, indent: number, isFirstRoot: boolean): string {
  const prefix = isFirstRoot ? '' : '  '.repeat(indent);

  // Image node
  if (node.content_type === 'image' && node.file_path) {
    const url = getFileUrl(node.file_path);
    const alt = node.file_name || '图片';
    return `${prefix}![${alt}](${url})`;
  }

  // Attachment node
  if (node.content_type === 'attachment' && node.file_path) {
    const url = getFileUrl(node.file_path);
    const name = node.file_name || '附件';
    return `${prefix}[${name}](${url})`;
  }

  // Todo node
  if (node.is_todo) {
    const check = node.is_completed ? '[x]' : '[ ]';
    return `${prefix}- ${check} ${node.content}`;
  }

  // Regular node
  if (isFirstRoot) {
    return node.content;
  }
  return `${prefix}- ${node.content}`;
}

function renderChildren(
  parentId: string,
  childrenMap: Map<string | null, Node[]>,
  lines: string[],
  indent: number
): void {
  const children = childrenMap.get(parentId) || [];
  for (const child of children) {
    lines.push(nodeToLine(child, indent, false));
    // Render note if present
    if (child.note && child.note.trim()) {
      const notePrefix = '  '.repeat(indent + 1);
      lines.push(`${notePrefix}${child.note.trim()}`);
    }
    renderChildren(child.id, childrenMap, lines, indent + 1);
  }
}
