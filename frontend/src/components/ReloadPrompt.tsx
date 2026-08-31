import { RefreshCw, X } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { registerSW } from 'virtual:pwa-register';

const DISMISS_KEY = 'sw-update-dismissed-at';
const DISMISS_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours

function isDismissed(): boolean {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY));
    return ts > 0 && Date.now() - ts < DISMISS_COOLDOWN;
  } catch {
    return false;
  }
}

export default function ReloadPrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [visible, setVisible] = useState(false);
  const updateSWRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    // 开发服务器必须由 Vite HMR 接管。即便此前在同一 8080 域名安装过 PWA，
    // 也不能在开发环境再次注册 Service Worker，否则会缓存 /src 模块并遮蔽热更新。
    if (import.meta.env.DEV) return;

    let updateInterval: ReturnType<typeof setInterval> | undefined;
    const update = registerSW({
      onNeedRefresh() {
        if (!isDismissed()) {
          setNeedRefresh(true);
          setVisible(true);
        }
      },
      onOfflineReady() {
        // 不提示离线就绪，静默处理
      },
      onRegisteredSW(_swUrl, registration) {
        // 每小时检查一次更新
        if (registration) {
          updateInterval = setInterval(() => {
            registration.update();
          }, 60 * 60 * 1000);
        }
      },
    });
    updateSWRef.current = update;
    return () => {
      if (updateInterval) clearInterval(updateInterval);
    };
  }, []);

  const close = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setVisible(false);
    setNeedRefresh(false);
  };

  if (!visible || !needRefresh) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 flex justify-center pointer-events-none">
      <div className="bg-gray-900 dark:bg-gray-800 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 max-w-sm pointer-events-auto animate-in slide-in-from-bottom-4 fade-in duration-300">
        <div className="flex-1 text-sm">
          新版本可用，点击刷新更新
        </div>
        {needRefresh && (
          <button
            onClick={async () => {
              setVisible(false);
              setTimeout(() => {
                window.location.reload();
              }, 2000);
              try {
                await updateSWRef.current?.(true);
              } catch {
                // ignore
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            刷新
          </button>
        )}
        <button
          onClick={close}
          className="p-1 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
