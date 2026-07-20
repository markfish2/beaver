/**
 * CodeMirror 6 extension for # tag and @ mention autocomplete.
 *
 * Detects trigger characters, reports cursor position + query to callbacks,
 * and intercepts keyboard navigation when popup is active.
 */
import { EditorView, ViewPlugin, keymap, type ViewUpdate } from '@codemirror/view';

export interface TagMentionState {
  /** 'tag' for # trigger, 'mention' for @ trigger, null if inactive */
  type: 'tag' | 'mention' | null;
  /** The search query typed after the trigger */
  query: string;
  /** Screen coordinates for popup positioning */
  coords: { top: number; left: number } | null;
  /** The start position of the trigger+query in the document */
  from: number;
  /** The current cursor position (end of query) */
  to: number;
}

export interface TagMentionConfig {
  onTagSearch?: (state: TagMentionState) => void;
  onMentionSearch?: (state: TagMentionState) => void;
  /** Called when ArrowUp is pressed with popup active */
  onNavigateUp?: () => void;
  /** Called when ArrowDown is pressed with popup active */
  onNavigateDown?: () => void;
  /** Called when Enter is pressed with popup active */
  onPopupSelect?: () => void;
  /** Called when Escape is pressed with popup active */
  onPopupClose?: () => void;
  /** Check if popup should be active */
  isPopupActive?: () => boolean;
}

const TAG_REGEX = /(?:^|\s)#([a-zA-Z0-9_一-鿿]*)$/;
const MENTION_REGEX = /(?:^|\s)@([^\s@]*)$/;

/**
 * 计算光标处屏幕坐标，用于定位候选弹窗，使其跟随光标移动。
 * coordsAtPos 在位置处于 CodeMirror 已布局的可视区域时返回精确值；
 * 在 compact 模式（flex + minHeight:100% + 内部滚动）下可能抛异常，
 * 此时回退到真实的光标 DOM 元素（.cm-cursor / .cm-dropCursor）的
 * getBoundingClientRect —— 它能精确反映光标当前屏幕位置，弹窗即可跟随。
 */
function getCoords(view: EditorView, pos: number): { top: number; left: number } | null {
  let direct: { top: number; left: number; bottom: number; right: number } | null = null;
  try {
    // coordsAtPos 在位置超出可视文档时会抛出异常（而非返回 null），
    // 必须用 try 捕获，否则会中断整个 plugin update，导致候选框永不触发。
    direct = view.coordsAtPos(pos);
  } catch {
    direct = null;
  }
  if (direct) return { top: direct.bottom, left: direct.left };

  try {
    const content = view.contentDOM;
    // 优先用原生 Selection 的光标矩形：精确跟随当前光标（含水平偏移）。
    // CodeMirror 在 compact 模式下不一定渲染 .cm-cursor 元素，故用 contentEditable 的原生选区。
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      let rect = range.getBoundingClientRect();
      if ((!rect || (rect.left === 0 && rect.top === 0 && rect.width === 0 && rect.height === 0))) {
        // 折叠选区（光标）的 rect 可能为空，用临时插入 span 测量
        const span = document.createElement('span');
        span.textContent = '\u200b';
        range.insertNode(span);
        rect = span.getBoundingClientRect();
        const parent = span.parentNode;
        parent?.removeChild(span);
        parent?.normalize();
      }
      if (rect && (rect.left || rect.top || rect.width || rect.height)) {
        return { top: rect.bottom, left: rect.left };
      }
    }
    // 回退：用光标所在 .cm-line 的位置估算（水平用 content 左偏移）
    const contentRect = content.getBoundingClientRect();
    const lineEls = content.querySelectorAll('.cm-line');
    let targetLine: Element | null = null;
    let bestDist = Infinity;
    for (const el of Array.from(lineEls)) {
      const rect = el.getBoundingClientRect();
      const dist = Math.abs(rect.top - contentRect.top);
      if (dist < bestDist) {
        bestDist = dist;
        targetLine = el;
      }
    }
    const ref = targetLine ?? content;
    const rect = ref.getBoundingClientRect();
    return { top: rect.bottom, left: contentRect.left + 10 };
  } catch {
    return null;
  }
}

function getTriggerState(view: EditorView): { type: 'tag' | 'mention'; query: string; from: number; to: number } | null {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const lineText = line.text.slice(0, from - line.from);

  // Check # tag trigger
  const tagMatch = lineText.match(TAG_REGEX);
  if (tagMatch) {
    const matchStart = from - tagMatch[0].length + (tagMatch[0][0] === '#' ? 0 : 1);
    return { type: 'tag', query: tagMatch[1], from: matchStart, to: from };
  }

  // Check @ mention trigger
  const mentionMatch = lineText.match(MENTION_REGEX);
  if (mentionMatch) {
    const matchStart = from - mentionMatch[0].length + (mentionMatch[0][0] === '@' ? 0 : 1);
    return { type: 'mention', query: mentionMatch[1], from: matchStart, to: from };
  }

  return null;
}

export function tagMentionExtension(config: TagMentionConfig) {
  // Keyboard navigation keymap (higher priority - intercepts before default keymap)
  const navKeymap = keymap.of([
    {
      key: 'ArrowUp',
      run: () => {
        if (config.isPopupActive?.()) { config.onNavigateUp?.(); return true; }
        return false;
      },
    },
    {
      key: 'ArrowDown',
      run: () => {
        if (config.isPopupActive?.()) { config.onNavigateDown?.(); return true; }
        return false;
      },
    },
    {
      key: 'Enter',
      run: () => {
        if (config.isPopupActive?.()) { config.onPopupSelect?.(); return true; }
        return false;
      },
    },
    {
      key: 'Escape',
      run: () => {
        if (config.isPopupActive?.()) { config.onPopupClose?.(); return true; }
        return false;
      },
    },
  ]);

  // Trigger detection plugin
  const plugin = ViewPlugin.define(
    () => ({
      update(update: ViewUpdate) {
        if (!update.docChanged && !update.selectionSet) return;

        const trigger = getTriggerState(update.view);
        if (!trigger) {
          config.onTagSearch?.({ type: null, query: '', coords: null, from: 0, to: 0 });
          config.onMentionSearch?.({ type: null, query: '', coords: null, from: 0, to: 0 });
          return;
        }

        const rawCoords = getCoords(update.view, trigger.to);
        const pos: TagMentionState = {
          type: trigger.type,
          query: trigger.query,
          coords: rawCoords ? { top: rawCoords.top + 4, left: rawCoords.left } : null,
          from: trigger.from,
          to: trigger.to,
        };

        if (trigger.type === 'tag') {
          config.onTagSearch?.(pos);
          config.onMentionSearch?.({ type: null, query: '', coords: null, from: 0, to: 0 });
        } else {
          config.onMentionSearch?.(pos);
          config.onTagSearch?.({ type: null, query: '', coords: null, from: 0, to: 0 });
        }
      },
    }),
  );

  // navKeymap first for higher priority
  return [navKeymap, plugin];
}
