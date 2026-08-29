const DRAFT_PREFIX = 'beaver-editor-draft-v1';

function draftKey(scope: string, id: string): string {
  return `${DRAFT_PREFIX}:${scope}:${id}`;
}

export function getEditorDraft(scope: string, id: string): string | null {
  try { return localStorage.getItem(draftKey(scope, id)); } catch { return null; }
}

export function saveEditorDraft(scope: string, id: string, content: string): void {
  try {
    if (content) localStorage.setItem(draftKey(scope, id), content);
    else localStorage.removeItem(draftKey(scope, id));
  } catch { /* 本地草稿只是兜底，不影响正式保存。 */ }
}

export function clearEditorDraft(scope: string, id: string): void {
  try { localStorage.removeItem(draftKey(scope, id)); } catch { /* ignore */ }
}
