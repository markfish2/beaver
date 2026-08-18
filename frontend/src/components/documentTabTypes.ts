export type DocumentTabMode = 'outline' | 'mindmap';

export interface DocumentTab {
  key: string;
  documentId: string;
  mode: DocumentTabMode;
  title: string;
  type: 'document' | 'note' | 'excalidraw';
  dirty?: boolean;
}

export const DOCUMENT_TABS_STORAGE_KEY = 'beaver:document-tabs:v1';
export const ACTIVE_DOCUMENT_TAB_STORAGE_KEY = 'beaver:active-document-tab:v1';

export function getDocumentTabKey(documentId: string, mode: DocumentTabMode): string {
  return `${documentId}:${mode}`;
}

/**
 * 返回当前会话中最后激活的文档 Tab。
 * 侧边栏和编辑区都从这份会话状态恢复入口，避免“文件”按钮重新回到列表首页。
 */
export function getStoredActiveDocumentTab(): DocumentTab | null {
  if (typeof window === 'undefined') return null;

  try {
    const rawTabs = window.sessionStorage.getItem(DOCUMENT_TABS_STORAGE_KEY);
    const parsedTabs: unknown = rawTabs ? JSON.parse(rawTabs) : [];
    if (!Array.isArray(parsedTabs)) return null;

    const tabs = parsedTabs.filter((tab): tab is DocumentTab => (
      typeof tab === 'object'
      && tab !== null
      && typeof (tab as DocumentTab).key === 'string'
      && typeof (tab as DocumentTab).documentId === 'string'
      && (tab as DocumentTab).documentId.length > 0
      && ((tab as DocumentTab).mode === 'outline' || (tab as DocumentTab).mode === 'mindmap')
    ));
    if (tabs.length === 0) return null;

    const activeKey = window.sessionStorage.getItem(ACTIVE_DOCUMENT_TAB_STORAGE_KEY);
    return tabs.find(tab => tab.key === activeKey) ?? tabs[tabs.length - 1];
  } catch {
    return null;
  }
}
