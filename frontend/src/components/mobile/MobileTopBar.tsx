import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ArrowLeft, LogOut, Key, Trash, User, Lock, Sun, Moon, Palette, MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import UserProfileEditor from '../UserProfileEditor';
import TokenPanel from '../TokenPanel';
import AISettingsPanel from '../AISettingsPanel';
import TrashPanel from '../TrashPanel';
import PasswordPanel from '../PasswordPanel';
import { useFontSettings } from '../FontSettings';
import { useIsDark } from '../../hooks/useIsDark';
import AppearanceSettingsPage from '../AppearanceSettingsPage';
import NavigationIcon from '../NavigationIcon';
import { MobileEditorActionsSlot } from '../EditorActionPortal';

interface MobileTopBarProps {
  title: string;
  showBack?: boolean;
  isDocumentPage?: boolean;
  onBack?: () => void;
  onSearch?: (query: string) => void;
  showAIHistory?: boolean;
  onAIHistory?: () => void;
  chromeHidden?: boolean;
}

export default function MobileTopBar({ title, showBack, isDocumentPage = false, onBack, onSearch, showAIHistory = false, onAIHistory, chromeHidden = false }: MobileTopBarProps) {
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [activeDialog, setActiveDialog] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { setTheme } = useFontSettings();
  const isDark = useIsDark();
  // 切换暗色/亮色
  const toggleDark = useCallback(() => {
    setTheme(isDark ? 'system' : 'dark');
  }, [isDark, setTheme]);

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
    // 压入历史记录，让安卓系统返回键可以关闭弹出层
    window.history.pushState({ mobileDialog: name }, '');
  };

  const closeDialog = () => {
    setActiveDialog(null);
    if (window.history.state?.mobileDialog) {
      window.history.back();
    }
  };

  // 系统返回键/浏览器返回：关闭弹出层
  useEffect(() => {
    if (!activeDialog) return;
    const onPopState = () => setActiveDialog(null);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [activeDialog]);

  return (
    <>
      {/* 悬浮胶囊顶栏 */}
      <div
        className="pointer-events-none fixed left-3 right-3 z-[100] flex items-center justify-between"
        style={{
          top: `calc(8px + env(safe-area-inset-top, 0px))`,
          height: '44px',
          transform: chromeHidden ? 'translateY(-125%)' : 'translateY(0)',
          opacity: chromeHidden ? 0 : 1,
          transition: 'transform 400ms linear, opacity 400ms linear',
        }}
      >
        {/* 左侧：头像（圆形胶囊） */}
        <div
          ref={userMenuRef}
          className={`pointer-events-auto relative shrink-0 flex items-center ${isDocumentPage ? 'h-[36px] rounded-full border border-white/55 bg-white/45 shadow-[0_4px_18px_-6px_rgba(15,23,42,0.22)] backdrop-blur-2xl backdrop-saturate-200 dark:border-white/10 dark:bg-gray-800/55' : ''}`}
        >
          {showBack ? (
            <button
              onClick={() => onBack?.()}
              className={`flex items-center justify-center w-[44px] h-[44px] rounded-full
                         ${isDocumentPage ? '' : 'border border-white/55 bg-white/45 shadow-[0_4px_18px_-6px_rgba(15,23,42,0.22)] backdrop-blur-2xl backdrop-saturate-200 dark:border-white/10 dark:bg-gray-800/55'}
                         text-gray-600 dark:text-gray-300
                         active:scale-95 transition-transform`}
            >
              <ArrowLeft className="w-[18px] h-[18px]" />
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center justify-center w-[36px] h-[36px] rounded-full
                           border border-white/55 bg-white/45 backdrop-blur-2xl backdrop-saturate-200
                           shadow-[0_4px_18px_-6px_rgba(15,23,42,0.22)]
                           dark:border-white/10 dark:bg-gray-800/55
                           overflow-hidden
                           active:scale-95 transition-transform"
              >
                {user?.avatar_path ? (
                  <img src={user.avatar_path} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-[16px] h-[16px] text-gray-400 dark:text-gray-500" />
                )}
              </button>

              {showAIHistory && (
                <button
                  type="button"
                  onClick={onAIHistory}
                  aria-label="历史问答"
                  title="历史问答"
                  className="absolute left-0 top-[42px] flex h-[36px] w-[36px] items-center justify-center rounded-full border border-white/55 bg-white/45 text-gray-500 shadow-[0_4px_18px_-6px_rgba(15,23,42,0.22)] backdrop-blur-2xl backdrop-saturate-200 transition-transform active:scale-95 dark:border-white/10 dark:bg-gray-800/55 dark:text-gray-300"
                >
                  <MessageSquare className="h-[16px] w-[16px]" />
                </button>
              )}

              {showUserMenu && (
                <div className="absolute left-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-2xl
                                shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-[10000]
                                backdrop-blur-2xl bg-white/95 dark:bg-gray-800/95">
                  <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                      {user?.nickname || user?.username || '用户'}
                    </p>
                  </div>
                  <button onClick={() => openDialog('profile')} className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2.5">
                    <User className="w-4 h-4 text-gray-400" /><span>个人资料</span>
                  </button>
                  <button onClick={() => openDialog('appearance')} className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2.5">
                    <Palette className="w-4 h-4 text-gray-400" /><span>外观与主题</span>
                  </button>
                  <button onClick={() => openDialog('token')} className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2.5">
                    <Key className="w-4 h-4 text-gray-400" /><span>API Token</span>
                  </button>
                  <button onClick={() => openDialog('ai')} className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2.5">
                    <NavigationIcon type="ai" className="w-4 h-4" /><span>AI 设置</span>
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

          {isDocumentPage && <MobileEditorActionsSlot className="relative flex min-w-0 items-center gap-0.5 pr-1" />}
        </div>

        {/* 中间：标题（胶囊长条形，缩小一半，居中） */}
        {!isDocumentPage && (
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center h-[36px] px-4
                          border border-white/55 bg-white/45 dark:bg-gray-800/55 backdrop-blur-2xl backdrop-saturate-200
                          rounded-full
                          shadow-[0_2px_12px_-4px_rgba(0,0,0,0.1)]">
            <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[160px]">
              {title}
            </span>
          </div>
        )}

        {/* 右侧：日/夜切换 + 搜索（胶囊容器） */}
        <div className="pointer-events-auto relative shrink-0 flex items-center h-[36px] rounded-full
                        border border-white/55 bg-white/45 backdrop-blur-2xl backdrop-saturate-200
                        shadow-[0_4px_18px_-6px_rgba(15,23,42,0.22)]
                        dark:border-white/10 dark:bg-gray-800/55">
          {/* 日/夜切换按钮 */}
          <button
            onClick={toggleDark}
            className="flex items-center justify-center w-[44px] h-[44px] rounded-full
                       text-gray-500 dark:text-gray-400
                       active:scale-95 transition-transform"
            aria-label={isDark ? '切换到日间模式' : '切换到夜间模式'}
          >
            {isDark ? <Sun className="w-[16px] h-[16px]" /> : <Moon className="w-[16px] h-[16px]" />}
          </button>
          {/* 分隔线 */}
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-600" />
          {/* 搜索按钮 */}
          {showSearch ? (
            <button
              onClick={() => { setShowSearch(false); setSearchQuery(''); }}
            className="flex items-center justify-center w-[44px] h-[44px] rounded-full
                         text-gray-500 dark:text-gray-400
                         active:scale-95 transition-transform"
            >
              <X className="w-[16px] h-[16px]" />
            </button>
          ) : (
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center justify-center w-[36px] h-[36px] rounded-full
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
                     border border-white/55 bg-white/45 dark:bg-gray-800/55 backdrop-blur-2xl backdrop-saturate-200
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
              {activeDialog === 'appearance' && '外观与主题'}
              {activeDialog === 'token' && 'API Token'}
              {activeDialog === 'ai' && 'AI 设置'}
              {activeDialog === 'trash' && '回收站'}
              {activeDialog === 'password' && '修改密码'}
            </span>
            <button onClick={closeDialog} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400" aria-label="关闭">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {activeDialog === 'profile' && <UserProfileEditor />}
            {activeDialog === 'appearance' && <AppearanceSettingsPage />}
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
