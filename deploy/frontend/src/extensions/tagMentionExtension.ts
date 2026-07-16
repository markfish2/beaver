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

        const coords = update.view.coordsAtPos(trigger.to);
        const pos: TagMentionState = {
          type: trigger.type,
          query: trigger.query,
          coords: coords ? { top: coords.bottom + 4, left: coords.left } : null,
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
