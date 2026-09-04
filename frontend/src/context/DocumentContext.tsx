import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { getDocuments } from '../api/data';
import { dataCache } from '../api/cache';
import type { Document } from '../api/data';
import { useAuth } from './AuthContext';

interface DocumentContextType {
  documents: Document[];
  isLoading: boolean;
  refreshDocuments: (search?: string) => Promise<void>;
  updateDocumentTitle: (id: string, newTitle: string) => void;
  updateDocumentLocal: (id: string, changes: Partial<Document>) => void;
  addDocument: (doc: Document) => void;
  removeDocument: (id: string) => void;
  moveDocument: (id: string, parentId: string | null) => void;
}

const DocumentContext = createContext<DocumentContextType | undefined>(undefined);

// 后台同步拿到的新数组不能直接写入状态。插件或其他设备没有新增/修改文档时，
// 复用原数组引用，避免文件树、tab 和当前内容页被无意义地重新渲染。
const sameDocuments = (left: Document[], right: Document[]): boolean => {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((document, index) => JSON.stringify(document) === JSON.stringify(right[index]));
};

export const DocumentProvider = ({ children }: { children: ReactNode }) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { isAuthenticated } = useAuth();

  const fetchDocuments = useCallback(async (search: string | undefined, silent: boolean) => {
    if (!silent) setIsLoading(true);
    try {
      // 文档也可能由浏览器插件或其他设备直接写入 API，刷新前必须跳过本地列表缓存。
      dataCache.invalidate(`documents:${search || 'all'}`);
      const data = await getDocuments(search);
      setDocuments(previous => sameDocuments(previous, data) ? previous : data);
    } catch (error) {
      console.error('Failed to fetch documents', error);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  const refreshDocuments = useCallback(async (search?: string) => {
    await fetchDocuments(search, false);
  }, [fetchDocuments]);

  // Re-fetch documents when authenticated
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (isAuthenticated) void refreshDocuments();
      else setDocuments([]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, refreshDocuments]);

  const updateDocumentTitle = useCallback((id: string, newTitle: string) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, title: newTitle } : d));
  }, []);

  const updateDocumentLocal = useCallback((id: string, changes: Partial<Document>) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...changes } : d));
  }, []);

  const addDocument = useCallback((doc: Document) => {
    setDocuments(prev => [...prev, doc]);
  }, []);

  const removeDocument = useCallback((id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
  }, []);

  const moveDocument = useCallback((id: string, parentId: string | null) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, parent_id: parentId } : d));
  }, []);

  const value = useMemo(() => ({
    documents,
    isLoading,
    refreshDocuments,
    updateDocumentTitle,
    updateDocumentLocal,
    addDocument,
    removeDocument,
    moveDocument
  }), [documents, isLoading, refreshDocuments, updateDocumentTitle, updateDocumentLocal, addDocument, removeDocument, moveDocument]);

  return (
    <DocumentContext.Provider value={value}>
      {children}
    </DocumentContext.Provider>
  );
};

export const useDocuments = () => {
  const context = useContext(DocumentContext);
  if (context === undefined) {
    throw new Error('useDocuments must be used within a DocumentProvider');
  }
  return context;
};
