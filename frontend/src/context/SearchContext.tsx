import { createContext, useContext, useState, useMemo, ReactNode } from 'react';

interface SearchContextType {
  /** 当前大纲过滤关键词（仅用于当前文档内过滤，与全局搜索解耦） */
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  /** 全局搜索浮层开关（Ctrl/Cmd + K 或侧边栏搜索按钮） */
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

export const SearchProvider = ({ children }: { children: ReactNode }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const value = useMemo(() => ({ searchQuery, setSearchQuery, searchOpen, setSearchOpen }), [searchQuery, searchOpen]);

  return (
    <SearchContext.Provider value={value}>
      {children}
    </SearchContext.Provider>
  );
};

export const useSearch = () => {
  const context = useContext(SearchContext);
  if (context === undefined) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
};
