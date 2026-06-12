import { useState, useRef, useEffect } from 'react';
import { Search, X, ArrowLeft, LogOut, Key, Trash } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useDocuments } from '../../context/DocumentContext';
import TokenDialog from '../TokenDialog';
import TrashDialog from '../TrashDialog';

interface MobileTopBarProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  onSearch?: (query: string) => void;
}

export default function MobileTopBar({ title, showBack, onBack, onSearch }: MobileTopBarProps) {
  const { logout } = useAuth();
  const { refreshDocuments } = useDocuments();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [showTrashDialog, setShowTrashDialog] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showSearch && searchRef.current) {
      searchRef.current.focus();
    }
  }, [showSearch]);

  useEffect(() => {
    if (!showUserMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showUserMenu]);

  const handleSearchSubmit = () => {
    if (searchQuery.trim() && onSearch) {
      onSearch(searchQuery.trim());
      setShowSearch(false);
      setSearchQuery('');
    }
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-700/50 z-30"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center justify-between h-11 px-3">
        {/* Left: back button or avatar */}
        <div className="w-10 flex items-center justify-start" ref={userMenuRef}>
          {showBack ? (
            <button
              onClick={() => onBack?.()}
              className="p-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : (
            <div className="relative">
              <div
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="w-7 h-7 rounded-md cursor-pointer hover:opacity-80 transition-opacity overflow-hidden"
              >
                <img src="/beaver.png" alt="beaver" className="w-full h-full object-cover" />
              </div>
              {showUserMenu && (
                <div className="absolute left-0 top-full mt-1 w-36 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                  <button
                    onClick={() => { setShowTrashDialog(true); setShowUserMenu(false); }}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                  >
                    <Trash className="w-4 h-4" />
                    <span>回收站</span>
                  </button>
                  <button
                    onClick={() => { setShowTokenDialog(true); setShowUserMenu(false); }}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                  >
                    <Key className="w-4 h-4" />
                    <span>API Token</span>
                  </button>
                  <button
                    onClick={() => { logout(); setShowUserMenu(false); }}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>退出登录</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Center: title */}
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
          {title}
        </span>

        {/* Right: search */}
        <div className="w-10 flex items-center justify-end">
          {showSearch ? (
            <button
              onClick={() => { setShowSearch(false); setSearchQuery(''); }}
              className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={() => setShowSearch(true)}
              className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 rounded-lg transition-colors"
            >
              <Search className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Search input slide-down */}
      {showSearch && (
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearchSubmit(); }}
              placeholder="搜索笔记、日记、随想..."
              className="w-full pl-8 pr-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 border-none rounded-lg placeholder-gray-400 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        </div>
      )}
      {showTokenDialog && <TokenDialog onClose={() => setShowTokenDialog(false)} />}
      {showTrashDialog && <TrashDialog onClose={() => setShowTrashDialog(false)} onRestore={refreshDocuments} />}
    </div>
  );
}
