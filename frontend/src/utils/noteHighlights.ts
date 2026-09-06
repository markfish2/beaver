import type { NoteHighlight } from '../api/data';

export interface NoteHighlightAnchor {
  quote: string;
  prefix: string;
  suffix: string;
  block_line: number | null;
}

export interface NoteHighlightSelection {
  anchor: NoteHighlightAnchor;
  rect: DOMRect;
}

interface TextEntry {
  node: Text;
  rawStart: number;
  rawEnd: number;
}

interface RenderedTextIndex {
  text: string;
  entries: Array<TextEntry | null>;
}

export interface NoteHighlightMatch {
  start: number;
  end: number;
  text: string;
  prefix: string;
  suffix: string;
  block_line: number | null;
  ranges: Range[];
}

export function formatNoteHighlightsAsMemo(title: string, documentId: string, highlights: NoteHighlight[]): string {
  const safeTitle = (title.trim() || '无标题').replace(/[\r\n]+/g, ' ');
  const linkTitle = safeTitle.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
  const quoteBlocks = highlights
    .map(highlight => highlight.quote.trim())
    .filter(Boolean)
    .map(quote => quote.split(/\r?\n/).map(line => `> ${line}`).join('\n'));

  return [
    `## ${safeTitle}`,
    ...quoteBlocks,
    `[@${linkTitle}](/d/${documentId})`,
  ].join('\n\n');
}

function sourceHighlightPosition(normalizedSource: string, highlight: NoteHighlight): number | null {
  const quote = normalizeHighlightText(highlight.quote);
  if (!quote) return null;
  const prefix = normalizeHighlightText(highlight.prefix);
  const suffix = normalizeHighlightText(highlight.suffix);
  const exactMatches = allOccurrences(normalizedSource, quote);
  if (exactMatches.length > 0) {
    return exactMatches.reduce((best, candidate) => {
      const before = normalizedSource.slice(Math.max(0, candidate - prefix.length), candidate);
      const after = normalizedSource.slice(candidate + quote.length, candidate + quote.length + suffix.length);
      const score = commonSuffixLength(before, prefix) + commonPrefixLength(after, suffix);
      return score > best.score ? { position: candidate, score } : best;
    }, { position: exactMatches[0], score: -1 }).position;
  }

  // Keep the position useful after a small text edit by matching the old
  // context around the changed quote.
  const prefixEnds = prefix ? allOccurrences(normalizedSource, prefix).map(position => position + prefix.length) : [];
  const suffixStarts = suffix ? allOccurrences(normalizedSource, suffix) : [];
  let best: { position: number; score: number } | null = null;
  for (const start of prefixEnds) {
    for (const end of suffixStarts) {
      if (end <= start || !normalizedSource.slice(start, end).trim()) continue;
      const lengthScore = Math.max(0, 1000 - Math.abs((end - start) - quote.length));
      const score = lengthScore
        + commonSuffixLength(normalizedSource.slice(Math.max(0, start - prefix.length), start), prefix) * 20
        + commonPrefixLength(normalizedSource.slice(end, end + suffix.length), suffix) * 20;
      if (!best || score > best.score) best = { position: start, score };
    }
  }
  return best?.position ?? null;
}

export function sortNoteHighlightsByDocumentOrder(highlights: NoteHighlight[], normalizedSource = ''): NoteHighlight[] {
  return highlights
    .map((highlight, index) => ({
      highlight,
      index,
      position: normalizedSource ? sourceHighlightPosition(normalizedSource, highlight) : null,
    }))
    .sort((left, right) => {
      const leftLine = left.highlight.block_line;
      const rightLine = right.highlight.block_line;
      if (left.position !== null && right.position !== null && left.position !== right.position) return left.position - right.position;
      // The source position reflects the current body and therefore wins over
      // a block line that may be stale after the note was edited.
      if (left.position === null || right.position === null) {
        if (leftLine !== null && rightLine !== null && leftLine !== rightLine) return leftLine - rightLine;
      }
      if (leftLine !== null && rightLine === null) return -1;
      if (leftLine === null && rightLine !== null) return 1;
      if (left.position !== null && right.position === null) return -1;
      if (left.position === null && right.position !== null) return 1;
      return left.index - right.index;
    })
    .map(item => item.highlight);
}

const IGNORED_ANCESTORS = 'button, svg, script, style, .related-notes, .markdown-note-title, [data-note-highlight-ignore]';
const INLINE_SEPARATOR_TAGS = new Set(['BR', 'HR']);
const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'FIGCAPTION', 'FIGURE', 'FOOTER',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'LI', 'MAIN', 'OL', 'P', 'PRE', 'SECTION',
  'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
]);
const CONTEXT_LENGTH = 80;

function renderedEntryText(entry: TextEntry): string {
  const rawText = entry.node.data.slice(entry.rawStart, entry.rawEnd);
  return /^\s+$/.test(rawText) ? ' ' : rawText;
}

export function normalizeHighlightText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * A lightweight source-side view used only to decide whether an unloaded
 * virtualized block can still contain an annotation. It is not used for
 * painting, so Markdown rendering details remain the source of truth there.
 */
export function normalizeHighlightSource(value: string): string {
  return normalizeHighlightText(
    value
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, ' $1 ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, ' $1 ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/(^|\n)\s{0,3}(?:#{1,6}\s|[-*+]\s+(?:\[[ xX]\]\s+)?)/g, '$1 ')
      .replace(/[`*_~]/g, ''),
  );
}

function isIgnoredTextNode(node: Text, root: HTMLElement): boolean {
  const parent = node.parentElement;
  return !parent || !root.contains(parent) || Boolean(parent.closest(IGNORED_ANCESTORS));
}

function blockAncestor(node: Text, root: HTMLElement): Element | null {
  let current = node.parentElement;
  while (current && current !== root) {
    if (BLOCK_TAGS.has(current.tagName)) return current;
    current = current.parentElement;
  }
  return null;
}

function appendSpace(entries: Array<TextEntry | null>): void {
  const last = entries[entries.length - 1];
  if (!last || /\s/.test(last.node.data.slice(last.rawStart, last.rawEnd))) return;
  entries.push(null);
}

function appendText(entries: Array<TextEntry | null>, node: Text): void {
  let whitespaceEntry: TextEntry | null = null;
  const appendWhitespace = () => {
    if (!whitespaceEntry) return;
    // A block boundary already contributes the single normalized space.
    if (entries.length > 0 && entries[entries.length - 1] !== null) entries.push(whitespaceEntry);
    whitespaceEntry = null;
  };

  for (let index = 0; index < node.data.length; index += 1) {
    const character = node.data[index];
    if (/\s/.test(character)) {
      whitespaceEntry ??= { node, rawStart: index, rawEnd: index + 1 };
      whitespaceEntry.rawEnd = index + 1;
      continue;
    }
    appendWhitespace();
    entries.push({ node, rawStart: index, rawEnd: index + 1 });
  }
  appendWhitespace();
}

export function buildRenderedTextIndex(root: HTMLElement): RenderedTextIndex {
  const walker = root.ownerDocument.createTreeWalker(root, 0xFFFFFFFF /* NodeFilter.SHOW_ALL */);
  const entries: Array<TextEntry | null> = [];
  let previous: Text | null = null;
  let pendingInlineSeparator = false;
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === 1) {
      const element = current as Element;
      if (INLINE_SEPARATOR_TAGS.has(element.tagName) && !element.closest(IGNORED_ANCESTORS)) {
        pendingInlineSeparator = true;
      }
    } else if (current.nodeType === 3) {
      const node = current as Text;
      if (!isIgnoredTextNode(node, root)) {
        if (pendingInlineSeparator || (previous && blockAncestor(previous, root) !== blockAncestor(node, root))) appendSpace(entries);
        appendText(entries, node);
        previous = node;
        pendingInlineSeparator = false;
      }
    }
    current = walker.nextNode();
  }

  while (entries.length > 0 && (!entries[entries.length - 1] || entries[entries.length - 1]?.node.data.slice(entries[entries.length - 1].rawStart, entries[entries.length - 1].rawEnd).trim() === '')) entries.pop();
  while (entries.length > 0 && (!entries[0] || entries[0]?.node.data.slice(entries[0].rawStart, entries[0].rawEnd).trim() === '')) entries.shift();
  return {
    text: entries.map(entry => entry ? renderedEntryText(entry) : ' ').join(''),
    entries,
  };
}

function boundaryOffset(index: RenderedTextIndex, root: HTMLElement, container: Node, offset: number, edge: 'start' | 'end'): number {
  if (container.nodeType === 3 /* Node.TEXT_NODE */) {
    const textNode = container as Text;
    for (let entryIndex = 0; entryIndex < index.entries.length; entryIndex += 1) {
      const entry = index.entries[entryIndex];
      if (!entry || entry.node !== textNode) continue;
      if (offset <= entry.rawStart) return entryIndex;
      if (offset <= entry.rawEnd) return entryIndex + 1;
    }
  }

  try {
    // Element boundaries are common when a user selects a whole paragraph.
    // Compare actual DOM boundary points instead of counting range.toString(),
    // which includes ignored title/buttons and has browser-specific newlines.
    const boundary = root.ownerDocument.createRange();
    boundary.setStart(container, offset);
    boundary.collapse(true);
    for (let entryIndex = 0; entryIndex < index.entries.length; entryIndex += 1) {
      const entry = index.entries[entryIndex];
      if (!entry) continue;
      const point = root.ownerDocument.createRange();
      point.setStart(entry.node, entry.rawStart);
      point.collapse(true);
      // START_TO_START is the numeric value 0 in the DOM Range API.
      if (point.compareBoundaryPoints(0, boundary) >= 0) {
        return edge === 'end' && index.entries[entryIndex - 1] === null
          ? entryIndex - 1
          : entryIndex;
      }
    }
    return index.entries.length;
  } catch {
    try {
      const range = root.ownerDocument.createRange();
      range.selectNodeContents(root);
      range.setEnd(container, offset);
      return Math.max(0, Math.min(index.text.length, normalizeHighlightText(range.toString()).length));
    } catch {
      return 0;
    }
  }
}

function closestBlockLine(node: Node, root: HTMLElement): number | null {
  const element = node.nodeType === 1 /* Node.ELEMENT_NODE */ ? node as Element : node.parentElement;
  const block = element?.closest('[data-note-block-start-line]');
  if (!block || !root.contains(block)) return null;
  const line = Number(block.getAttribute('data-note-block-start-line'));
  return Number.isFinite(line) && line > 0 ? line : null;
}

export function captureNoteHighlightSelection(root: HTMLElement): NoteHighlightSelection | null {
  const selection = root.ownerDocument.defaultView?.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const index = buildRenderedTextIndex(root);
  let start = boundaryOffset(index, root, range.startContainer, range.startOffset, 'start');
  let end = boundaryOffset(index, root, range.endContainer, range.endOffset, 'end');
  if (end < start) [start, end] = [end, start];

  // Use the rendered index as the source of truth. Native Selection#toString()
  // inserts (or omits) paragraph separators differently across browsers, while
  // the index already mirrors the spaces used when the annotation is painted.
  let selectedStart = start;
  let selectedEnd = end;
  while (selectedStart < selectedEnd && /\s/.test(index.text[selectedStart] ?? '')) selectedStart += 1;
  while (selectedEnd > selectedStart && /\s/.test(index.text[selectedEnd - 1] ?? '')) selectedEnd -= 1;
  let quote = normalizeHighlightText(index.text.slice(selectedStart, selectedEnd));
  const nativeQuote = normalizeHighlightText(range.toString());

  // If an unusual DOM boundary caused the index span to include unrelated
  // content, fall back to the browser's text and re-anchor it near the range.
  // Whitespace-only differences intentionally keep the indexed version so a
  // selection spanning multiple paragraphs remains valid.
  if (quote && nativeQuote && quote.replace(/\s/g, '') !== nativeQuote.replace(/\s/g, '')) {
    const candidates: number[] = [];
    let cursor = index.text.indexOf(nativeQuote);
    while (cursor >= 0) {
      candidates.push(cursor);
      cursor = index.text.indexOf(nativeQuote, cursor + 1);
    }
    if (candidates.length === 0) return null;
    selectedStart = candidates.reduce((best, candidate) => Math.abs(candidate - start) < Math.abs(best - start) ? candidate : best, candidates[0]);
    selectedEnd = selectedStart + nativeQuote.length;
    quote = nativeQuote;
  }
  if (!quote) return null;

  let blockLine = closestBlockLine(range.startContainer, root);
  if (blockLine === null) {
    for (let position = selectedStart; position < selectedEnd; position += 1) {
      const entry = index.entries[position];
      if (!entry) continue;
      blockLine = closestBlockLine(entry.node, root);
      if (blockLine !== null) break;
    }
  }

  return {
    anchor: {
      quote,
      prefix: index.text.slice(Math.max(0, selectedStart - CONTEXT_LENGTH), selectedStart),
      suffix: index.text.slice(selectedEnd, selectedEnd + CONTEXT_LENGTH),
      block_line: blockLine,
    },
    rect: range.getBoundingClientRect(),
  };
}

function allOccurrences(text: string, query: string): number[] {
  if (!query) return [];
  const positions: number[] = [];
  let cursor = text.indexOf(query);
  while (cursor >= 0) {
    positions.push(cursor);
    cursor = text.indexOf(query, cursor + 1);
  }
  return positions;
}

export function sourceMayContainNoteHighlight(normalizedSource: string, highlight: NoteHighlight): boolean {
  const quote = normalizeHighlightText(highlight.quote);
  if (!quote) return false;
  if (normalizedSource.includes(quote)) return true;

  // The quoted text may have been edited. If the old prefix and suffix still
  // leave non-empty content between them, preserve the annotation for a later
  // DOM re-anchor; an empty gap means the selected content was deleted.
  const prefix = normalizeHighlightText(highlight.prefix);
  const suffix = normalizeHighlightText(highlight.suffix);
  const prefixEnds = prefix ? allOccurrences(normalizedSource, prefix).map(position => position + prefix.length) : [0];
  const suffixStarts = suffix ? allOccurrences(normalizedSource, suffix) : [normalizedSource.length];
  return prefixEnds.some(start => suffixStarts.some(end => end > start && normalizedSource.slice(start, end).trim().length > 0));
}

function commonSuffixLength(left: string, right: string): number {
  let count = 0;
  while (count < left.length && count < right.length && left[left.length - count - 1] === right[right.length - count - 1]) count += 1;
  return count;
}

function commonPrefixLength(left: string, right: string): number {
  let count = 0;
  while (count < left.length && count < right.length && left[count] === right[count]) count += 1;
  return count;
}

function blockLineAt(index: RenderedTextIndex, position: number): number | null {
  const entry = index.entries[position];
  const block = entry?.node.parentElement?.closest('[data-note-block-start-line]');
  if (!block) return null;
  const line = Number(block.getAttribute('data-note-block-start-line'));
  return Number.isFinite(line) && line > 0 ? line : null;
}

function blockLineScore(index: RenderedTextIndex, position: number, expectedLine: number | null): number {
  const actualLine = blockLineAt(index, position);
  if (actualLine === null || expectedLine === null) return 0;
  return Math.max(0, CONTEXT_LENGTH - Math.abs(actualLine - expectedLine));
}

function buildMatch(index: RenderedTextIndex, start: number, end: number): Omit<NoteHighlightMatch, 'ranges'> {
  return {
    start,
    end,
    text: index.text.slice(start, end).trim(),
    prefix: index.text.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: index.text.slice(end, end + CONTEXT_LENGTH),
    block_line: blockLineAt(index, start),
  };
}

export function resolveNoteHighlight(index: RenderedTextIndex, highlight: NoteHighlight): Omit<NoteHighlightMatch, 'ranges'> | null {
  const quote = normalizeHighlightText(highlight.quote);
  if (!quote) return null;
  const exactMatches = allOccurrences(index.text, quote);
  if (exactMatches.length > 0) {
    const best = exactMatches.reduce((current, candidate) => {
      const before = index.text.slice(Math.max(0, candidate - highlight.prefix.length), candidate);
      const after = index.text.slice(candidate + quote.length, candidate + quote.length + highlight.suffix.length);
      const blockScore = blockLineScore(index, candidate, highlight.block_line);
      const score = commonSuffixLength(before, highlight.prefix) + commonPrefixLength(after, highlight.suffix) + blockScore;
      return score > current.score ? { candidate, score } : current;
    }, { candidate: exactMatches[0], score: -1 });
    return buildMatch(index, best.candidate, best.candidate + quote.length);
  }

  // If a few characters inside the annotation changed, the surrounding context
  // still identifies the new span. An empty span means the original text was deleted.
  const prefixEnds = highlight.prefix ? allOccurrences(index.text, highlight.prefix).map(position => position + highlight.prefix.length) : [0];
  const suffixStarts = highlight.suffix ? allOccurrences(index.text, highlight.suffix) : [index.text.length];
  const expectedLength = quote.length;
  let best: { start: number; end: number; score: number } | null = null;
  for (const start of prefixEnds) {
    for (const end of suffixStarts) {
      if (end <= start || end - start > Math.max(2000, expectedLength * 4)) continue;
      const candidate = index.text.slice(start, end);
      if (!candidate.trim()) continue;
      const lengthScore = Math.max(0, 1000 - Math.abs(candidate.length - expectedLength));
      const contextScore = commonSuffixLength(index.text.slice(Math.max(0, start - highlight.prefix.length), start), highlight.prefix)
        + commonPrefixLength(index.text.slice(end, end + highlight.suffix.length), highlight.suffix);
      const blockScore = blockLineScore(index, start, highlight.block_line) * 20;
      const score = lengthScore + contextScore * 20 + blockScore;
      if (!best || score > best.score) best = { start, end, score };
    }
  }
  return best ? buildMatch(index, best.start, best.end) : null;
}

function rangesForMatch(index: RenderedTextIndex, match: Omit<NoteHighlightMatch, 'ranges'>): Range[] {
  const ranges: Range[] = [];
  let current: { node: Text; start: number; end: number } | null = null;
  const flush = () => {
    if (!current || current.start >= current.end) return;
    const range = current.node.ownerDocument.createRange();
    range.setStart(current.node, current.start);
    range.setEnd(current.node, current.end);
    ranges.push(range);
    current = null;
  };

  for (let indexValue = match.start; indexValue < match.end; indexValue += 1) {
    const entry = index.entries[indexValue];
    if (!entry) {
      flush();
      continue;
    }
    if (current && current.node === entry.node && current.end === entry.rawStart) {
      current.end = entry.rawEnd;
    } else {
      flush();
      current = { node: entry.node, start: entry.rawStart, end: entry.rawEnd };
    }
  }
  flush();
  return ranges;
}

interface HighlightRegistry {
  delete(name: string): void;
  set(name: string, value: object): void;
}

interface HighlightConstructor {
  new (...ranges: Range[]): object;
}

function cssHighlightRegistry(): { registry: HighlightRegistry; Highlight: HighlightConstructor } | null {
  const css = (globalThis as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  const Highlight = (globalThis as unknown as { Highlight?: HighlightConstructor }).Highlight;
  if (!css?.highlights || !Highlight) return null;
  return { registry: css.highlights, Highlight };
}

function clearFallbackHighlights(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-note-fallback-highlight]').forEach(mark => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    mark.remove();
    parent.normalize();
  });
}

function applyFallbackHighlights(matches: Map<string, NoteHighlightMatch>, root: HTMLElement): void {
  clearFallbackHighlights(root);
  for (const match of matches.values()) {
    for (const range of match.ranges) {
      try {
        const mark = root.ownerDocument.createElement('span');
        mark.dataset.noteFallbackHighlight = 'true';
        mark.className = 'note-reading-highlight';
        range.surroundContents(mark);
      } catch {
        // Overlapping annotations cannot be nested reliably in a fallback DOM wrapper.
      }
    }
  }
}

export function applyNoteHighlights(root: HTMLElement, highlights: NoteHighlight[]): Map<string, NoteHighlightMatch> {
  // On browsers without CSS Custom Highlight, the fallback wraps text nodes.
  // Unwrap those markers before rebuilding the index so ranges never point at
  // nodes that are about to be normalized away.
  clearFallbackHighlights(root);
  const index = buildRenderedTextIndex(root);
  const matches = new Map<string, NoteHighlightMatch>();
  for (const highlight of highlights) {
    const resolved = resolveNoteHighlight(index, highlight);
    if (!resolved) continue;
    matches.set(highlight.id, { ...resolved, ranges: rangesForMatch(index, resolved) });
  }

  const registry = cssHighlightRegistry();
  if (registry) {
    registry.registry.delete('note-reading-highlight');
    const ranges = [...matches.values()].flatMap(match => match.ranges);
    if (ranges.length > 0) registry.registry.set('note-reading-highlight', new registry.Highlight(...ranges));
    clearFallbackHighlights(root);
  } else {
    applyFallbackHighlights(matches, root);
  }
  return matches;
}

export function clearNoteHighlights(root: HTMLElement | null): void {
  cssHighlightRegistry()?.registry.delete('note-reading-highlight');
  if (!root) return;
  clearFallbackHighlights(root);
}

export function scrollToNoteHighlight(root: HTMLElement, match: NoteHighlightMatch): void {
  const range = match.ranges[0];
  if (!range) return;
  const rect = range.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  root.scrollTo({ top: root.scrollTop + rect.top - rootRect.top - 80, behavior: 'smooth' });
}
