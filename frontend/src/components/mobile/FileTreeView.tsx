import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, MoreHorizontal, Copy, Trash2, Pencil } from 'lucide-react';
import { useDocuments } from '../../context/DocumentContext';
import { deleteDocument, updateDocument, copyDocument } from '../../api/data';
import DeleteConfirmDialog from '../DeleteConfirmDialog';
import type { Document } from '../../api/data';
import { createMobileDocumentState } from '../../utils/mobileNavigation';
import DocumentTypeIcon from '../DocumentTypeIcon';
import NavigationIcon from '../NavigationIcon';

interface FileTreeViewProps {
  starredOnly?: boolean;
}

function getDocIcon(doc: Document, isExpanded = false) {
  const iconType = doc.type === 'folder' && isExpanded ? 'folder-open' : doc.type;
  return <DocumentTypeIcon type={iconType} className="h-5 w-5" />;
}

// 与 PC 端 Sidebar 保持一致的排序函数
const compareFolderTitle = (a: Document, b: Document) =>
  (a.title || '').localeCompare(b.title || '', 'zh-CN', {
    numeric: true,
    sensitivity: 'base',
  });

const resolveDocumentSortTime = (doc: Document) => {
  const updatedAt = doc.updated_at ? Date.parse(doc.updated_at) : 0;
  if (Number.isFinite(updatedAt) && updatedAt > 0) return updatedAt;
  return doc.sort_order || 0;
};

const compareDocumentByLastEditedDesc = (sortTimes: Map<string, number>) => (a: Document, b: Document) => {
  const timeDiff = (sortTimes.get(b.id) || 0) - (sortTimes.get(a.id) || 0);
  if (timeDiff !== 0) return timeDiff;
  return (b.sort_order || 0) - (a.sort_order || 0);
};

const compareFileMenuItem = (sortTimes: Map<string, number>) => (a: Document, b: Document) => {
  const aIsFolder = a.type === 'folder';
  const bIsFolder = b.type === 'folder';
  if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
  if (aIsFolder && bIsFolder) return compareFolderTitle(a, b);
  return compareDocumentByLastEditedDesc(sortTimes)(a, b);
};

export default function FileTreeView({ starredOnly = false }: FileTreeViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { documents, refreshDocuments } = useDocuments();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ docId: string; x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const filteredDocs = starredOnly
    ? documents.filter(d => d.is_starred)
    : documents;
  const selectedDocumentId = location.pathname.match(/^\/d\/([^/]+)$/)?.[1];

  // 计算文档排序时间映射（与 PC 端 Sidebar 一致）
  const documentSortTimes = useMemo(() => {
    const map = new Map<string, number>();
    for (const doc of documents) {
      map.set(doc.id, resolveDocumentSortTime(doc));
    }
    return map;
  }, [documents]);

  // 预排序比较函数（与 PC 端 Sidebar 一致）
  const compareByLastEdited = useMemo(() => compareDocumentByLastEditedDesc(documentSortTimes), [documentSortTimes]);
  const compareFileItem = useMemo(() => compareFileMenuItem(documentSortTimes), [documentSortTimes]);

  const handleToggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleDocumentClick = (doc: Document) => {
    if (doc.type === 'folder') {
      handleToggleFolder(doc.id);
    } else {
      navigate(`/d/${doc.id}`, {
        state: createMobileDocumentState('/', 'files'),
      });
    }
  };

  const handleContextMenu = (e: React.MouseEvent | React.TouchEvent, docId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setContextMenu({
      docId,
      x: Math.min(rect.left, window.innerWidth - 160),
      y: rect.bottom + 4,
    });
  };

  const stopMenuEvent = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const stopMenuPointer = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const handleStar = async (docId: string) => {
    const doc = documents.find(d => d.id === docId);
    if (doc) {
      await updateDocument(docId, { is_starred: !doc.is_starred });
      refreshDocuments();
    }
    setContextMenu(null);
  };

  const handleCopy = async (docId: string) => {
    await copyDocument(docId);
    refreshDocuments();
    setContextMenu(null);
  };

  const handleDeleteClick = (docId: string) => {
    const doc = documents.find(d => d.id === docId);
    setDeleteTarget({ id: docId, title: doc?.title || '文档' });
    setContextMenu(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await deleteDocument(deleteTarget.id);
    refreshDocuments();
    setDeleteTarget(null);
  };

  const handleRename = (docId: string) => {
    const doc = documents.find(d => d.id === docId);
    if (doc) {
      setEditingId(docId);
      setEditTitle(doc.title || '');
    }
    setContextMenu(null);
  };

  const handleSaveRename = async () => {
    if (editingId && editTitle.trim()) {
      await updateDocument(editingId, { title: editTitle.trim() });
      refreshDocuments();
    }
    setEditingId(null);
  };

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (contextMenuRef.current?.contains(event.target as Node)) return;
      setContextMenu(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [contextMenu]);

  const renderDocItem = (doc: Document, depth: number) => {
    const isFolder = doc.type === 'folder';
    const isUnfiledNote = !starredOnly && depth === 0 && !isFolder && doc.parent_id === null;
    const isExpanded = expandedFolders.has(doc.id);

    return (
      <div key={doc.id} className="relative">
        {/* Folder guide line */}
        {depth > 0 && (
          <div
            className="absolute top-0 bottom-0 z-10 w-px bg-gray-300 dark:bg-gray-600 pointer-events-none"
            style={{ left: `${8 + (depth - 1) * 12 + 9}px` }}
          />
        )}

        <div
          className={`relative z-0 flex items-center gap-2 px-2 py-2.5 rounded-full transition-colors group ${
            selectedDocumentId === doc.id
              ? 'bg-[#f1f1f1] text-gray-900 dark:bg-gray-700 dark:text-gray-100'
              : 'hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700'
          }`}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => handleDocumentClick(doc)}
          onContextMenu={(e) => handleContextMenu(e, doc.id)}
          onTouchStart={(e) => {
            const timer = setTimeout(() => handleContextMenu(e, doc.id), 500);
            const cleanup = () => { clearTimeout(timer); };
            e.currentTarget.addEventListener('touchend', cleanup, { once: true });
            e.currentTarget.addEventListener('touchmove', cleanup, { once: true });
          }}
        >
          {isUnfiledNote && (
            <span aria-hidden="true" className="absolute left-4 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-[#4d9383]" />
          )}
          {isFolder ? (
            <>
              <ChevronRight className={`w-[18px] h-[18px] text-gray-400 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
              {getDocIcon(doc, isExpanded)}
            </>
          ) : (
            <span className="ml-[18px]">{getDocIcon(doc)}</span>
          )}

          {editingId === doc.id ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleSaveRename}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRename(); if (e.key === 'Escape') setEditingId(null); }}
              className="flex-1 text-base bg-transparent border-b border-blue-400 outline-none text-gray-800 dark:text-gray-200"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className={`flex-1 text-base truncate ${selectedDocumentId === doc.id ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'} ${isFolder ? 'font-medium' : ''}`}>
              {doc.title || '无标题'}
            </span>
          )}

          {/* 3-dot menu - always visible on mobile */}
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({ docId: doc.id, x: e.currentTarget.getBoundingClientRect().right - 160, y: e.currentTarget.getBoundingClientRect().bottom + 4 });
            }}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <MoreHorizontal className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>
    );
  };

  const renderTree = (parentId: string | null, depth: number) => {
    const children = filteredDocs
      .filter(d => d.parent_id === parentId)
      .sort(compareFileItem);

    return children.map(doc => {
      const isFolder = doc.type === 'folder';
      const isExpanded = expandedFolders.has(doc.id);
      const childDocs = filteredDocs.filter(d => d.parent_id === doc.id);
      const hasChildren = isFolder && childDocs.length > 0;

      return (
        <div key={doc.id}>
          {renderDocItem(doc, depth)}
          {isFolder && isExpanded && hasChildren && (
            <div className="relative z-0">
              <div
                className="absolute top-0 bottom-0 z-10 w-px bg-gray-300 dark:bg-gray-600 pointer-events-none"
                style={{ left: `${8 + depth * 12 + 9}px` }}
              />
              <div className="relative">{renderTree(doc.id, depth + 1)}</div>
            </div>
          )}
        </div>
      );
    });
  };

  // For starred view: render as flat list (parent folders may not be starred)
  // 与 PC 端 Sidebar 收藏视图排序一致：按最近编辑时间降序
  const renderStarredList = () => {
    const sorted = [...filteredDocs].sort(compareByLastEdited);
    return sorted.map(doc => renderDocItem(doc, 0));
  };

  return (
    <div className="flex-1 overflow-y-auto px-2 py-2 custom-scrollbar">
      {filteredDocs.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-8">
          {starredOnly ? '暂无收藏' : '暂无文档'}
        </div>
      ) : starredOnly ? (
        renderStarredList()
      ) : (
        renderTree(null, 0)
      )}

      {/* Context menu */}
      {contextMenu && (() => {
        const doc = documents.find(d => d.id === contextMenu.docId);
        if (!doc) return null;
        return (
          <div
            ref={contextMenuRef}
            className="fixed z-[1000] w-40 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {doc.type !== 'folder' && (
              <button type="button" onPointerDown={stopMenuPointer} onClick={(e) => { stopMenuEvent(e); void handleStar(contextMenu.docId); }} className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                <NavigationIcon type="starred" className={`w-4 h-4 ${doc.is_starred ? 'text-gray-700 dark:text-gray-200' : ''}`} />
                {doc.is_starred ? '取消收藏' : '收藏'}
              </button>
            )}
            <button type="button" onPointerDown={stopMenuPointer} onClick={(e) => { stopMenuEvent(e); handleRename(contextMenu.docId); }} className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              重命名
            </button>
            <button type="button" onPointerDown={stopMenuPointer} onClick={(e) => { stopMenuEvent(e); void handleCopy(contextMenu.docId); }} className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
              <Copy className="w-4 h-4" />
              复制
            </button>
            <button type="button" onPointerDown={stopMenuPointer} onClick={(e) => { stopMenuEvent(e); handleDeleteClick(contextMenu.docId); }} className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              删除
            </button>
          </div>
        );
      })()}

      <DeleteConfirmDialog
        isOpen={!!deleteTarget}
        title="删除确认"
        message={deleteTarget ? `确定要删除「${deleteTarget.title}」吗？` : ''}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
