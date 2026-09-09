import type { NoteHighlightSelection } from './noteHighlights';

export function shouldPlaceTabletHighlightActionAtBottom(selection: NoteHighlightSelection): boolean {
  return selection.rect.top < Math.max(128, window.innerHeight * 0.28);
}
