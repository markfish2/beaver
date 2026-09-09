import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, MoreHorizontal, Copy, Trash2, Pencil, Folder, Move, Star, Bookmark, Sparkles, FileUp } from 'lucide-react';
import { useDocuments } from '../../context/DocumentContext';
import { createDocument, createNodesBatch, deleteDocument, getRecentDocuments, updateDocument, copyDocument } from '../../api/data';
import DeleteConfirmDialog from '../DeleteConfirmDialog';
import NewFolderDialog from '../NewFolderDialog';
import type { Document } from '../../api/data';
import { createExcalidrawDocument } from '../../api/excalidraw';
import { createMobileDocumentState } from '../../utils/mobileNavigation';
import DocumentTypeIcon from '../DocumentTypeIcon';
import { showToast } from '../../utils/toast';

interface FileTreeViewProps {
  starredOnly?: boolean;
  viewMode?: 'all' | 'starred' | 'recent';
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

type FileTreeViewMode = 'all' | 'starred' | 'recent';
const MOBILE_FILE_TREE_EXPANDED_KEY = 'beaver-mobile-file-tree-expanded-v1';

function readExpandedFolders(viewMode: FileTreeViewMode): Set<string> {
  try {
    const saved = JSON.parse(localStorage.getItem(MOBILE_FILE_TREE_EXPANDED_KEY) || '{}') as Record<string, unknown>;
    const ids = saved[viewMode];
    return Array.isArray(ids) ? new Set(ids.filter((id): id is string => typeof id === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function persistExpandedFolders(viewMode: FileTreeViewMode, folders: Set<string>) {
  try {
    const saved = JSON.parse(localStorage.getItem(MOBILE_FILE_TREE_EXPANDED_KEY) || '{}') as Record<string, unknown>;
    saved[viewMode] = Array.from(folders);
    localStorage.setItem(MOBILE_FILE_TREE_EXPANDED_KEY, JSON.stringify(saved));
  } catch {
    // 隐私模式或存储空间不足时，展开状态仍保留在当前组件生命周期内。
  }
}

export default function FileTreeView({ starredOnly = false, viewMode = starredOnly ? 'starred' : 'all' }: FileTreeViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { documents, refreshDocuments, updateDocumentLocal } = useDocuments();
  const [expandedFoldersByView, setExpandedFoldersByView] = useState<Record<FileTreeViewMode, Set<string>>>(() => ({
    all: readExpandedFolders('all'),
    starred: readExpandedFolders('starred'),
    recent: readExpandedFolders('recent'),
  }));
  const expandedFolders = expandedFoldersByView[viewMode];
  const [contextMenu, setContextMenu] = useState<{ docId: string; x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [moveDialog, setMoveDialog] = useState<{ id: string; title: string } | null>(null);
  const [moveTargetFolder, setMoveTargetFolder] = useState<string | null>(null);
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [importParentId, setImportParentId] = useState<string | null>(null);
  const markdownInputRef = useRef<HTMLInputElement>(null);

  const [recentDocs, setRecentDocs] = useState<Document[]>([]);
  useEffect(() => {
    if (viewMode !== 'recent') return;
    let cancelled = false;
    getRecentDocuments(50).then(items => {
      if (!cancelled) setRecentDocs(items);
    }).catch(() => {
      if (!cancelled) setRecentDocs([]);
    });
    return () => { cancelled = true; };
  }, [viewMode, documents]);

  const filteredDocs = viewMode === 'recent'
    ? recentDocs
    : viewMode === 'starred' || starredOnly
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

  // 预先按父目录建立索引，避免递归渲染时对整棵文档树重复 filter。
  const childrenByParent = useMemo(() => {
    const groups = new Map<string | null, Document[]>();
    for (const doc of filteredDocs) {
      const group = groups.get(doc.parent_id) ?? [];
      group.push(doc);
      groups.set(doc.parent_id, group);
    }
    for (const group of groups.values()) group.sort(compareFileItem);
    return groups;
  }, [compareFileItem, filteredDocs]);

  const handleToggleFolder = (folderId: string) => {
    setExpandedFoldersByView(prev => {
      const next = new Set(prev[viewMode]);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      persistExpandedFolders(viewMode, next);
      return { ...prev, [viewMode]: next };
    });
  };

  const handleDocumentClick = (doc: Document) => {
    if (doc.type === 'folder') {
      handleToggleFolder(doc.id);
    } else {
      navigate(`/d/${doc.id}`, {
        state: createMobileDocumentState('/', viewMode === 'starred' ? 'starred' : 'files'),
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

  const handleToggleAIExcluded = async (docId: string) => {
    const doc = documents.find(item => item.id === docId);
    if (!doc) return;
    const nextValue = !doc.ai_excluded;
    updateDocumentLocal(docId, { ai_excluded: nextValue });
    setContextMenu(null);
    try {
      await updateDocument(docId, { ai_excluded: nextValue });
      await refreshDocuments();
      showToast(
        doc.type === 'folder'
          ? (nextValue ? '文件夹及其内容将不参与 AI' : '文件夹及其内容已恢复参与 AI')
          : (nextValue ? '已设置为不参与 AI' : '已恢复参与 AI')
      );
    } catch {
      updateDocumentLocal(docId, { ai_excluded: doc.ai_excluded });
      showToast('设置失败，请重试', 'error');
    }
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

  const handleMoveToFolder = async () => {
    if (!moveDialog) return;
    await updateDocument(moveDialog.id, { parent_id: moveTargetFolder });
    await refreshDocuments();
    setMoveDialog(null);
    setMoveTargetFolder(null);
  };

  const handleCreateChildDocument = async (parentId: string, type: 'document' | 'note' | 'excalidraw') => {
    const title = type === 'document' ? '新文章' : type === 'note' ? '新笔记' : '无标题画布';
    const doc = type === 'excalidraw'
      ? await createExcalidrawDocument(title, parentId)
      : await createDocument(title, type, parentId, documents.reduce((max, item) => Math.max(max, item.sort_order), 0) + 1);
    await refreshDocuments();
    setContextMenu(null);
    navigate(`/d/${doc.id}`);
  };

  const handleCreateChildFolder = async (title: string) => {
    if (newFolderParentId === null) return;
    await createDocument(title, 'folder', newFolderParentId, Date.now());
    await refreshDocuments();
    setShowNewFolderDialog(false);
    setNewFolderParentId(null);
  };

  const handleMarkdownImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter(file => /\.(md|markdown)$/i.test(file.name));
    event.target.value = '';
    const parentId = importParentId;
    setImportParentId(null);
    setContextMenu(null);
    for (const [index, file] of files.entries()) {
      const content = await file.text();
      const title = file.name.replace(/\.(md|markdown)$/i, '').trim() || '无标题笔记';
      const doc = await createDocument(title, 'note', parentId, Date.now() + index);
      await createNodesBatch([{ document_id: doc.id, content, parent_node_id: null, sort_order: Date.now() + index }]);
    }
    if (files.length > 0) await refreshDocuments();
  };

  const foldersById = useMemo(() => new Map(documents.filter(doc => doc.type === 'folder').map(folder => [folder.id, folder])), [documents]);
  const folderTree = useMemo(() => {
    const folders = documents.filter(doc => doc.type === 'folder');
    const build = (parentId: string | null): Document[] => folders
      .filter(folder => folder.parent_id === parentId)
      .sort(compareFolderTitle)
      .flatMap(folder => [folder, ...build(folder.id)]);
    return build(null);
  }, [documents]);

  const excludedMoveFolderIds = useMemo(() => {
    if (!moveDialog) return new Set<string>();
    const excluded = new Set<string>([moveDialog.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of documents) {
        if (folder.type === 'folder' && folder.parent_id && excluded.has(folder.parent_id) && !excluded.has(folder.id)) {
          excluded.add(folder.id);
          changed = true;
        }
      }
    }
    return excluded;
  }, [documents, moveDialog]);

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
    const isUnfiledNote = viewMode === 'all' && !starredOnly && depth === 0 && !isFolder && doc.parent_id === null;
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
            <span aria-hidden="true" className="absolute left-4 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-[var(--app-link)]" />
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

          {!isFolder && doc.is_starred && (
            <Bookmark
              aria-label="已收藏"
              className="h-3.5 w-3.5 shrink-0 text-[var(--app-link)]"
              fill="currentColor"
            />
          )}

          {doc.ai_excluded && (
            <Sparkles aria-label="不参与 AI" className="h-3.5 w-3.5 shrink-0 text-gray-400" />
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
    const children = childrenByParent.get(parentId) ?? [];

    return children.map(doc => {
      const isFolder = doc.type === 'folder';
      const isExpanded = expandedFolders.has(doc.id);
      const childDocs = childrenByParent.get(doc.id) ?? [];
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
    <div className="flex-1 overflow-y-auto px-2 py-2 pb-[96px] custom-scrollbar scrollbar-auto-hide">
      {filteredDocs.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-8">
          {viewMode === 'starred' ? '暂无收藏' : viewMode === 'recent' ? '暂无最近编辑' : '暂无文档'}
        </div>
      ) : viewMode === 'starred' || starredOnly ? (
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
            className="fixed z-[10000] max-h-[calc(100dvh-16px)] w-52 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
            style={{ left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 216)), top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 420)) }}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {doc.type !== 'folder' && (
              <button type="button" onPointerDown={stopMenuPointer} onClick={(e) => { stopMenuEvent(e); void handleStar(contextMenu.docId); }} className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                <Star className={`w-4 h-4 ${doc.is_starred ? 'fill-current text-yellow-500' : 'text-gray-400'}`} />
                {doc.is_starred ? '取消收藏' : '收藏'}
              </button>
            )}
            {doc.type !== 'folder' && (
              <button type="button" onPointerDown={stopMenuPointer} onClick={(e) => { stopMenuEvent(e); void handleCopy(contextMenu.docId); }} className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                <Copy className="w-4 h-4 text-gray-400" />
                复制
              </button>
            )}
            <button type="button" onPointerDown={stopMenuPointer} onClick={(e) => { stopMenuEvent(e); handleRename(contextMenu.docId); }} className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              重命名
            </button>
            {doc.type !== 'folder' && (
              <button type="button" onPointerDown={stopMenuPointer} onClick={(e) => { stopMenuEvent(e); setMoveDialog({ id: doc.id, title: doc.title || '无标题' }); setMoveTargetFolder(doc.parent_id); setContextMenu(null); }} className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                <Move className="w-4 h-4" />
                移动到文件夹
              </button>
            )}
            {doc.type !== 'folder' && (
              <button type="button" onPointerDown={stopMenuPointer} onClick={(e) => { stopMenuEvent(e); void handleToggleAIExcluded(contextMenu.docId); }} className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                <Sparkles className={`w-4 h-4 ${doc.ai_excluded ? 'text-gray-400' : 'text-blue-500'}`} />
                {doc.ai_excluded ? '取消不参与 AI' : '不参与 AI'}
              </button>
            )}
            {doc.type === 'folder' && (
              <>
                <button type="button" onPointerDown={stopMenuPointer} onClick={(e) => { stopMenuEvent(e); void handleCreateChildDocument(doc.id, 'document'); }} className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                  <DocumentTypeIcon type="document" className="w-4 h-4" />
                  新建大纲笔记
                </button>
                <button type="button" onPointerDown={stopMenuPointer} onClick={(e) => { stopMenuEvent(e); void handleCreateChildDocument(doc.id, 'note'); }} className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                  <DocumentTypeIcon type="note" className="w-4 h-4" />
                  新建普通笔记
                </button>
                <button type="button" onPointerDown={stopMenuPointer} onClick={(e) => { stopMenuEvent(e); setImportParentId(doc.id); markdownInputRef.current?.click(); }} className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                  <FileUp className="w-4 h-4 text-gray-400" />
                  批量导入 md
                </button>
                <button type="button" onPointerDown={stopMenuPointer} onClick={(e) => { stopMenuEvent(e); void handleCreateChildDocument(doc.id, 'excalidraw'); }} className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                  <DocumentTypeIcon type="excalidraw" className="w-4 h-4" />
                  新建画布
                </button>
                <button type="button" onPointerDown={stopMenuPointer} onClick={(e) => { stopMenuEvent(e); setNewFolderParentId(doc.id); setShowNewFolderDialog(true); setContextMenu(null); }} className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                  <DocumentTypeIcon type="folder" className="w-4 h-4" />
                  新建子文件夹
                </button>
                <button type="button" onPointerDown={stopMenuPointer} onClick={(e) => { stopMenuEvent(e); void handleToggleAIExcluded(contextMenu.docId); }} className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                  <Sparkles className={`w-4 h-4 ${doc.ai_excluded ? 'text-gray-400' : 'text-blue-500'}`} />
                  {doc.ai_excluded ? '取消文件夹不参与 AI' : '文件夹不参与 AI'}
                </button>
                <button type="button" onPointerDown={stopMenuPointer} onClick={(e) => { stopMenuEvent(e); setMoveDialog({ id: doc.id, title: doc.title || '文件夹' }); setMoveTargetFolder(doc.parent_id); setContextMenu(null); }} className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                  <Move className="w-4 h-4 text-gray-400" />
                  移动到文件夹
                </button>
              </>
            )}
            <button type="button" onPointerDown={stopMenuPointer} onClick={(e) => { stopMenuEvent(e); handleDeleteClick(contextMenu.docId); }} className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              删除
            </button>
          </div>
        );
      })()}

      {moveDialog && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" onClick={() => { setMoveDialog(null); setMoveTargetFolder(null); }}>
          <div className="w-full max-w-sm max-h-[75dvh] flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800" onClick={e => e.stopPropagation()}>
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">移动到文件夹</h3>
              <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{moveDialog.title}</p>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2 custom-scrollbar">
              <button type="button" onClick={() => setMoveTargetFolder(null)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${moveTargetFolder === null ? 'bg-[var(--app-link)]/10 text-[var(--app-link)]' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}`}>
                <Folder className="h-4 w-4 shrink-0" />根目录
              </button>
              {folderTree.filter(folder => !excludedMoveFolderIds.has(folder.id)).map(folder => {
                const depth = (() => { let value = 0; let current = folder; while (current.parent_id) { value += 1; current = foldersById.get(current.parent_id) ?? current; if (current === folder) break; } return value; })();
                return (
                  <button key={folder.id} type="button" onClick={() => setMoveTargetFolder(folder.id)} className={`flex w-full items-center gap-2 rounded-lg py-2 pr-3 text-left text-sm ${moveTargetFolder === folder.id ? 'bg-[var(--app-link)]/10 text-[var(--app-link)]' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}`} style={{ paddingLeft: `${12 + depth * 16}px` }}>
                    <Folder className="h-4 w-4 shrink-0" />
                    <span className="truncate">{folder.title || '无标题'}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
              <button type="button" onClick={() => { setMoveDialog(null); setMoveTargetFolder(null); }} className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">取消</button>
              <button type="button" onClick={() => void handleMoveToFolder()} className="rounded-lg bg-[var(--app-link)] px-3 py-1.5 text-sm text-white hover:opacity-90">移动</button>
            </div>
          </div>
        </div>
      )}

      <DeleteConfirmDialog
        isOpen={!!deleteTarget}
        title="删除确认"
        message={deleteTarget ? `确定要删除「${deleteTarget.title}」吗？` : ''}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        showBackdrop={false}
      />
      <NewFolderDialog
        isOpen={showNewFolderDialog}
        onConfirm={(title) => { void handleCreateChildFolder(title); }}
        onCancel={() => { setShowNewFolderDialog(false); setNewFolderParentId(null); }}
      />
      <input
        ref={markdownInputRef}
        type="file"
        accept=".md,.markdown,text/markdown"
        multiple
        className="hidden"
        onChange={(event) => { void handleMarkdownImport(event); }}
      />
    </div>
  );
}
