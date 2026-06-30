import { useState, useEffect } from 'react';
import { X, Copy, Trash2, Plus, Check, Key } from 'lucide-react';
import { createApiToken, getApiTokens, deleteApiToken } from '../api/data';
import type { ApiTokenInfo, ApiTokenCreated } from '../api/data';

interface TokenDialogProps {
  onClose: () => void;
}

export default function TokenDialog({ onClose }: TokenDialogProps) {
  const [tokens, setTokens] = useState<ApiTokenInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<ApiTokenCreated | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchTokens = async () => {
    try {
      const data = await getApiTokens();
      setTokens(data);
    } catch (err) {
      console.error('Failed to fetch tokens:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokens();
  }, []);

  const handleCreate = async () => {
    const name = newName.trim() || 'API Token';
    setCreating(true);
    try {
      const result = await createApiToken(name);
      setNewToken(result);
      setNewName('');
      fetchTokens();
    } catch (err) {
      console.error('Failed to create token:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteApiToken(id);
      setTokens(tokens.filter(t => t.id !== id));
    } catch (err) {
      console.error('Failed to delete token:', err);
    }
  };

  const handleCopy = () => {
    if (newToken) {
      navigator.clipboard.writeText(newToken.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatDate = (s: string | null) => {
    if (!s) return '从未';
    return new Date(s).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }} onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md max-h-[80dvh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-gray-500" />
            <span className="text-base font-medium text-gray-800 dark:text-gray-200">API Token</span>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 新 token 显示 */}
        {newToken && (
          <div className="mx-5 mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
            <p className="text-xs text-emerald-700 dark:text-emerald-300 mb-2 font-medium">Token 已创建，请立即复制保存：</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-white dark:bg-gray-900 px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 break-all text-gray-800 dark:text-gray-200">
                {newToken.token}
              </code>
              <button onClick={handleCopy} className="shrink-0 p-1.5 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-800/30 rounded">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {/* 创建 */}
        <div className="px-5 pt-4 flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="Token 名称（如 iOS 捷径）"
            className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg placeholder-gray-400 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-3 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-40 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            生成
          </button>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">加载中...</p>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">暂无 Token</p>
          ) : (
            tokens.map(token => (
              <div key={token.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-200 font-medium truncate">{token.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    创建 {formatDate(token.created_at)} · 最后使用 {formatDate(token.last_used_at)}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(token.id)}
                  className="shrink-0 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* 说明 */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
          <p className="text-xs text-gray-400">
            <span className="font-medium text-gray-500 dark:text-gray-300">连接地址：</span>
            <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded break-all">{window.location.origin}</code>
          </p>
          <p className="text-xs text-gray-400">
            在 Beaver 浏览器插件或第三方客户端中填入上方地址和 Token 即可连接。
          </p>

          {/* 公开 Memo 调用地址 */}
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700/50">
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">公开 Memo 接口（无需登录）</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] bg-gray-100 dark:bg-gray-700 px-1.5 py-1 rounded text-gray-600 dark:text-gray-300 break-all">{window.location.origin}/api/public/memos</code>
              <button
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/public/memos`)}
                className="shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                title="复制"
              >
                <Copy className="w-3 h-3" />
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">返回所有标记为公开的 Memo 列表</p>
          </div>
          <p className="text-xs text-gray-400">
            <a
              href={`${window.location.origin}/beaver-extension.zip`}
              download
              className="text-blue-500 hover:text-blue-600 dark:text-blue-400 underline underline-offset-2"
            >
              下载 Chrome 插件
            </a>
            <span className="ml-1">— 在浏览器中一键保存网页到 Beaver</span>
          </p>
        </div>
      </div>
    </div>
  );
}
