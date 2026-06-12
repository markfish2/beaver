import { useState, useEffect, useRef } from 'react';
import { X, Link, Copy, Trash2, Check } from 'lucide-react';
import { createShare, getShare, deleteShare } from '../api/data';

interface ShareDialogProps {
  isOpen: boolean;
  documentId: string;
  onCancel: () => void;
}

const ShareDialog = ({ isOpen, documentId, onCancel }: ShareDialogProps) => {
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && documentId) {
      setIsLoading(true);
      getShare(documentId)
        .then(share => {
          setShareToken(share?.token || null);
        })
        .catch(() => setShareToken(null))
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, documentId]);

  const handleCreate = async () => {
    setIsLoading(true);
    try {
      const share = await createShare(documentId);
      setShareToken(share.token);
    } catch (e) {
      console.error('Failed to create share', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!shareToken) return;
    setIsLoading(true);
    try {
      await deleteShare(shareToken);
      setShareToken(null);
    } catch (e) {
      console.error('Failed to delete share', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!shareToken) return;
    const url = `${window.location.origin}/s/${shareToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
    // fallback: select the input
    inputRef.current?.select();
  };

  if (!isOpen) return null;

  const shareUrl = shareToken ? `${window.location.origin}/s/${shareToken}` : '';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-96 max-w-[90vw]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            分享文档
          </h3>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-gray-400">加载中...</div>
        ) : shareToken ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              任何人可以通过此链接查看文档：
            </p>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-200 select-all"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={handleCopy}
                className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                title="复制链接"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            {copied && (
              <p className="text-xs text-green-600 dark:text-green-400">已复制到剪贴板</p>
            )}
            <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={handleDelete}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                取消分享
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              生成一个公开链接，任何人都可以查看此文档。
            </p>
            <button
              onClick={handleCreate}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50"
            >
              <Link className="w-4 h-4" />
              生成分享链接
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShareDialog;
