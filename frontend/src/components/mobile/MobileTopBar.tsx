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
    <>
      {/* 悬浮胶囊顶栏 */}
      <div
        className="fixed left-3 right-3 z-30 flex items-center justify-between"
        style={{
          top: `calc(8px + env(safe-area-inset-top, 0px))`,
          height: '44px',
        }}
      >
        {/* 左侧：头像（圆形胶囊） */}
        <div ref={userMenuRef} className="relative shrink-0">
          {showBack ? (
            <button
              onClick={() => onBack?.()}
              className="flex items-center justify-center w-[36px] h-[36px] rounded-full
                         bg-white/75 dark:bg-gray-800/75 backdrop-blur-2xl
                         shadow-[0_2px_12px_-4px_rgba(0,0,0,0.1)]
                         text-gray-600 dark:text-gray-300
                         active:scale-95 transition-transform"
            >
              <ArrowLeft className="w-[18px] h-[18px]" />
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center justify-center w-[36px] h-[36px] rounded-full
                           bg-white/75 dark:bg-gray-800/75 backdrop-blur-2xl
                           shadow-[0_2px_12px_-4px_rgba(0,0,0,0.1)]
                           overflow-hidden
                           active:scale-95 transition-transform"
              >
                {user?.avatar_path ? (
                  <img src={user.avatar_path} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-[16px] h-[16px] text-gray-400 dark:text-gray-500" />
                )}
              </button>

              {showUserMenu && (
                <div className="absolute left-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-2xl
                                shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50
                                backdrop-blur-2xl bg-white/95 dark:bg-gray-800/95">
                  <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                      {user?.nickname || user?.username || '用户'}
                    </p>
                  </div>
                  <button onClick={() => openDialog('profile')} className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2.5">
                    <User className="w-4 h-4 text-gray-400" /><span>个人资料</span>
                  </button>
                  <button onClick={() => openDialog('token')} className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2.5">
                    <Key className="w-4 h-4 text-gray-400" /><span>API Token</span>
                  </button>
                  <button onClick={() => openDialog('ai')} className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2.5">
                    <Sparkles className="w-4 h-4 text-gray-400" /><span>AI 设置</span>
                  </button>
                  <button onClick={() => openDialog('trash')} className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2.5">
                    <Trash className="w-4 h-4 text-gray-400" /><span>回收站</span>
                  </button>
                  <button onClick={() => openDialog('password')} className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2.5">
                    <Lock className="w-4 h-4 text-gray-400" /><span>修改密码</span>
                  </button>
                  <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                  <button onClick={() => { logout(); setShowUserMenu(false); }} className="w-full px-3 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2.5">
                    <LogOut className="w-4 h-4" /><span>退出登录</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* 中间：标题（胶囊长条形，缩小一半，居中） */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center h-[36px] px-4
                        bg-white/75 dark:bg-gray-800/75 backdrop-blur-2xl
                        rounded-full
                        shadow-[0_2px_12px_-4px_rgba(0,0,0,0.1)]">
          <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[160px]">
            {title}
          </span>
        </div>

        {/* 右侧：搜索（圆形胶囊） */}
        <div className="relative shrink-0">
          {showSearch ? (
            <button
              onClick={() => { setShowSearch(false); setSearchQuery(''); }}
              className="flex items-center justify-center w-[36px] h-[36px] rounded-full
                         bg-white/75 dark:bg-gray-800/75 backdrop-blur-2xl
                         shadow-[0_2px_12px_-4px_rgba(0,0,0,0.1)]
                         text-gray-500 dark:text-gray-400
                         active:scale-95 transition-transform"
            >
              <X className="w-[16px] h-[16px]" />
            </button>
          ) : (
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center justify-center w-[36px] h-[36px] rounded-full
                         bg-white/75 dark:bg-gray-800/75 backdrop-blur-2xl
                         shadow-[0_2px_12px_-4px_rgba(0,0,0,0.1)]
                         text-gray-500 dark:text-gray-400
                         active:scale-95 transition-transform"
            >
              <Search className="w-[16px] h-[16px]" />
            </button>
          )}
        </div>
      </div>

      {/* 搜索展开面板 */}
      {showSearch && (
        <form
          onSubmit={(e) => { e.preventDefault(); handleSearchSubmit(); }}
          className="fixed left-3 right-3 z-30 px-3 py-2
                     bg-white/75 dark:bg-gray-800/75 backdrop-blur-2xl
                     rounded-2xl
                     shadow-[0_2px_12px_-4px_rgba(0,0,0,0.1)]"
          style={{
            top: `calc(60px + env(safe-area-inset-top, 0px))`,
          }}
        >
          <div className="relative flex items-center gap-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-[16px] h-[16px] text-gray-400 pointer-events-none" />
            <input
              ref={searchRef}
              type="search"
              enterKeyHint="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索笔记、日记、随想..."
              className="flex-1 pl-9 pr-3 py-2.5 text-sm bg-transparent
                         placeholder-gray-400 text-gray-800 dark:text-gray-200
                         focus:outline-none"
            />
            {searchQuery.trim() && (
              <button
                type="submit"
                className="shrink-0 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400
                           active:scale-95 transition-transform"
              >
                搜索
              </button>
            )}
          </div>
        </form>
      )}

      {/* 弹窗 */}
      {activeDialog && createPortal(
        <div className="fixed inset-0 z-[9999] bg-white dark:bg-gray-900 flex flex-col">
          <div className="shrink-0 flex items-center justify-between px-3"
               style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)', height: 'calc(env(safe-area-inset-top, 0px) + 44px)' }}>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {activeDialog === 'profile' && '个人资料'}
              {activeDialog === 'token' && 'API Token'}
              {activeDialog === 'ai' && 'AI 设置'}
              {activeDialog === 'trash' && '回收站'}
              {activeDialog === 'password' && '修改密码'}
            </span>
            <button onClick={() => setActiveDialog(null)} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400">
              <X className="w-5 h-5" />
            </button>
          </div>
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
    </>
  );
}
