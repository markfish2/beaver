import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ArrowLeft, LogOut, Key, Trash, User, Sparkles, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import UserProfileEditor from '../UserProfileEditor';
import TokenPanel from '../TokenPanel';
import AISettingsPanel from '../AISettingsPanel';
import TrashPanel from '../TrashPanel';
import PasswordPanel from '../PasswordPanel';

interface MobileTopBarProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  onSearch?: (query: string) => void;
}

export default function MobileTopBar({ title, showBack, onBack, onSearch }: MobileTopBarProps) {
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [activeDialog, setActiveDialog] = useState<string | null>(null);
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

  const openDialog = (name: string) => {
    setActiveDialog(name);
    setShowUserMenu(false);
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
                className="w-7 h-7 rounded-full cursor-pointer hover:opacity-80 transition-opacity overflow-hidden border border-gray-200 dark:border-gray-600"
              >
                {user?.avatar_path ? (
                  <img src={user.avatar_path} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                  </div>
                )}
              </div>
              {showUserMenu && (
                <div className="absolute left-0 top-full mt-1 w-40 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                  <button
                    onClick={() => openDialog('profile')}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                  >
                    <User className="w-4 h-4" />
                    <span>个人资料</span>
                  </button>
                  <button
                    onClick={() => openDialog('graph')}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><circle cx="4" cy="6" r="2" /><circle cx="20" cy="6" r="2" /><circle cx="4" cy="18" r="2" /><circle cx="20" cy="18" r="2" /><line x1="9.5" y1="10.5" x2="5.5" y2="7.5" /><line x1="14.5" y1="10.5" x2="18.5" y2="7.5" /><line x1="9.5" y1="13.5" x2="5.5" y2="16.5" /><line x1="14.5" y1="13.5" x2="18.5" y2="16.5" /></svg>
                    <span>知识图谱</span>
                  </button>
                  <button
                    onClick={() => openDialog('token')}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                  >
                    <Key className="w-4 h-4" />
                    <span>API Token</span>
                  </button>
                  <button
                    onClick={() => openDialog('ai')}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>AI 设置</span>
                  </button>
                  <button
                    onClick={() => openDialog('trash')}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                  >
                    <Trash className="w-4 h-4" />
                    <span>回收站</span>
                  </button>
                  <button
                    onClick={() => openDialog('password')}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                  >
                    <Lock className="w-4 h-4" />
                    <span>修改密码</span>
                  </button>
                  <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                  <button
                    onClick={() => { logout(); setShowUserMenu(false); }}
                    className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-2"
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

      {/* Full-screen panels - rendered via portal to escape fixed parent */}
      {activeDialog && createPortal(
        <div className="fixed inset-0 z-[9999] bg-white dark:bg-gray-900 flex flex-col">
          {/* Top bar with close button */}
          <div className="shrink-0 flex items-center justify-end px-3" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)', height: 'calc(env(safe-area-inset-top, 0px) + 44px)' }}>
            <button
              onClick={() => setActiveDialog(null)}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {/* Panel content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {activeDialog === 'profile' && <UserProfileEditor />}
            {activeDialog === 'token' && <TokenPanel />}
            {activeDialog === 'ai' && <AISettingsPanel />}
            {activeDialog === 'trash' && <TrashPanel />}
            {activeDialog === 'password' && <PasswordPanel />}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
