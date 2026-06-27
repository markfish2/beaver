import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ArrowLeft, LogOut, Key, Trash, User, Sparkles, Lock, Settings } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import UserProfileEditor from '../UserProfileEditor';
import TokenPanel from '../TokenPanel';
import AISettingsPanel from '../AISettingsPanel';
import TrashPanel from '../TrashPanel';
import PasswordPanel from '../PasswordPanel';

const isNative = Capacitor.isNativePlatform();

interface MobileTopBarProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  onSearch?: (query: string) => void;
}

export default function MobileTopBar({ title, showBack, onBack, onSearch }: MobileTopBarProps) {
  const { user, logout } = useAuth();
  const { mode, switchMode } = useData();
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

  const handleLogout = () => {
    if (mode === 'local') {
      // 本地模式：切换回模式选择
      localStorage.removeItem('dataMode');
      window.location.reload();
    } else {
      logout();
    }
    setShowUserMenu(false);
  };

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-30 ${
        isNative
          ? 'bg-white dark:bg-gray-900 shadow-[0_1px_3px_rgba(0,0,0,0.05)]'
          : 'bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-700/50'
      }`}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center justify-between h-11 px-3">
        {/* Left: back button or avatar */}
        <div className="w-10 flex items-center justify-start" ref={userMenuRef}>
          {showBack ? (
            <button
              onClick={() => onBack?.()}
              className="p-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 rounded-lg transition-colors active:scale-95"
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
                  <div className="w-full h-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                    <span className="text-xs font-medium text-white">
                      {(user?.nickname || user?.username || 'B')[0].toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
              {showUserMenu && (
                <div className="absolute left-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50 overflow-hidden">
                  {/* 用户信息 */}
                  <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                      {user?.nickname || user?.username || '用户'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {mode === 'local' ? '本地模式' : '云端模式'}
                    </p>
                  </div>

                  <button
                    onClick={() => openDialog('profile')}
                    className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center space-x-2.5 active:bg-gray-100 dark:active:bg-gray-700"
                  >
                    <User className="w-4 h-4 text-gray-400" />
                    <span>个人资料</span>
                  </button>

                  {/* 云端模式专属功能 */}
                  {mode !== 'local' && (
                    <>
                      <button
                        onClick={() => openDialog('token')}
                        className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center space-x-2.5 active:bg-gray-100 dark:active:bg-gray-700"
                      >
                        <Key className="w-4 h-4 text-gray-400" />
                        <span>API Token</span>
                      </button>
                      <button
                        onClick={() => openDialog('ai')}
                        className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center space-x-2.5 active:bg-gray-100 dark:active:bg-gray-700"
                      >
                        <Sparkles className="w-4 h-4 text-gray-400" />
                        <span>AI 设置</span>
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => openDialog('trash')}
                    className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center space-x-2.5 active:bg-gray-100 dark:active:bg-gray-700"
                  >
                    <Trash className="w-4 h-4 text-gray-400" />
                    <span>回收站</span>
                  </button>

                  {mode !== 'local' && (
                    <button
                      onClick={() => openDialog('password')}
                      className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center space-x-2.5 active:bg-gray-100 dark:active:bg-gray-700"
                    >
                      <Lock className="w-4 h-4 text-gray-400" />
                      <span>修改密码</span>
                    </button>
                  )}

                  <div className="my-1 border-t border-gray-100 dark:border-gray-700" />

                  <button
                    onClick={handleLogout}
                    className="w-full px-3 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-2.5 active:bg-red-100 dark:active:bg-red-900/30"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{mode === 'local' ? '切换模式' : '退出登录'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Center: title */}
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
          {title}
        </span>

        {/* Right: search */}
        <div className="w-10 flex items-center justify-end">
          {showSearch ? (
            <button
              onClick={() => { setShowSearch(false); setSearchQuery(''); }}
              className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 rounded-lg transition-colors active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={() => setShowSearch(true)}
              className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 rounded-lg transition-colors active:scale-95"
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
          <div className="shrink-0 flex items-center justify-between px-3" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)', height: 'calc(env(safe-area-inset-top, 0px) + 44px)' }}>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {activeDialog === 'profile' && '个人资料'}
              {activeDialog === 'token' && 'API Token'}
              {activeDialog === 'ai' && 'AI 设置'}
              {activeDialog === 'trash' && '回收站'}
              {activeDialog === 'password' && '修改密码'}
            </span>
            <button
              onClick={() => setActiveDialog(null)}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-95"
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
