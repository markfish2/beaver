import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, FileText, Folder, ListTree, PenTool, MoreHorizontal, Star, Copy, Trash2, Pencil } from 'lucide-react';
import { useDocuments } from '../../context/DocumentContext';
import { deleteDocument, updateDocument, copyDocument } from '../../api/data';
import DeleteConfirmDialog from '../DeleteConfirmDialog';
import type { Document } from '../../api/data';

interface FileTreeViewProps {
  starredOnly?: boolean;
}

function getDocIcon(doc: Document) {
  if (doc.type === 'folder') return <Folder className="w-4 h-4 text-yellow-600 dark:text-yellow-500 shrink-0" />;
  if (doc.type === 'note') return <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />;
  if (doc.type === 'excalidraw') return <PenTool className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />;
  // default: document (outline)
  return <ListTree className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />;
}

export default function FileTreeView({ starredOnly = false }: FileTreeViewProps) {
  const navigate = useNavigate();
  const { documents, refreshDocuments } = useDocuments();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ docId: string; x: number; y: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const filteredDocs = starredOnly
    ? documents.filter(d => d.is_starred)
    : documents;

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
      navigate(`/d/${doc.id}`);
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
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, [contextMenu]);

  const renderDocItem = (doc: Document, depth: number) => {
    const isFolder = doc.type === 'folder';
    const isExpanded = expandedFolders.has(doc.id);

    return (
      <div key={doc.id} className="relative">
        {/* Folder guide line */}
        {depth > 0 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700"
            style={{ left: `${8 + (depth - 1) * 10 + 7}px` }}
          />
        )}

        <div
          className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 transition-colors group relative"
          style={{ paddingLeft: `${8 + depth * 10}px` }}
          onClick={() => handleDocumentClick(doc)}
          onContextMenu={(e) => handleContextMenu(e, doc.id)}
          onTouchStart={(e) => {
            const timer = setTimeout(() => handleContextMenu(e, doc.id), 500);
            const cleanup = () => { clearTimeout(timer); };
            e.currentTarget.addEventListener('touchend', cleanup, { once: true });
            e.currentTarget.addEventListener('touchmove', cleanup, { once: true });
          }}
        >
          {isFolder ? (
            <ChevronRight className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
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
              className="flex-1 text-sm bg-transparent border-b border-blue-400 outline-none text-gray-800 dark:text-gray-200"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">
              {doc.title || '无标题'}
            </span>
          )}

          {/* 3-dot menu - always visible on mobile */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setContextMenu({ docId: doc.id, x: e.currentTarget.getBoundingClientRect().right - 160, y: e.currentTarget.getBoundingClientRect().bottom + 4 });
            }}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  const renderTree = (parentId: string | null, depth: number) => {
    const children = filteredDocs
      .filter(d => d.parent_id === parentId)
      .sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        return (a.title || '').localeCompare(b.title || '');
      });

    return children.map(doc => {
      const isFolder = doc.type === 'folder';
      const isExpanded = expandedFolders.has(doc.id);
      const childDocs = filteredDocs.filter(d => d.parent_id === doc.id);
      const hasChildren = isFolder && childDocs.length > 0;

      return (
        <div key={doc.id}>
          {renderDocItem(doc, depth)}
          {isFolder && isExpanded && hasChildren && (
            <div className="relative">
              {renderTree(doc.id, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  // For starred view: render as flat list (parent folders may not be starred)
  const renderStarredList = () => {
    const sorted = [...filteredDocs].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
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
            className="fixed z-50 w-40 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {doc.type !== 'folder' && (
              <button onClick={() => handleStar(contextMenu.docId)} className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                <Star className={`w-4 h-4 ${doc.is_starred ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                {doc.is_starred ? '取消收藏' : '收藏'}
              </button>
            )}
            <button onClick={() => handleRename(contextMenu.docId)} className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              重命名
            </button>
            <button onClick={() => handleCopy(contextMenu.docId)} className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
              <Copy className="w-4 h-4" />
              复制
            </button>
            <button onClick={() => handleDeleteClick(contextMenu.docId)} className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
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
