import { useState, useEffect } from 'react';
import { Copy, Trash2, Plus, Check, Loader2 } from 'lucide-react';
import { createApiToken, getApiTokens, deleteApiToken } from '../api/data';
import type { ApiTokenInfo, ApiTokenCreated } from '../api/data';
import { showToast } from '../utils/toast';

export default function TokenPanel() {
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
      showToast('Token 已创建');
    } catch (err) {
      console.error('Failed to create token:', err);
      showToast('创建失败', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteApiToken(id);
      setTokens(tokens.filter(t => t.id !== id));
      showToast('Token 已删除');
    } catch (err) {
      console.error('Failed to delete token:', err);
      showToast('删除失败', 'error');
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
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">API Token</h1>

        {/* New token display */}
        {newToken && (
          <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
            <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-2 font-medium">Token 已创建，请立即复制保存：</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm bg-white dark:bg-gray-900 px-3 py-2 rounded border border-gray-200 dark:border-gray-700 break-all text-gray-800 dark:text-gray-200">
                {newToken.token}
              </code>
              <button onClick={handleCopy} className="shrink-0 p-2 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-800/30 rounded">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {/* Create form */}
        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="Token 名称（如 iOS 捷径）"
            className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg placeholder-gray-400 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            生成
          </button>
        </div>

        {/* Token list */}
        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">暂无 Token</p>
          ) : (
            tokens.map(token => (
              <div key={token.id} className="flex items-center justify-between py-3 px-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-200 font-medium">{token.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    创建 {formatDate(token.created_at)} · 最后使用 {formatDate(token.last_used_at)}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(token.id)}
                  className="shrink-0 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Info */}
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 space-y-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            <span className="font-medium">连接地址：</span>
            <code className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">{window.location.origin}</code>
          </p>
          <p className="text-sm text-gray-400">
            在 Beaver 浏览器插件或第三方客户端中填入上方地址和 Token 即可连接。
          </p>
          <p className="text-sm text-gray-400">
            公开 Memo 接口：
            <code className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded ml-1">{window.location.origin}/api/public/memos</code>
          </p>
          <p className="text-sm text-gray-400">
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
