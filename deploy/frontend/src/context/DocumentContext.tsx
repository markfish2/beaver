import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { getDocuments } from '../api/data';
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

export const DocumentProvider = ({ children }: { children: ReactNode }) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { isAuthenticated } = useAuth();

  // Re-fetch documents when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      refreshDocuments();
    } else {
      setDocuments([]);
    }
  }, [isAuthenticated]);

  const refreshDocuments = useCallback(async (search?: string) => {
    setIsLoading(true);
    try {
      const data = await getDocuments(search);
      setDocuments(data);
    } catch (error) {
      console.error('Failed to fetch documents', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
