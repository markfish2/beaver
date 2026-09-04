import {
  normalizeCallouts,
  normalizeCodeBlocks,
  normalizeHighlight,
  normalizeListSeparators,
  normalizeTaskLists,
} from './markdownPreprocess';
import { extractTagCandidates } from './tagCandidates';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

interface MarkdownNodePosition {
  start?: { offset?: number; line?: number };
  end?: { offset?: number; line?: number };
}

interface MarkdownTreeNode {
  position?: MarkdownNodePosition;
}

interface MarkdownRoot {
  children?: MarkdownTreeNode[];
}

const markdownBlockParser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkBreaks)
  .use(remarkMath);

export interface NoteTocItem {
  id: string;
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  sourceLine: number;
}

export interface MarkdownNoteBlock {
  id: string;
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
  headingId?: string;
}

export interface MarkdownNoteAnalysis {
  source: string;
  processedContent: string;
  renderedHeadings: NoteTocItem[];
  tocItems: NoteTocItem[];
  blocks: MarkdownNoteBlock[];
  tags: string[];
}

export function preprocessNoteMarkdown(content: string): string {
  return normalizeCodeBlocks(
    normalizeListSeparators(
      normalizeHighlight(
        normalizeTaskLists(normalizeCallouts(content)),
      ),
    ),
  );
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export function extractMarkdownHeadings(markdown: string): NoteTocItem[] {
  const lines = markdown.split(/\r?\n/);
  const items: NoteTocItem[] = [];
  let inFence = false;
  let fenceMarker: '```' | '~~~' | null = null;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmedStart = line.trimStart();
    const fence = trimmedStart.match(/^(```|~~~)/);
    if (fence) {
      const marker = fence[1] as '```' | '~~~';
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (fenceMarker === marker) {
        inFence = false;
        fenceMarker = null;
      }
      continue;
    }
    if (inFence) continue;

    const match = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;

    const text = stripInlineMarkdown(match[2]);
    if (!text) continue;

    const sourceLine = index + 1;
    items.push({
      id: `note-heading-${sourceLine}-${items.length}`,
      text,
      level: match[1].length as NoteTocItem['level'],
      sourceLine,
    });
  }

  return items;
}

function fallbackMarkdownBlock(markdown: string): MarkdownNoteBlock[] {
  const startOffset = markdown.search(/\S/);
  if (startOffset < 0) return [];
  const endOffset = markdown.trimEnd().length;
  const firstLine = markdown.slice(0, startOffset).split(/\r?\n/).length;
  const endLine = markdown.slice(0, endOffset).split(/\r?\n/).length;
  return [{
    id: 'note-block-1-0',
    startOffset,
    endOffset,
    startLine: firstLine,
    endLine,
  }];
}

/**
 * Find top-level Markdown ranges without sending a full AST to the main thread.
 * Each range can be parsed independently by the visible preview blocks.
 */
export function extractMarkdownBlocks(markdown: string): MarkdownNoteBlock[] {
  if (!markdown.trim()) return [];

  try {
    const tree = markdownBlockParser.parse(markdown) as unknown as MarkdownRoot;
    const children = tree.children ?? [];
    const blocks: MarkdownNoteBlock[] = [];

    for (let index = 0; index < children.length; index++) {
      const position = children[index].position;
      const startOffset = position?.start?.offset;
      const endOffset = position?.end?.offset;
      const startLine = position?.start?.line;
      const endLine = position?.end?.line;
      if (
        typeof startOffset !== 'number'
        || typeof endOffset !== 'number'
        || typeof startLine !== 'number'
        || typeof endLine !== 'number'
        || endOffset <= startOffset
      ) {
        return fallbackMarkdownBlock(markdown);
      }

      blocks.push({
        id: `note-block-${startLine}-${index}`,
        startOffset,
        endOffset,
        startLine,
        endLine,
      });
    }

    return blocks.length > 0 ? blocks : fallbackMarkdownBlock(markdown);
  } catch {
    // A malformed or unsupported construct should still be readable as one block.
    return fallbackMarkdownBlock(markdown);
  }
}

export function analyzeMarkdownNote(content: string): MarkdownNoteAnalysis {
  const processedContent = preprocessNoteMarkdown(content);
  const renderedHeadings = extractMarkdownHeadings(processedContent);
  const rawHeadings = extractMarkdownHeadings(content);
  const headingIdByLine = new Map(renderedHeadings.map(item => [item.sourceLine, item.id]));
  const tocItems = rawHeadings.map((item, index) => ({
    ...item,
    id: renderedHeadings[index]?.id ?? item.id,
  }));
  const blocks = extractMarkdownBlocks(processedContent).map(block => ({
    ...block,
    headingId: headingIdByLine.get(block.startLine),
  }));

  return {
    source: content,
    processedContent,
    renderedHeadings,
    tocItems,
    blocks,
    tags: extractTagCandidates([content]),
  };
}
