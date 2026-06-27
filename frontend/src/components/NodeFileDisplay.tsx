/**
 * NodeFileDisplay - 渲染节点中的图片或附件
 * 支持本地模式和远程模式
 */

import { useState, useEffect } from 'react';
import { getFileUrl, getThumbnailUrl, getMode } from '../api/data-adapter';

interface NodeFileDisplayProps {
  filePath: string;
  fileName?: string;
  contentType: 'image' | 'attachment';
  onImageClick?: (url: string) => void;
  onDelete?: () => void;
}

export default function NodeFileDisplay({ filePath, fileName, contentType, onImageClick, onDelete }: NodeFileDisplayProps) {
  const [fileUrl, setFileUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');

  useEffect(() => {
    if (!filePath) return;
    const url = getFileUrl(filePath);
    setFileUrl(url);
    setThumbnailUrl(contentType === 'image' ? getThumbnailUrl(filePath) : url);
  }, [filePath, contentType]);

  if (!filePath) return null;

  if (contentType === 'image') {
    return (
      <div className="relative group">
        {fileUrl ? (
          <img
            src={thumbnailUrl || fileUrl}
            alt={fileName || '图片'}
            className="max-w-full max-h-64 rounded cursor-pointer hover:opacity-90 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onImageClick?.(fileUrl);
            }}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
            }}
          />
        ) : (
          <div className="w-32 h-32 bg-gray-100 dark:bg-gray-800 rounded flex items-center justify-center">
            <span className="text-xs text-gray-400">图片加载失败</span>
          </div>
        )}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-black/50 hover:bg-black/70 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
            title="删除图片"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  // attachment
  return (
    <div className="relative group inline-block">
      {fileUrl ? (
        <a
          href={fileUrl}
          download={fileName}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          <span className="truncate max-w-xs">{fileName || '附件'}</span>
        </a>
      ) : (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded text-sm text-gray-400">
          <span>附件加载失败</span>
        </div>
      )}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center bg-red-500 hover:bg-red-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
          title="删除附件"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
