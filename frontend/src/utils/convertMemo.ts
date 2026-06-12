interface NodeData {
  tempId: string;
  content: string;
  parentTempId: string | null;
  sort_order: number;
  is_todo: boolean;
  is_completed: boolean;
  note: string;
  content_type: 'text' | 'image' | 'attachment';
  file_path?: string;
  file_name?: string;
}

/**
 * Extract title from memo content: first line, stripped of markdown prefixes.
 */
export function extractTitle(content: string): string {
  const firstLine = content.split('\n')[0].trim();
  // Strip heading markers, list markers, blockquote markers
  return firstLine
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+(\[[ xX]\]\s+)?/, '')
    .replace(/^>\s*/, '')
    .replace(/^[0-9]+\.\s+/, '')
    .replace(/[*_~`]/g, '')
    .trim()
    || '未命名笔记';
}

/**
 * Check if content has list items (lines starting with - / * / + at any indentation).
 */
function hasListItems(content: string): boolean {
  const lines = content.split('\n');
  for (const line of lines) {
    if (/^\s*[-*+]\s+/.test(line)) return true;
  }
  return false;
}

/**
 * Parse indentation level: count leading spaces, each 2 spaces = 1 level.
 */
function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  if (!match) return 0;
  return Math.floor(match[1].length / 2);
}

let tempIdCounter = 0;
function nextTempId(): string {
  return `temp-${++tempIdCounter}`;
}

/**
 * Parse list lines into a flat node array with parent references.
 */
function parseListToNodes(lines: string[]): NodeData[] {
  const nodes: NodeData[] = [];
  // Stack: [level, tempId]
  const stack: { level: number; tempId: string }[] = [];
  let sort = 0;

  for (const line of lines) {
    const level = getIndentLevel(line);
    const stripped = line.replace(/^\s*[-*+]\s+/, '');

    // Parse task list
    const taskMatch = stripped.match(/^\[([ xX])\]\s*(.*)/);
    const isTodo = !!taskMatch;
    const isCompleted = taskMatch ? taskMatch[1].toLowerCase() === 'x' : false;
    const text = taskMatch ? taskMatch[2] : stripped;

    // Parse image/attachment
    let content_type: 'text' | 'image' | 'attachment' = 'text';
    let file_path: string | undefined;
    let file_name: string | undefined;
    const imgMatch = text.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    const fileMatch = text.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (imgMatch && !text.slice(imgMatch[0].length).trim()) {
      content_type = 'image';
      file_path = imgMatch[2];
      file_name = imgMatch[1];
    } else if (fileMatch && !text.slice(fileMatch[0].length).trim()) {
      content_type = 'attachment';
      file_path = fileMatch[2];
      file_name = fileMatch[1];
    }

    // Find parent: pop stack until we find a parent at a lower level
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    const parentTempId = stack.length > 0 ? stack[stack.length - 1].tempId : null;

    const tempId = nextTempId();
    nodes.push({
      tempId,
      content: content_type !== 'text' ? (file_name || '') : text,
      parentTempId,
      sort_order: sort++,
      is_todo: isTodo,
      is_completed: isCompleted,
      note: '',
      content_type,
      file_path,
      file_name,
    });

    stack.push({ level, tempId });
  }

  return nodes;
}

/**
 * Parse paragraphs (split by blank lines) into flat nodes.
 */
function parseParagraphsToNodes(content: string): NodeData[] {
  const nodes: NodeData[] = [];
  const paragraphs = content.split(/\n\s*\n/);
  let sort = 0;
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    nodes.push({
      tempId: nextTempId(),
      content: trimmed,
      parentTempId: null,
      sort_order: sort++,
      is_todo: false,
      is_completed: false,
      note: '',
      content_type: 'text',
    });
  }
  return nodes;
}

/**
 * Convert memo content to document title + flat node array.
 * First line is used as title and excluded from nodes.
 */
export function parseMemoToNodes(content: string): { title: string; nodes: NodeData[] } {
  tempIdCounter = 0;
  const title = extractTitle(content);
  const lines = content.split('\n');

  // Find where content starts (skip first line used as title)
  let contentStart = 1;
  while (contentStart < lines.length && lines[contentStart].trim() === '') {
    contentStart++;
  }
  const bodyLines = lines.slice(contentStart);
  const body = bodyLines.join('\n').trim();

  if (!body) {
    return { title, nodes: [] };
  }

  if (hasList(body)) {
    return { title, nodes: parseListToNodes(bodyLines.filter(l => l.trim())) };
  }
  return { title, nodes: parseParagraphsToNodes(body) };
}

function hasList(content: string): boolean {
  return /^\s*[-*+]\s+/m.test(content);
}
