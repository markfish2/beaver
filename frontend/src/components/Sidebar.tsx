import { Search, FileText, ChevronDown, Plus, Trash, Star, LogOut, ChevronLeft, ChevronRight, Folder, Edit2, CalendarDays, MoreHorizontal, Copy, ArrowUpRight, FolderPlus, FilePlus, FileUp, Move, Frame, StickyNote, Key, Lock, Sparkles, User, Archive, Palette, SquarePen } from 'lucide-react';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createDocument, deleteDocument, updateDocument, copyDocument, getNodes, createNodesBatch, createMemo, uploadFile, search as apiSearch, getTodos, createTodo, updateTodo, getMonthlyDiary, getOrCreateDayNode } from '../api/data';
import type { Document as DocType, SearchResultItem, Todo } from '../api/data';
import { createExcalidrawDocument, getExcalidrawDataFresh } from '../api/excalidraw';
import { saveStateManager } from '../utils/saveStateManager';
import { nodesToMemoMarkdown } from '../utils/convertNode';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDocuments } from '../context/DocumentContext';
import { useSearch } from '../context/SearchContext';
import { useUserView } from '../context/UserViewContext';
import type { UserSubView } from '../context/UserViewContext';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import NewFolderDialog from './NewFolderDialog';
import EditFolderDialog from './EditFolderDialog';
import FolderIcon from './FolderIcon';
import DocumentTypeIcon from './DocumentTypeIcon';
import NavigationIcon from './NavigationIcon';
import DiaryCalendar from './DiaryCalendar';
import TokenDialog from './TokenDialog';
import TrashDialog from './TrashDialog';
import PasswordDialog from './PasswordDialog';
import MemoSidebarContent from './MemoSidebarContent';
import AISettings from './AISettings';
import AIChatSidebar from './AIChatSidebar';
import { getProjects, createProject, updateProject, deleteProject, archiveProject } from '../api/projects';
import type { Project } from '../api/projects';
import { formatRelativeTime, highlightSidebarText as highlightText } from './sidebarFormatting';
import { useFontSettings } from './FontSettings';
import { useIsDark } from '../hooks/useIsDark';
import { logNavigation } from '../utils/navigationDebug';
import { showToast } from '../utils/toast';

interface SidebarProps {
  onDocumentSelect?: () => void;
  isMobile?: boolean;
  onUserSubViewChange?: (subView: UserSubView | null) => void;
}

const SIDEBAR_WIDTH_KEY = 'sidebar_width';
const SIDEBAR_PANEL_STATE_KEY = 'sidebar_panel_state';
const SIDEBAR_FOLDERS_STATE_KEY = 'sidebar_folders_state';
const ICON_RAIL_WIDTH = 48;

const DEFAULT_PANEL_WIDTH = 212;  // 260 - 48 = 212 (total visual width stays 260)
const MIN_PANEL_WIDTH = 160;
const MAX_PANEL_WIDTH = 460;
const navigationNonce = () => Date.now();
const DOCUMENT_ITEM_TYPES = new Set<DocType['type']>(['document', 'note', 'excalidraw']);

const compareFolderTitle = (a: DocType, b: DocType) =>
  (a.title || '').localeCompare(b.title || '', 'zh-CN', {
    numeric: true,
    sensitivity: 'base',
  });

const resolveDocumentSortTime = (doc: DocType) => {
  const updatedAt = doc.updated_at ? Date.parse(doc.updated_at) : 0;
  if (Number.isFinite(updatedAt) && updatedAt > 0) return updatedAt;
  return doc.sort_order || 0;
};

const compareDocumentByLastEditedDesc = (sortTimes: Map<string, number>) => (a: DocType, b: DocType) => {
  const timeDiff = (sortTimes.get(b.id) || 0) - (sortTimes.get(a.id) || 0);
  if (timeDiff !== 0) return timeDiff;
  return (b.sort_order || 0) - (a.sort_order || 0);
};

const compareFileMenuItem = (sortTimes: Map<string, number>) => (a: DocType, b: DocType) => {
  const aIsFolder = a.type === 'folder';
  const bIsFolder = b.type === 'folder';
  if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
  if (aIsFolder && bIsFolder) return compareFolderTitle(a, b);
  return compareDocumentByLastEditedDesc(sortTimes)(a, b);
};

type ViewMode = 'diary' | 'all' | 'starred' | 'recent' | 'memo' | 'user' | 'ai' | 'projects';
const VIEW_MODES: ViewMode[] = ['diary', 'all', 'starred', 'recent', 'memo', 'user', 'ai', 'projects'];

const Sidebar = ({ onDocumentSelect, isMobile = false, onUserSubViewChange }: SidebarProps) => {
  const { documents, isLoading, refreshDocuments, updateDocumentLocal, moveDocument, addDocument, removeDocument } = useDocuments();
  const { setSearchOpen } = useSearch();
  const [isExpanded, setIsExpanded] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(SIDEBAR_FOLDERS_STATE_KEY) || '{}');
    } catch {
      return {};
    }
  });
  const [, setShowUserMenu] = useState(false);
  const [contentExpanded, setContentExpanded] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(SIDEBAR_PANEL_STATE_KEY) || '{}').expanded === true;
    } catch {
      return false;
    }
  });
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const visibleSearchResults = isSearchMode && sidebarSearchQuery.trim() ? searchResults : [];
  const [searchLoading, setSearchLoading] = useState(false);
  const [recentDocuments, setRecentDocuments] = useState<DocType[]>([]);

  // 防抖搜索 - 调用后端全文搜索 API
  useEffect(() => {
    if (!isSearchMode || !sidebarSearchQuery.trim()) {
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const resp = await apiSearch(sidebarSearchQuery.trim());
        setSearchResults(resp.results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [sidebarSearchQuery, isSearchMode]);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const savedMode: unknown = JSON.parse(sessionStorage.getItem(SIDEBAR_PANEL_STATE_KEY) || '{}').viewMode;
      if (typeof savedMode === 'string' && VIEW_MODES.includes(savedMode as ViewMode)) {
        return savedMode as ViewMode;
      }
      return localStorage.getItem('selectedProjectId') ? 'projects' : 'diary';
    } catch {
      return 'diary';
    }
  });
  const { userSubView, setUserSubView: setUserSubViewContext, activeConvId, setActiveConvId, selectedProjectId, setSelectedProjectId } = useUserView();
  const [showNewMenu, setShowNewMenu] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(SIDEBAR_PANEL_STATE_KEY, JSON.stringify({
        expanded: contentExpanded,
        viewMode,
      }));
    } catch {
      // 会话存储不可用时仍保持当前组件内状态
    }
  }, [contentExpanded, viewMode]);

  useEffect(() => {
    try {
      sessionStorage.setItem(SIDEBAR_FOLDERS_STATE_KEY, JSON.stringify(isExpanded));
    } catch {
      // 会话存储不可用时仍保持当前组件内状态
    }
  }, [isExpanded]);

  const { setTheme } = useFontSettings();
  const isDark = useIsDark();

  const toggleDark = useCallback(() => {
    setTheme(isDark ? 'system' : 'dark');
  }, [isDark, setTheme]);

  // Wrapper to update both context and notify parent
  const setUserSubView = useCallback((view: UserSubView) => {
    setUserSubViewContext(view);
    onUserSubViewChange?.(view);
  }, [setUserSubViewContext, onUserSubViewChange]);

  // Notify parent when userSubView changes
  useEffect(() => {
    if (viewMode === 'user') {
      onUserSubViewChange?.(userSubView || 'profile');
    } else {
      onUserSubViewChange?.(null);
    }
  }, [viewMode, userSubView, onUserSubViewChange]);

  // 获取最近编辑的文档
  useEffect(() => {
    if (viewMode === 'recent') {
      import('../api/data').then(mod => mod.getRecentDocuments(20)).then(setRecentDocuments).catch(() => {});
    }
  }, [viewMode]);
  const [newMenuTarget] = useState<string | null>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const markdownInputRef = useRef<HTMLInputElement>(null);
  const markdownImportParentRef = useRef<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ show: boolean; id: string; title: string; type: 'document' | 'folder'; deleteMode?: 'move' | 'all' }>({ show: false, id: '', title: '', type: 'document' });
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [editFolderDialog, setEditFolderDialog] = useState<{ show: boolean; id: string; title: string; icon?: string }>({ show: false, id: '', title: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImportingMarkdown, setIsImportingMarkdown] = useState(false);
  const [draggedItem, setDraggedItem] = useState<{ id: string; type: 'document' | 'folder' } | null>(null);
  const draggedItemRef = useRef<{ id: string; type: 'document' | 'folder' } | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);
  const [, setSelectedFolderId] = useState<string | null>(null);
  const [clickedFolderId, setClickedFolderId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return stored ? parseInt(stored, 10) : DEFAULT_PANEL_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [pendingTasks, setPendingTasks] = useState<Todo[]>([]);
  const [showTodoDialog, setShowTodoDialog] = useState(false);
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [showTrashDialog, setShowTrashDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showAISettings, setShowAISettings] = useState(false);
  const [todoText, setTodoText] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectContextMenu, setProjectContextMenu] = useState<{ id: string; name: string; x: number; y: number } | null>(null);
  const [showProjectDeleteDialog, setShowProjectDeleteDialog] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<{ id: string; name: string } | null>(null);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const projectContextMenuRef = useRef<HTMLDivElement>(null);
  const todoInputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    docId: string; docTitle: string; docType: 'document' | 'folder'; isStarred: boolean; aiExcluded: boolean; x: number; y: number; buttonBottom: number;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [rootContextMenu, setRootContextMenu] = useState<{ x: number; y: number } | null>(null);
  const rootContextMenuRef = useRef<HTMLDivElement>(null);
  const [moveDialog, setMoveDialog] = useState<{ show: boolean; docId: string; docTitle: string; docType: 'document' | 'folder' }>({ show: false, docId: '', docTitle: '', docType: 'document' });
  const [moveTargetFolder, setMoveTargetFolder] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const pendingFolderParentRef = useRef<string | null>(null);
  
  const listRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const resizingRef = useRef(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const documentId = useMemo(() => {
    const match = location.pathname.match(/^\/d\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : undefined;
  }, [location.pathname]);

  // Fetch pending tasks when diary view is active
  const fetchPendingTasks = useCallback(async () => {
    try {
      const todos = await getTodos(false);
      setPendingTasks(todos);
    } catch {
      setPendingTasks([]);
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'diary' && contentExpanded) {
      const timer = window.setTimeout(() => void fetchPendingTasks(), 0);
      return () => window.clearTimeout(timer);
    }
  }, [viewMode, contentExpanded, fetchPendingTasks]);

  useEffect(() => {
    if (showTodoDialog && todoInputRef.current) {
      todoInputRef.current.focus();
    }
  }, [showTodoDialog]);

  useEffect(() => {
    if (viewMode === 'projects' && projects.length === 0) {
      getProjects().then(setProjects).catch(console.error);
    } else if (viewMode !== 'projects') {
      // 切换到非项目视图时，清除选中的项目，让 MainArea 显示正常内容
      const timer = window.setTimeout(() => setSelectedProjectId(null), 0);
      return () => window.clearTimeout(timer);
    }
  }, [viewMode, projects.length, setSelectedProjectId]);

  useEffect(() => {
    const refreshProjects = () => {
      getProjects().then(setProjects).catch(console.error);
    };
    window.addEventListener('projects-refresh', refreshProjects);
    return () => window.removeEventListener('projects-refresh', refreshProjects);
  }, []);

  const openArchivedProjects = useCallback(() => {
    setIsSearchMode(false);
    setUserSubViewContext(null);
    setViewMode('projects');
    setContentExpanded(true);
    setSelectedProjectId(null);
    window.dispatchEvent(new CustomEvent('projects-open-archived'));
  }, [setSelectedProjectId, setUserSubViewContext]);

  const closeArchivedProjects = useCallback(() => {
    window.dispatchEvent(new CustomEvent('projects-close-archived'));
  }, []);

  useEffect(() => {
    if (viewMode !== 'projects') {
      closeArchivedProjects();
    }
  }, [closeArchivedProjects, viewMode]);

  // 监听从其他组件（如近7天计划）切换到项目视图的事件
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.view === 'projects') {
        setViewMode('projects');
        if (detail.projectId) setSelectedProjectId(detail.projectId);
      }
    };
    window.addEventListener('switch-view', handler);
    return () => window.removeEventListener('switch-view', handler);
  }, [setSelectedProjectId]);








  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
      if (rootContextMenuRef.current && !rootContextMenuRef.current.contains(event.target as Node)) {
        setRootContextMenu(null);
      }
      if (newMenuRef.current && !newMenuRef.current.contains(event.target as Node)) {
        setShowNewMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!projectContextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (projectContextMenuRef.current && !projectContextMenuRef.current.contains(e.target as Node)) {
        setProjectContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [projectContextMenu]);

  // 监听外部 toggleSidebar 事件（移动端汉堡菜单触发）
  useEffect(() => {
    const handleToggle = () => {
      setContentExpanded(prev => {
        const next = !prev;
        if (next) {
          setIsSearchMode(true);
          setTimeout(() => searchInputRef.current?.focus(), 100);
        } else {
          setIsSearchMode(false);
        }
        window.dispatchEvent(new CustomEvent(next ? 'sidebarOpen' : 'sidebarClose'));
        return next;
      });
    };
    window.addEventListener('toggleSidebar', handleToggle);
    return () => window.removeEventListener('toggleSidebar', handleToggle);
  }, []);

  // Clear folder selection when clicking outside sidebar
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        setSelectedFolderId(null);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!resizingRef.current) return;

      const newWidth = e.clientX - ICON_RAIL_WIDTH;
      if (newWidth >= MIN_PANEL_WIDTH && newWidth <= MAX_PANEL_WIDTH) {
        if (sidebarRef.current) {
          sidebarRef.current.style.width = `${newWidth}px`;
        }
      }
    };

    const handlePointerUp = () => {
      if (resizingRef.current) {
        resizingRef.current = false;
        setIsResizing(false);
        if (sidebarRef.current) {
          const finalWidth = parseInt(sidebarRef.current.style.width, 10);
          setSidebarWidth(finalWidth);
        }
      }
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const filteredDocuments = useMemo(() => {
    let filtered = documents;
    
    if (viewMode === 'starred') {
      filtered = filtered.filter(d => d.is_starred);
    }
    
    return filtered;
  }, [documents, viewMode]);

  const documentSortTimes = useMemo(() => {
    const map = new Map<string, number>();
    for (const doc of documents) {
      map.set(doc.id, resolveDocumentSortTime(doc));
    }
    return map;
  }, [documents]);

  const compareByLastEdited = useMemo(() => compareDocumentByLastEditedDesc(documentSortTimes), [documentSortTimes]);
  const compareFileItem = useMemo(() => compareFileMenuItem(documentSortTimes), [documentSortTimes]);

  // 预排序的 children 索引，避免 renderFileTree 每次排序
  const sortedChildrenMap = useMemo(() => {
    const map = new Map<string | null, typeof filteredDocuments>();
    for (const doc of filteredDocuments) {
      const key = doc.parent_id || null;
      let arr = map.get(key);
      if (!arr) { arr = []; map.set(key, arr); }
      arr.push(doc);
    }
    for (const arr of map.values()) arr.sort(compareFileItem);
    return map;
  }, [compareFileItem, filteredDocuments]);

  const localSearchResults = useMemo(() => {
    if (!sidebarSearchQuery.trim()) {
      return null;
    }
    
    const query = sidebarSearchQuery.toLowerCase().trim();
    return documents
      .filter(d => DOCUMENT_ITEM_TYPES.has(d.type) && d.title.toLowerCase().includes(query))
      .sort(compareByLastEdited);
  }, [compareByLastEdited, documents, sidebarSearchQuery]);

  const handleCreateDocument = async (parentId?: string | null) => {
    try {
      const pid = parentId !== undefined ? parentId : newMenuTarget;
      const newDoc = await createDocument('新文章', 'document', pid, Date.now());
      addDocument(newDoc);
      closeArchivedProjects();
      navigate(`/d/${newDoc.id}`);
      onDocumentSelect?.();
      window.dispatchEvent(new CustomEvent('sidebarClose'));
    } catch (error) {
      console.error('Failed to create document', error);
    }
  };

  const handleCreateNote = async (parentId?: string | null) => {
    try {
      const pid = parentId !== undefined ? parentId : newMenuTarget;
      const newDoc = await createDocument('新笔记', 'note', pid, Date.now());
      addDocument(newDoc);
      closeArchivedProjects();
      navigate(`/d/${newDoc.id}`);
      onDocumentSelect?.();
      window.dispatchEvent(new CustomEvent('sidebarClose'));
    } catch (error) {
      console.error('Failed to create note', error);
    }
  };

  const openMarkdownImport = (parentId: string | null = null) => {
    markdownImportParentRef.current = parentId;
    markdownInputRef.current?.click();
  };

  const handleMarkdownImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter(file => /\.(md|markdown)$/i.test(file.name));
    event.target.value = '';
    if (files.length === 0) return;

    const parentId = markdownImportParentRef.current;
    markdownImportParentRef.current = null;
    setIsImportingMarkdown(true);
    let importedCount = 0;
    let failedCount = 0;

    try {
      for (const [index, file] of files.entries()) {
        try {
          const content = await file.text();
          const title = file.name.replace(/\.(md|markdown)$/i, '').trim() || '无标题笔记';
          const newDoc = await createDocument(title, 'note', parentId, Date.now() + index);
          const createdNodes = await createNodesBatch([{
            document_id: newDoc.id,
            content,
            parent_node_id: null,
            sort_order: Date.now() + index,
          }]);
          if (createdNodes.length !== 1 || createdNodes[0].content !== content) {
            throw new Error('Markdown 正文校验失败');
          }
          addDocument(newDoc);
          importedCount += 1;
        } catch (error) {
          failedCount += 1;
          console.error(`导入 Markdown 文件失败：${file.name}`, error);
        }
      }
      closeArchivedProjects();
      if (failedCount > 0) {
        showToast(`已导入 ${importedCount} 个 md 文件，${failedCount} 个文件导入失败`, 'error');
      } else {
        showToast(`已成功导入 ${importedCount} 个 md 文件`);
      }
    } finally {
      setIsImportingMarkdown(false);
    }
  };

  const handleCreateTodo = async () => {
    if (!todoText.trim()) return;
    try {
      await createTodo(todoText.trim());
      setTodoText('');
      setShowTodoDialog(false);
      fetchPendingTasks();
    } catch (error) {
      console.error('Failed to create todo', error);
    }
  };

  const handleTodoToggle = async (todoId: string) => {
    try {
      await updateTodo(todoId, { is_completed: true });
      setPendingTasks(prev => prev.filter(t => t.id !== todoId));
    } catch (error) {
      console.error('Failed to toggle todo', error);
    }
  };

  const handleCreateExcalidraw = async (parentId?: string | null) => {
    try {
      const pid = parentId !== undefined ? parentId : newMenuTarget;
      const newDoc = await createExcalidrawDocument('无标题画布', pid);
      addDocument(newDoc);
      closeArchivedProjects();
      navigate(`/d/${newDoc.id}`);
      onDocumentSelect?.();
      window.dispatchEvent(new CustomEvent('sidebarClose'));
    } catch (error) {
      console.error('Failed to create excalidraw document', error);
    }
  };

  const handleCreateFolder = async (title: string) => {
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      const pid = pendingFolderParentRef.current ?? newMenuTarget;
      pendingFolderParentRef.current = null;
      const newDoc = await createDocument(title, 'folder', pid, Date.now());
      addDocument(newDoc);
      setShowNewFolderDialog(false);
    } catch (error) {
      console.error('Failed to create folder', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRootContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (viewMode !== 'all' && viewMode !== 'starred' && viewMode !== 'recent') return;
    if ((e.target as HTMLElement).closest('[data-file-tree-item]')) return;
    e.preventDefault();
    setContextMenu(null);
    setRootContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleEditFolder = async (folderId: string, title: string) => {
    const oldDoc = documents.find(d => d.id === folderId);
    const oldTitle = oldDoc?.title;
    try {
      updateDocumentLocal(folderId, { title });
      setEditFolderDialog({ ...editFolderDialog, show: false });
      await updateDocument(folderId, { title });
    } catch (error) {
      console.error('Failed to edit folder', error);
      if (oldTitle) updateDocumentLocal(folderId, { title: oldTitle });
    }
  };

  const confirmDelete = async () => {
    const deletedId = deleteDialog.id;
    const deletedDoc = documents.find(d => d.id === deletedId);
    const deleteChildren = deleteDialog.type === 'folder' && deleteDialog.deleteMode === 'all';
    try {
      if (deleteChildren) {
        // 递归删除：移除文件夹和所有子项
        const childIds = documents.filter(d => d.parent_id === deletedId).map(d => d.id);
        removeDocument(deletedId);
        childIds.forEach(id => removeDocument(id));
      } else {
        // 仅删除文件夹，子项移到根目录
        documents.filter(d => d.parent_id === deletedId).forEach(d => {
          moveDocument(d.id, null);
        });
        removeDocument(deletedId);
      }
      if (documentId === deletedId) {
        navigate('/');
      }
      setDeleteDialog({ ...deleteDialog, show: false });
      await deleteDocument(deletedId, deleteChildren);
    } catch (error) {
      console.error('Failed to delete', error);
      if (deletedDoc) addDocument(deletedDoc);
    }
  };

  const toggleExpand = (id: string) => {
    setIsExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSidebar = () => {
    setContentExpanded(prev => !prev);
  };

  const handleSearchResultClick = (result: SearchResultItem) => {
    closeArchivedProjects();
    switch (result.result_type) {
      case 'document':
      case 'document_title':
        navigate(result.node_id
          ? `/d/${result.entity_id}?nodeId=${result.node_id}&_t=${navigationNonce()}`
          : `/d/${result.entity_id}?_t=${navigationNonce()}`);
        break;
      case 'diary':
        navigate(`/d/${result.entity_id}?_t=${navigationNonce()}`);
        break;
      case 'memo':
        navigate(`/?highlight=${result.entity_id}&_t=${navigationNonce()}`);
        break;
    }
    onDocumentSelect?.();
    if (isMobile) setContentExpanded(false);
  };

  const toggleViewPanel = (nextView: ViewMode) => {
    logNavigation('sidebar-toggle-view-panel', {
      fromView: viewMode,
      toView: nextView,
      contentExpanded,
    });
    setIsSearchMode(false);
    setUserSubViewContext(null);
    if (viewMode === nextView && contentExpanded) {
      setContentExpanded(false);
      return;
    }
    setViewMode(nextView);
    setContentExpanded(true);
  };

  const docResults = visibleSearchResults.filter(r => r.result_type === 'document' || r.result_type === 'document_title');
  const diaryResults = visibleSearchResults.filter(r => r.result_type === 'diary');
  const memoResults = visibleSearchResults.filter(r => r.result_type === 'memo');

  const handleSelect = (id: string, type: 'document' | 'folder' | 'note' | 'excalidraw') => {
    logNavigation('sidebar-handle-select', {
      documentId: id,
      type,
      viewMode,
      contentExpanded,
    });
    setContextMenu(null);
    if (type === 'document' || type === 'note' || type === 'excalidraw') {
      closeArchivedProjects();
      navigate(`/d/${id}`);
      onDocumentSelect?.();
      setSelectedFolderId(null);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('sidebarClose'));
      }, 0);
    } else {
      setSelectedFolderId(id);
      toggleExpand(id);
      setClickedFolderId(id);
      setTimeout(() => setClickedFolderId(null), 300);
    }
  };

  const handleDragStart = (e: React.DragEvent, doc: DocType) => {
    e.dataTransfer.effectAllowed = 'move';
    const item = { id: doc.id, type: doc.type };
    draggedItemRef.current = item;
    setDraggedItem(item);
  };

  const handleDragOver = (e: React.DragEvent, doc: DocType) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (draggedItem && draggedItem.id !== doc.id) {
      setDragOverItem(doc.id);
    }
  };

  const handleDragLeave = () => {
    setDragOverItem(null);
  };

  const handleDrop = async (e: React.DragEvent, targetDoc: DocType) => {
    e.preventDefault();
    setDragOverItem(null);

    const dragged = draggedItemRef.current;
    if (!dragged || dragged.id === targetDoc.id) return;

    const newParentId = targetDoc.type === 'folder' ? targetDoc.id : targetDoc.parent_id;
    // Auto-expand target folder so the moved item is visible
    if (targetDoc.type === 'folder' && !isExpanded[targetDoc.id]) {
      setIsExpanded(prev => ({ ...prev, [targetDoc.id]: true }));
    }
    // Optimistic update: immediately update local state
    moveDocument(dragged.id, newParentId ?? null);
    draggedItemRef.current = null;
    setDraggedItem(null);

    try {
      if (!navigator.onLine) {
        saveStateManager.markPending(`doc-move-${dragged.id}`, { documentId: dragged.id, changes: { parent_id: newParentId }, operationType: 'updateDocument' }, 'updateDocument');
      } else {
        await updateDocument(dragged.id, { parent_id: newParentId });
      }
    } catch (error) {
      console.error('Failed to move document', error);
    }
  };

  const handleDragEnd = () => {
    draggedItemRef.current = null;
    setDraggedItem(null);
    setDragOverItem(null);
  };

  // Long-press for mobile context menu
  const startLongPress = (e: React.TouchEvent, doc: DocType) => {
    longPressTriggeredRef.current = false;
    const touch = e.touches[0];
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setContextMenu({
        docId: doc.id,
        docTitle: doc.title || '无标题',
        docType: doc.type,
        isStarred: doc.is_starred,
        aiExcluded: doc.ai_excluded || false,
        x: touch.clientX,
        y: touch.clientY,
        buttonBottom: touch.clientY,
      });
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleMoveToFolder = async (targetFolderId: string | null) => {
    const { docId } = moveDialog;
    const doc = documents.find(d => d.id === docId);
    if (!doc || doc.parent_id === targetFolderId) {
      setMoveTargetFolder(null);
      setMoveDialog({ show: false, docId: '', docTitle: '', docType: 'document' });
      return;
    }
    // Optimistic update
    moveDocument(docId, targetFolderId);
    setMoveTargetFolder(null);
    setMoveDialog({ show: false, docId: '', docTitle: '', docType: 'document' });
    // Auto-expand target folder
    if (targetFolderId && !isExpanded[targetFolderId]) {
      setIsExpanded(prev => ({ ...prev, [targetFolderId]: true }));
    }
    try {
      if (!navigator.onLine) {
        saveStateManager.markPending(`doc-move-${docId}`, { documentId: docId, changes: { parent_id: targetFolderId }, operationType: 'updateDocument' }, 'updateDocument');
      } else {
        await updateDocument(docId, { parent_id: targetFolderId });
      }
    } catch (error) {
      console.error('Failed to move document', error);
    }
  };

  const handleRootDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverItem(null);

    const dragged = draggedItemRef.current;
    if (!dragged) return;

    // Optimistic update
    moveDocument(dragged.id, null);
    draggedItemRef.current = null;
    setDraggedItem(null);

    try {
      if (!navigator.onLine) {
        saveStateManager.markPending(`doc-move-${dragged.id}`, { documentId: dragged.id, changes: { parent_id: null }, operationType: 'updateDocument' }, 'updateDocument');
      } else {
        await updateDocument(dragged.id, { parent_id: null });
      }
    } catch (error) {
      console.error('Failed to move document', error);
    }
  };

  const renderFileTree = (parentId: string | null, level: number) => {
    let children;

    if (sidebarSearchQuery.trim() && localSearchResults) {
      if (parentId === null) {
        children = localSearchResults;
      } else {
        return null;
      }
    } else if (viewMode === 'starred') {
      if (parentId === null) {
        children = filteredDocuments
          .filter(d => DOCUMENT_ITEM_TYPES.has(d.type))
          .sort(compareByLastEdited);
      } else {
        return null;
      }
    } else if (viewMode === 'recent') {
      if (parentId === null) {
        children = recentDocuments;
      } else {
        return null;
      }
    } else {
      // 使用预排序索引，O(1) 查找
      children = sortedChildrenMap.get(parentId) || [];
    }

    if (children.length === 0) return null;

    return (
      <div className="space-y-px">
        {children.map((doc) => {
          const isFolder = doc.type === 'folder';
          const folderIconType = isFolder && isExpanded[doc.id] ? 'folder-open' : doc.type;
          return (
            <div key={doc.id}>
              <div
                data-file-tree-item
                draggable
                onDragStart={(e) => handleDragStart(e, doc)}
                onDragOver={(e) => handleDragOver(e, doc)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, doc)}
                onDragEnd={handleDragEnd}
                className={`flex items-center px-2 py-1.5 rounded-full cursor-pointer group transition-all ${
                  documentId === doc.id
                    ? 'bg-[#f1f1f1] text-gray-900 dark:bg-gray-700 dark:text-gray-100 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200'
                } ${dragOverItem === doc.id && isFolder ? 'bg-gray-500 ring-2 ring-gray-400' : ''} ${
                  draggedItem?.id === doc.id ? 'opacity-50' : ''
                } ${clickedFolderId === doc.id ? 'bg-gray-300/70 dark:bg-gray-600/70' : ''}`}
                style={{
                  marginLeft: `${level * 12 + 4}px`,
                  paddingLeft: '4px',
                }}
                onClick={(e) => {
                  if (longPressTriggeredRef.current) {
                    longPressTriggeredRef.current = false;
                    return;
                  }
                  if (isFolder) e.stopPropagation();
                  handleSelect(doc.id, doc.type);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setRootContextMenu(null);
                  setContextMenu({
                    docId: doc.id,
                    docTitle: doc.title || '无标题',
                    docType: doc.type,
                    isStarred: doc.is_starred,
                    aiExcluded: doc.ai_excluded || false,
                    x: e.clientX,
                    y: e.clientY,
                    buttonBottom: e.clientY,
                  });
                }}
                onTouchStart={(e) => startLongPress(e, doc)}
                onTouchEnd={cancelLongPress}
                onTouchMove={cancelLongPress}
              >
                <span className="flex items-center mr-1.5 shrink-0 relative">
                  {isFolder && (
                    isExpanded[doc.id] ? <ChevronDown className="w-3.5 h-3.5 mr-0.5 text-gray-400 dark:text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 mr-0.5 text-gray-400 dark:text-gray-500" />
                  )}
                  <DocumentTypeIcon type={folderIconType} className={`h-5 w-5 ${!isFolder ? 'ml-4' : ''}`} />
                  {!isFolder && doc.is_starred && (
                    <Star className="w-2 h-2 fill-current text-yellow-500 absolute -top-0.5 -right-0.5" />
                  )}
                  {!isFolder && doc.ai_excluded && (
                    <svg className="w-3.5 h-3.5 absolute -bottom-1 -right-1" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" fill="#ef4444" stroke="white" strokeWidth="1.5"/>
                      <line x1="6" y1="6" x2="18" y2="18" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  )}
                </span>

                <span className={`truncate flex-1 ${isFolder ? 'font-semibold' : ''}`}>{doc.title || '无标题'}</span>

                {/* 最近编辑视图：显示最后编辑时间 */}
                {viewMode === 'recent' && doc.updated_at && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0 ml-1">
                    {formatRelativeTime(doc.updated_at)}
                  </span>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setContextMenu({
                      docId: doc.id,
                      docTitle: doc.title || '无标题',
                      docType: doc.type,
                      isStarred: doc.is_starred,
                      aiExcluded: doc.ai_excluded || false,
                      x: rect.left,
                      y: rect.bottom,
                      buttonBottom: rect.bottom,
                    });
                  }}
                  className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 shrink-0"
                  title="更多操作"
                >
                  <MoreHorizontal className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              
              {!sidebarSearchQuery.trim() && viewMode !== 'starred' && isFolder && isExpanded[doc.id] && (
                <div
                  className="relative"
                >
                  <div
                    className="absolute top-0 bottom-0 border-l border-gray-200 dark:border-gray-600"
                    style={{ left: `calc(${level * 12 + 8}px + 0.4375rem)` }}
                    aria-hidden="true"
                  />
                  {renderFileTree(doc.id, level + 1)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // 图标栏内容（桌面端直接渲染，移动端放入 fixed wrapper）
  const iconRailContent = (
    <>
      {/* 用户头像 */}
      <div className="relative mb-4">
        <div
          onClick={() => {
            setIsSearchMode(false);
            if (viewMode === 'user' && contentExpanded) {
              setContentExpanded(false);
            } else {
              setViewMode('user');
              setContentExpanded(true);
            }
          }}
          className={`w-8 h-8 rounded-full cursor-pointer hover:opacity-80 transition-opacity overflow-hidden border-2 ${
            viewMode === 'user' && contentExpanded
              ? 'border-blue-500'
              : 'border-transparent'
          }`}
        >
          {user?.avatar_path ? (
            <img src={user.avatar_path} alt="avatar" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
              <User className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </div>
          )}
        </div>
      </div>

      {/* 随想笔记 */}
      <button
        onClick={() => {
          setIsSearchMode(false);
          setUserSubViewContext(null);
          if (viewMode === 'memo' && contentExpanded) {
            setContentExpanded(false);
          } else {
            setViewMode('memo');
            setContentExpanded(true);
          }
          navigate('/');
        }}
        className="w-10 h-10 flex items-center justify-center rounded-lg transition-colors text-[#8B8B80] dark:text-gray-400 hover:text-[#5A5A52] dark:hover:text-gray-200 hover:bg-[#EDEDE8] dark:hover:bg-gray-800"
        title="随想笔记"
      >
        <NavigationIcon type="memo" className="h-6 w-6" />
      </button>

      {/* 导航图标 */}
      <div className="flex flex-col items-center gap-1 flex-1">
        <button
          onClick={async () => {
            logNavigation('sidebar-diary-click', {
              viewMode,
              contentExpanded,
              isSearchMode,
            });
            setIsSearchMode(false);
            setUserSubViewContext(null);
            if (viewMode === 'diary' && contentExpanded) {
              setContentExpanded(false);
            } else {
              setViewMode('diary');
              setContentExpanded(true);
              // Navigate to today's diary
              try {
                const t = new Date();
                const y = t.getFullYear();
                const m = t.getMonth() + 1;
                const d = t.getDate();
                const [diaryData, dayResult] = await Promise.all([
                  getMonthlyDiary(y, m),
                  getOrCreateDayNode(y, m, d),
                ]);
                navigate(`/d/${diaryData.document.id}?nodeId=${dayResult.node_id}`);
                logNavigation('sidebar-diary-navigate', {
                  documentId: diaryData.document.id,
                  nodeId: dayResult.node_id,
                });
                onDocumentSelect?.();
              } catch (e) {
                console.error('Failed to open today diary', e);
              }
            }
          }}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
            viewMode === 'diary' && contentExpanded && !isSearchMode
              ? 'bg-[#E0E0D8] dark:bg-gray-700 text-[#3D3D35] dark:text-white'
              : 'text-[#8B8B80] dark:text-gray-400 hover:text-[#5A5A52] dark:hover:text-gray-200 hover:bg-[#EDEDE8] dark:hover:bg-gray-800'
          }`}
          title="日记"
        >
          <NavigationIcon type="diary" className="h-6 w-6" />
        </button>
        <button
          onClick={() => toggleViewPanel('projects')}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
            viewMode === 'projects' && contentExpanded && !isSearchMode
              ? 'bg-[#E0E0D8] dark:bg-gray-700 text-[#3D3D35] dark:text-white'
              : 'text-[#8B8B80] dark:text-gray-400 hover:text-[#5A5A52] dark:hover:text-gray-200 hover:bg-[#EDEDE8] dark:hover:bg-gray-800'
          }`}
          title="项目"
        >
          <NavigationIcon type="project" className="h-6 w-6" />
        </button>
        <button
          onClick={() => toggleViewPanel('all')}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors relative ${
            viewMode === 'all' && contentExpanded && !isSearchMode
              ? 'bg-[#E0E0D8] dark:bg-gray-700 text-[#3D3D35] dark:text-white'
              : 'text-[#8B8B80] dark:text-gray-400 hover:text-[#5A5A52] dark:hover:text-gray-200 hover:bg-[#EDEDE8] dark:hover:bg-gray-800'
          }`}
          title="文件"
        >
          <NavigationIcon type="files" className="h-6 w-6" />
        </button>
        <button
          onClick={() => toggleViewPanel('recent')}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors relative ${
            viewMode === 'recent' && contentExpanded && !isSearchMode
              ? 'bg-[#E0E0D8] dark:bg-gray-700 text-[#3D3D35] dark:text-white'
              : 'text-[#8B8B80] dark:text-gray-400 hover:text-[#5A5A52] dark:hover:text-gray-200 hover:bg-[#EDEDE8] dark:hover:bg-gray-800'
          }`}
          title="最近编辑"
        >
          <NavigationIcon type="recent" className="h-6 w-6" />
        </button>
        <button
          onClick={() => toggleViewPanel('starred')}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors relative ${
            viewMode === 'starred' && contentExpanded && !isSearchMode
              ? 'bg-[#E0E0D8] dark:bg-gray-700 text-[#3D3D35] dark:text-white'
              : 'text-[#8B8B80] dark:text-gray-400 hover:text-[#5A5A52] dark:hover:text-gray-200 hover:bg-[#EDEDE8] dark:hover:bg-gray-800'
          }`}
          title="收藏"
        >
          <NavigationIcon type="starred" className="h-6 w-6" />
        </button>
        <button
          onClick={() => {
            setIsSearchMode(false);
            if (viewMode === 'ai' && contentExpanded) {
              setContentExpanded(false);
              setUserSubViewContext(null);
              setActiveConvId(null);
            } else {
              setViewMode('ai');
              setContentExpanded(true);
              setUserSubViewContext('ai-chat');
            }
          }}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
            viewMode === 'ai' && contentExpanded && !isSearchMode
              ? 'bg-[#E0E0D8] dark:bg-gray-700 text-[#3D3D35] dark:text-white'
              : 'text-[#8B8B80] dark:text-gray-400 hover:text-[#5A5A52] dark:hover:text-gray-200 hover:bg-[#EDEDE8] dark:hover:bg-gray-800'
          }`}
          title="AI 问答"
        >
          <NavigationIcon type="ai" className="h-6 w-6" />
        </button>
      </div>

      {/* 全局搜索 */}
      <button
        onClick={() => setSearchOpen(true)}
        className="w-9 h-9 flex items-center justify-center rounded-lg text-[#8B8B80] hover:text-[#5A5A52] hover:bg-[#EDEDE8] dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors"
        title="全局搜索 (Ctrl+K)"
      >
        <NavigationIcon type="search" className="h-6 w-6" />
      </button>

      {/* 日/夜模式切换 */}
      <button
        onClick={toggleDark}
        className="w-9 h-9 flex items-center justify-center text-[#8B8B80] hover:text-[#5A5A52] hover:bg-[#EDEDE8] dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
        title={isDark ? '切换到日间模式' : '切换到夜间模式'}
      >
        <NavigationIcon
          type={isDark ? 'sun' : 'moon'}
          className={`h-6 w-6 ${isDark ? '!text-gray-200' : '!text-[#5A5A52]'}`}
        />
      </button>

      {/* 新建按钮 */}
      <div ref={newMenuRef} className="relative">
        <input
          ref={markdownInputRef}
          type="file"
          accept=".md,.markdown,text/markdown"
          multiple
          onChange={handleMarkdownImport}
          className="hidden"
          aria-hidden="true"
        />
        <button
          onClick={() => setShowNewMenu(!showNewMenu)}
          className="relative z-20 flex h-9 w-10 items-center justify-center rounded-full bg-[#f1f1f1] px-0 text-[#5A5A52] transition-colors hover:bg-[#e7e7e7] dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
          title="新建"
        >
          <SquarePen className="h-5 w-5 stroke-[1.8]" />
        </button>
        {showNewMenu && (
          <div className="absolute left-full bottom-0 ml-2 mb-0 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50 w-48">
            <button
              onClick={() => { handleCreateDocument(); setShowNewMenu(false); }}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
            >
              <DocumentTypeIcon type="document" className="h-4 w-4" />
              <span>新建大纲笔记</span>
            </button>
            <button
              onClick={() => { handleCreateNote(); setShowNewMenu(false); }}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
            >
              <DocumentTypeIcon type="note" className="h-4 w-4" />
              <span>新建普通笔记</span>
            </button>
            <button
              onClick={() => { setShowTodoDialog(true); setShowNewMenu(false); }}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
            >
              <NavigationIcon type="todo" className="h-4 w-4" />
              <span>新建待办</span>
            </button>
            <button
              onClick={() => { handleCreateExcalidraw(); setShowNewMenu(false); }}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
            >
              <DocumentTypeIcon type="excalidraw" className="h-4 w-4" />
              <span>新建画布</span>
            </button>
            <button
              onClick={() => { setShowNewFolderDialog(true); setShowNewMenu(false); }}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
            >
              <DocumentTypeIcon type="folder" className="h-4 w-4" />
              <span>新建文件夹</span>
            </button>
            <button
              onClick={() => { setShowNewMenu(false); openMarkdownImport(null); }}
              disabled={isImportingMarkdown}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2 disabled:opacity-50"
            >
              <FileUp className="h-4 w-4 text-gray-400" />
              <span>批量导入 md</span>
            </button>
            <button
              onClick={() => {
                setShowNewMenu(false);
                setShowNewProjectDialog(true);
              }}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
            >
              <DocumentTypeIcon type="project" className="h-4 w-4" />
              <span>新建项目计划</span>
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {isMobile ? (
        /* 移动端：整个侧边栏作为浮动 fixed 层，不挤占页面 */
        <>
          {contentExpanded && (
            <div
              className="fixed inset-0 bg-black/40"
              style={{ zIndex: 55 }}
              onClick={() => setContentExpanded(false)}
            />
          )}
          {contentExpanded && (
            <div
              className="fixed inset-y-0 left-0 flex shadow-xl bg-[var(--app-sidebar)]"
              style={{ zIndex: 58, width: `calc(80vw)` }}
            >
              {/* 图标栏 */}
              <div className="h-full bg-[var(--app-icon-rail)] flex flex-col items-center py-3 select-none shrink-0 border-r border-gray-200 dark:border-gray-700"
                   style={{ width: ICON_RAIL_WIDTH }}>
                {iconRailContent}
              </div>
              {/* 内容面板 */}
              <div
                ref={sidebarRef}
                className="flex-1 h-full bg-[var(--app-sidebar)] flex flex-col select-none text-sm relative overflow-hidden"
              >
                {isSearchMode ? (
                  /* 搜索模式 */
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                      <button
                        onClick={toggleSidebar}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors shrink-0"
                        title="收起侧边栏"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <div className="flex-1 relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={sidebarSearchQuery}
                          onChange={(e) => setSidebarSearchQuery(e.target.value)}
                          placeholder="搜索..."
                          className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 border-none rounded-lg placeholder-gray-400 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-2 pb-2 custom-scrollbar">
                      {visibleSearchResults.length > 0 ? (
                        (() => {
                          const grouped: Record<string, typeof visibleSearchResults> = {};
                          visibleSearchResults.forEach(r => {
                            const key = r.result_type === 'document' || r.result_type === 'document_title' ? '文档'
                              : r.result_type === 'diary' ? '日记'
                              : '随想';
                            if (!grouped[key]) grouped[key] = [];
                            grouped[key].push(r);
                          });
                          const order = ['文档', '日记', '随想'];
                          return order.filter(k => grouped[k]).map(group => (
                            <div key={group} className="mb-2">
                              <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider px-2 py-1">{group}</div>
                              {grouped[group].map(result => (
                                <button
                                  key={`${result.result_type}-${result.id}`}
                                  onClick={() => handleSearchResultClick(result)}
                                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                >
                                  <div className="text-sm text-gray-800 dark:text-gray-200 truncate">{result.title || '无标题'}</div>
                                  {result.snippet && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                      {highlightText(result.snippet, sidebarSearchQuery)}
                                    </div>
                                  )}
                                </button>
                              ))}
                            </div>
                          ));
                        })()
                      ) : sidebarSearchQuery ? (
                        <div className="text-center text-gray-400 text-xs py-4">无搜索结果</div>
                      ) : (
                        <div className="text-center text-gray-400 text-xs py-4">输入关键词搜索</div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* 普通视图模式 */
                  <>
                    <div className="flex items-center justify-between px-3 pt-3 pb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {viewMode === 'diary' ? '日记' : viewMode === 'starred' ? '收藏' : viewMode === 'user' ? '用户' : viewMode === 'ai' ? 'AI 问答' : viewMode === 'projects' ? '项目' : '文件'}
                      </span>
                      <button
                        onClick={toggleSidebar}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        title="收起侧边栏"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar" onContextMenu={handleRootContextMenu}>
                      {viewMode === 'user' ? (
                        <div className="py-2">
                          <button onClick={() => { setUserSubView('profile'); onDocumentSelect?.(); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors">
                            <User className="w-4 h-4 text-gray-400" /><span>个人资料</span>
                          </button>
                          <button onClick={() => { setUserSubView('appearance'); onDocumentSelect?.(); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors">
                            <Palette className="w-4 h-4 text-gray-400" /><span>外观与主题</span>
                          </button>
                          <button onClick={() => { setUserSubView('token'); onDocumentSelect?.(); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors">
                            <Key className="w-4 h-4 text-gray-400" /><span>API Token</span>
                          </button>
                          <button onClick={() => { setUserSubView('ai'); onDocumentSelect?.(); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors">
                            <Sparkles className="w-4 h-4 text-gray-400" /><span>AI 设置</span>
                          </button>
                          <button onClick={() => { setUserSubView('trash'); onDocumentSelect?.(); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors">
                            <Trash className="w-4 h-4 text-gray-400" /><span>回收站</span>
                          </button>
                          <button onClick={() => { setUserSubView('password'); onDocumentSelect?.(); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors">
                            <Lock className="w-4 h-4 text-gray-400" /><span>修改密码</span>
                          </button>
                          <div className="my-2 border-t border-gray-200 dark:border-gray-700" />
                          <button onClick={() => logout()} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                            <LogOut className="w-4 h-4" /><span>退出登录</span>
                          </button>
                        </div>
                      ) : viewMode === 'memo' ? (
                        <MemoSidebarContent />
                      ) : viewMode === 'diary' ? (
                        <DiaryCalendar
                          onNavigate={() => setContentExpanded(false)}
                          pendingTasks={pendingTasks}
                          onTaskToggle={handleTaskToggle}
                          onTaskMoved={fetchPendingTasks}
                        />
                      ) : viewMode === 'projects' ? (
                        <div className="flex flex-col h-full">
                          <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 p-2 space-y-1">
                            <button
                              onClick={() => setShowNewProjectDialog(true)}
                              className="w-full flex items-center gap-2 px-2 py-2 text-sm text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                              <Plus className="w-4 h-4 text-gray-400" />
                              <span>新建项目</span>
                            </button>
                            <button
                              onClick={openArchivedProjects}
                              className="w-full flex items-center gap-2 px-2 py-2 text-sm text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                              <Archive className="w-4 h-4 text-gray-400" />
                              <span>已归档项目</span>
                            </button>
                          </div>
                          <div className="flex-1 overflow-y-auto">
                            {projects.map(p => (
                              <div key={p.id}
                                onClick={() => {
                                  if (editingProjectId !== p.id) {
                                    closeArchivedProjects();
                                    setSelectedProjectId(p.id);
                                  }
                                }}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  setProjectContextMenu({ id: p.id, name: p.name, x: e.clientX, y: e.clientY });
                                }}
                                className={`group px-4 py-2 flex items-center gap-2 cursor-pointer transition-colors ${
                                  selectedProjectId === p.id
                                    ? 'bg-[#E0E0D8] dark:bg-gray-700'
                                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                }`}>
                                <DocumentTypeIcon type="project" className="h-4 w-4" />
                                {editingProjectId === p.id ? (
                                  <input
                                    type="text"
                                    value={editingProjectName}
                                    onChange={e => setEditingProjectName(e.target.value)}
                                    onBlur={async () => {
                                      const trimmed = editingProjectName.trim();
                                      if (trimmed && trimmed !== p.name) {
                                        try {
                                          await updateProject(p.id, { name: trimmed });
                                          setProjects(prev => prev.map(x => x.id === p.id ? { ...x, name: trimmed } : x));
                                        } catch (err) { console.error('Failed to rename project:', err); }
                                      }
                                      setEditingProjectId(null);
                                    }}
                                    onKeyDown={async (e) => {
                                      if (e.key === 'Enter') {
                                        e.currentTarget.blur();
                                      } else if (e.key === 'Escape') {
                                        setEditingProjectId(null);
                                      }
                                    }}
                                    autoFocus
                                    className="flex-1 text-sm bg-transparent outline-none border-b border-blue-400 text-gray-800 dark:text-gray-200"
                                    onClick={e => e.stopPropagation()}
                                  />
                                ) : (
                                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">{p.name}</span>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setProjectContextMenu({ id: p.id, name: p.name, x: rect.left, y: rect.bottom + 4 });
                                  }}
                                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <MoreHorizontal size={14} className="text-gray-400" />
                                </button>
                              </div>
                            ))}
                            {projects.length === 0 && (
                              <p className="px-3 py-4 text-sm text-gray-400 text-center">暂无项目</p>
                            )}
                          </div>
                        </div>
                      ) : viewMode === 'starred' ? (
                        <div className="px-1 py-1">
                          {renderFileTree(null, 0, true)}
                        </div>
                      ) : viewMode === 'ai' ? (
                        <AIChatSidebar
                          onSelectConversation={(convId) => {
                            setActiveConvId(convId);
                            setUserSubViewContext('ai-chat');
                          }}
                          activeConvId={activeConvId}
                        />
                      ) : (
                        <div className="px-1 py-1">
                          {renderFileTree(null, 0, false)}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        /* 桌面端：原有布局 */
        <>
          {/* 左侧图标栏 */}
          <div className={`h-full bg-[var(--app-icon-rail)] flex flex-col items-center py-3 select-none shrink-0 ${contentExpanded ? 'border-r border-gray-200 dark:border-gray-700' : ''}`}
               style={{ width: ICON_RAIL_WIDTH }}>
            {iconRailContent}
          </div>

          {/* 内容面板 - 可折叠 */}
          <div
            ref={sidebarRef}
            className={`h-full bg-[var(--app-sidebar)] flex flex-col select-none text-sm relative border-r border-gray-200 dark:border-gray-700 ${
              isResizing ? '' : 'transition-all duration-300 ease-in-out'
            } ${!contentExpanded ? 'overflow-hidden' : ''}`}
            style={{
              width: contentExpanded ? sidebarWidth : 0,
            }}
          >
            {contentExpanded && (
              <>
                <div
                  className="absolute top-0 right-0 z-50 h-full w-3 translate-x-1/2 cursor-col-resize bg-transparent transition-colors hover:bg-blue-500/50"
                  style={{ touchAction: 'none' }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    resizingRef.current = true;
                    setIsResizing(true);
                  }}
                />

                {/* 搜索模式 */}
                {isSearchMode ? (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-3 py-2 border-b border-gray-200/60 dark:border-gray-700/60 flex items-center gap-1.5">
                      <div className="relative group flex-1 min-w-0">
                        <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400 group-focus-within:text-gray-600 transition-colors" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          placeholder="搜索笔记、日记、随想..."
                          value={sidebarSearchQuery}
                          onChange={(e) => setSidebarSearchQuery(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-gray-800 border-none rounded shadow-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-200 dark:focus:ring-gray-700 transition-all"
                        />
                      </div>
                      <button
                        onClick={toggleSidebar}
                        className="w-5 h-5 flex items-center justify-center rounded text-[#8B8B80] hover:text-[#5A5A52] hover:bg-[#EDEDE8] dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0"
                        title="收起面板"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-2 pb-2 custom-scrollbar">
                      {searchLoading ? (
                        <div className="p-4 text-xs text-gray-400 text-center">搜索中...</div>
                      ) : !sidebarSearchQuery.trim() ? (
                        <div className="p-4 text-xs text-gray-400 text-center">输入关键词搜索</div>
                      ) : visibleSearchResults.length === 0 ? (
                        <div className="p-4 text-xs text-gray-400 text-center">未找到匹配内容</div>
                      ) : (
                        <div className="pt-1">
                          {docResults.length > 0 && (
                            <div className="mb-3">
                              <div className="flex items-center gap-1.5 px-2 py-1.5 text-emerald-600 dark:text-emerald-400">
                                <FileText className="w-3.5 h-3.5" />
                                <span className="text-xs font-semibold">大纲笔记</span>
                                <span className="text-[10px] opacity-60">{docResults.length}</span>
                              </div>
                              {docResults.map(r => (
                                <div key={`${r.entity_id}-${r.node_id || ''}`} onClick={() => handleSearchResultClick(r)} className="px-2 py-2 rounded cursor-pointer hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors">
                                  <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{r.title ? highlightText(r.title, sidebarSearchQuery) : '无标题'}</div>
                                  {r.snippet && <div className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">{highlightText(r.snippet, sidebarSearchQuery)}</div>}
                                </div>
                              ))}
                            </div>
                          )}
                          {diaryResults.length > 0 && (
                            <div className="mb-3">
                              <div className="flex items-center gap-1.5 px-2 py-1.5 text-blue-600 dark:text-blue-400">
                                <CalendarDays className="w-3.5 h-3.5" />
                                <span className="text-xs font-semibold">日记</span>
                                <span className="text-[10px] opacity-60">{diaryResults.length}</span>
                              </div>
                              {diaryResults.map(r => (
                                <div key={`${r.entity_id}-${r.node_id || ''}`} onClick={() => handleSearchResultClick(r)} className="px-2 py-2 rounded cursor-pointer hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors">
                                  <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{r.title || '无标题'}</div>
                                  {r.snippet && <div className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">{highlightText(r.snippet, sidebarSearchQuery)}</div>}
                                </div>
                              ))}
                            </div>
                          )}
                          {memoResults.length > 0 && (
                            <div className="mb-3">
                              <div className="flex items-center gap-1.5 px-2 py-1.5 text-amber-600 dark:text-amber-400">
                                <StickyNote className="w-3.5 h-3.5" />
                                <span className="text-xs font-semibold">随想</span>
                                <span className="text-[10px] opacity-60">{memoResults.length}</span>
                              </div>
                              {memoResults.map(r => (
                                <div key={r.entity_id} onClick={() => handleSearchResultClick(r)} className="px-2 py-2 rounded cursor-pointer hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors">
                                  <div className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2">{highlightText(r.snippet, sidebarSearchQuery)}</div>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="px-2 py-2 text-[10px] text-gray-400 text-center">共找到 {visibleSearchResults.length} 条结果</div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="px-3 py-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {viewMode === 'diary' ? '日记' : viewMode === 'starred' ? '收藏' : viewMode === 'memo' ? '随想笔记' : viewMode === 'user' ? '用户' : viewMode === 'ai' ? 'AI 问答' : viewMode === 'projects' ? '项目' : '文件'}
                      </span>
                      <button onClick={toggleSidebar} className="w-5 h-5 flex items-center justify-center rounded text-[#8B8B80] hover:text-[#5A5A52] hover:bg-[#EDEDE8] dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0" title="收起面板">
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex-1 relative overflow-hidden bg-[var(--app-sidebar)]">
                      <div ref={listRef} className="absolute inset-0 overflow-y-auto custom-scrollbar" onDragOver={(e) => e.preventDefault()} onDrop={handleRootDrop} onClick={() => setSelectedFolderId(null)} onContextMenu={handleRootContextMenu}>
                        {viewMode === 'user' ? (
                          <div className="py-2">
                            {/* 个人资料 */}
                            <button
                              onClick={() => { setUserSubView('profile'); onDocumentSelect?.(); }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors"
                            >
                              <User className="w-4 h-4 text-gray-400" />
                              <span>个人资料</span>
                            </button>
                            {/* 外观与主题 */}
                            <button
                              onClick={() => { setUserSubView('appearance'); onDocumentSelect?.(); }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors"
                            >
                              <Palette className="w-4 h-4 text-gray-400" />
                              <span>外观与主题</span>
                            </button>
                            {/* API Token */}
                            <button
                              onClick={() => { setUserSubView('token'); onDocumentSelect?.(); }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors"
                            >
                              <Key className="w-4 h-4 text-gray-400" />
                              <span>API Token</span>
                            </button>
                            {/* AI 设置 */}
                            <button
                              onClick={() => { setUserSubView('ai'); onDocumentSelect?.(); }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors"
                            >
                              <Sparkles className="w-4 h-4 text-gray-400" />
                              <span>AI 设置</span>
                            </button>
                            {/* 回收站 */}
                            <button
                              onClick={() => { setUserSubView('trash'); onDocumentSelect?.(); }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors"
                            >
                              <Trash className="w-4 h-4 text-gray-400" />
                              <span>回收站</span>
                            </button>
                            {/* 修改密码 */}
                            <button
                              onClick={() => { setUserSubView('password'); onDocumentSelect?.(); }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors"
                            >
                              <Lock className="w-4 h-4 text-gray-400" />
                              <span>修改密码</span>
                            </button>
                            {/* 分割线 */}
                            <div className="my-2 border-t border-gray-200 dark:border-gray-700" />
                            {/* 退出登录 */}
                            <button
                              onClick={() => logout()}
                              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              <LogOut className="w-4 h-4" />
                              <span>退出登录</span>
                            </button>
                          </div>
                        ) : viewMode === 'memo' ? (
                          <MemoSidebarContent />
                        ) : viewMode === 'diary' ? (
                          <DiaryCalendar onNavigate={() => { onDocumentSelect?.(); setTimeout(() => { window.dispatchEvent(new CustomEvent('sidebarClose')); }, 0); }} pendingTasks={pendingTasks} onTaskToggle={handleTodoToggle} onTaskMoved={fetchPendingTasks} />
                        ) : isLoading ? (
                          <div className="p-4 text-xs text-gray-400 text-center">加载中...</div>
                        ) : viewMode === 'projects' ? (
                          <div className="flex flex-col h-full">
                            <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 p-2 space-y-1">
                              <button
                                onClick={() => setShowNewProjectDialog(true)}
                                className="w-full flex items-center gap-2 px-2 py-2 text-sm text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                              >
                                <Plus className="w-4 h-4 text-gray-400" />
                                <span>新建项目</span>
                              </button>
                              <button
                                onClick={openArchivedProjects}
                                className="w-full flex items-center gap-2 px-2 py-2 text-sm text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                              >
                                <Archive className="w-4 h-4 text-gray-400" />
                                <span>已归档项目</span>
                              </button>
                            </div>
                            <div className="flex-1 overflow-y-auto">
                              {projects.map(p => (
                                <div key={p.id}
                                  onClick={() => {
                                    if (editingProjectId !== p.id) {
                                      closeArchivedProjects();
                                      setSelectedProjectId(p.id);
                                    }
                                  }}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    setProjectContextMenu({ id: p.id, name: p.name, x: e.clientX, y: e.clientY });
                                  }}
                                  className={`group px-4 py-2 flex items-center gap-2 cursor-pointer transition-colors ${
                                    selectedProjectId === p.id
                                      ? 'bg-[#E0E0D8] dark:bg-gray-700'
                                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                  }`}>
                                  <DocumentTypeIcon type="project" className="h-4 w-4" />
                                  {editingProjectId === p.id ? (
                                    <input
                                      type="text"
                                      value={editingProjectName}
                                      onChange={e => setEditingProjectName(e.target.value)}
                                      onBlur={async () => {
                                        const trimmed = editingProjectName.trim();
                                        if (trimmed && trimmed !== p.name) {
                                          try {
                                            await updateProject(p.id, { name: trimmed });
                                            setProjects(prev => prev.map(x => x.id === p.id ? { ...x, name: trimmed } : x));
                                          } catch (err) { console.error('Failed to rename project:', err); }
                                        }
                                        setEditingProjectId(null);
                                      }}
                                      onKeyDown={async (e) => {
                                        if (e.key === 'Enter') {
                                          e.currentTarget.blur();
                                        } else if (e.key === 'Escape') {
                                          setEditingProjectId(null);
                                        }
                                      }}
                                      autoFocus
                                      className="flex-1 text-sm bg-transparent outline-none border-b border-blue-400 text-gray-800 dark:text-gray-200"
                                      onClick={e => e.stopPropagation()}
                                    />
                                  ) : (
                                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">{p.name}</span>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setProjectContextMenu({ id: p.id, name: p.name, x: rect.left, y: rect.bottom + 4 });
                                    }}
                                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <MoreHorizontal size={14} className="text-gray-400" />
                                  </button>
                                </div>
                              ))}
                              {projects.length === 0 && (
                                <p className="px-3 py-4 text-sm text-gray-400 text-center">暂无项目</p>
                              )}
                            </div>
                          </div>
                        ) : viewMode === 'starred' ? (
                          filteredDocuments.length === 0 ? <div className="p-4 text-xs text-gray-400 text-center">暂无收藏</div> : <div className="pt-2">{renderFileTree(null, 0)}</div>
                        ) : viewMode === 'ai' ? (
                          <AIChatSidebar
                            onSelectConversation={(convId) => {
                              setActiveConvId(convId);
                              setUserSubViewContext('ai-chat');
                            }}
                            activeConvId={activeConvId}
                          />
                        ) : (
                          filteredDocuments.filter(d => !d.parent_id).length === 0 ? <div className="p-4 text-xs text-gray-400 text-center">暂无文章</div> : <div className="pt-2">{renderFileTree(null, 0)}</div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}


      {/* 文件夹删除弹窗（带两个选项） */}
      {deleteDialog.show && deleteDialog.type === 'folder' && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteDialog({ ...deleteDialog, show: false })} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">删除文件夹</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              确定要删除文件夹「{deleteDialog.title}」吗？
            </p>
            <div className="space-y-3 mb-6">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="deleteMode"
                  checked={deleteDialog.deleteMode === 'move'}
                  onChange={() => setDeleteDialog({ ...deleteDialog, deleteMode: 'move' })}
                  className="mt-0.5"
                />
                <div>
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">仅删除文件夹</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">文件夹内的文章移到根目录</p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="deleteMode"
                  checked={deleteDialog.deleteMode === 'all'}
                  onChange={() => setDeleteDialog({ ...deleteDialog, deleteMode: 'all' })}
                  className="mt-0.5"
                />
                <div>
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">删除文件夹及所有内容</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">文件夹和里面的全部文章将被永久删除</p>
                </div>
              </label>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteDialog({ ...deleteDialog, show: false })}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                disabled={!deleteDialog.deleteMode}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 普通文档删除弹窗 */}
      <DeleteConfirmDialog
        isOpen={deleteDialog.show && deleteDialog.type !== 'folder'}
        title="删除文档"
        message={`确定要删除文档"${deleteDialog.title}"吗？`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteDialog({ ...deleteDialog, show: false })}
      />

      {/* 项目删除确认弹窗 */}
      <DeleteConfirmDialog
        isOpen={showProjectDeleteDialog}
        title="删除项目"
        message={`确定要删除「${projectToDelete?.name}」吗？所有任务也会一并删除。`}
        onConfirm={async () => {
          if (projectToDelete) {
            if (selectedProjectId === projectToDelete.id) setSelectedProjectId(null);
            try {
              await deleteProject(projectToDelete.id);
              setProjects(prev => prev.filter(p => p.id !== projectToDelete.id));
            } catch (err) { console.error('Failed to delete project:', err); }
          }
          setShowProjectDeleteDialog(false);
          setProjectToDelete(null);
        }}
        onCancel={() => {
          setShowProjectDeleteDialog(false);
          setProjectToDelete(null);
        }}
      />



      <NewFolderDialog
        key={`folder-dialog-${showNewFolderDialog}`}
        isOpen={showNewFolderDialog}
        onConfirm={handleCreateFolder}
        onCancel={() => setShowNewFolderDialog(false)}
        isSubmitting={isSubmitting}
      />

      <NewFolderDialog
        key={`project-dialog-${showNewProjectDialog}`}
        isOpen={showNewProjectDialog}
        dialogTitle="新建项目计划"
        label="项目名称"
        placeholder="输入项目名称"
        defaultValue="新项目"
        onConfirm={async (name: string) => {
          setShowNewProjectDialog(false);
          try {
            await createProject(name.trim());
            getProjects().then(setProjects).catch(console.error);
          } catch (err) { console.error('Failed to create project:', err); }
        }}
        onCancel={() => setShowNewProjectDialog(false)}
      />

      {/* 新建待办弹窗 */}
      {showTodoDialog && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }} onClick={() => { setShowTodoDialog(false); setTodoText(''); }}>
          <div
            className="bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-2"
            onClick={e => e.stopPropagation()}
          >
            <input
              ref={todoInputRef}
              type="text"
              value={todoText}
              onChange={e => setTodoText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateTodo(); }}
              placeholder="新建待办..."
              className="w-96 px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 placeholder-gray-400 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
              autoFocus
            />
            <button
              onClick={handleCreateTodo}
              disabled={!todoText.trim()}
              className="w-5 h-5 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <span className="text-lg leading-none">+</span>
            </button>
          </div>
        </div>
      )}

      <EditFolderDialog
        key={`${editFolderDialog.id}-${editFolderDialog.show}`}
        isOpen={editFolderDialog.show}
        folderId={editFolderDialog.id}
        initialTitle={editFolderDialog.title}
        onConfirm={handleEditFolder}
        onCancel={() => setEditFolderDialog({ ...editFolderDialog, show: false })}
      />

      {showTokenDialog && (
        <TokenDialog onClose={() => setShowTokenDialog(false)} />
      )}
      {showTrashDialog && (
        <TrashDialog onClose={() => setShowTrashDialog(false)} onRestore={refreshDocuments} />
      )}
      <PasswordDialog open={showPasswordDialog} onClose={() => setShowPasswordDialog(false)} />
      {showAISettings && (
        <AISettings onClose={() => setShowAISettings(false)} />
      )}

      {/* Move To Folder Dialog */}
      {moveDialog.show && (() => {
        interface TreeNode { id: string; title: string; children: TreeNode[]; }
        // Exclude the item being moved and its descendants from the picker
        const getDescendantIds = (id: string): Set<string> => {
          const result = new Set<string>();
          const stack = [id];
          while (stack.length) {
            const cur = stack.pop()!;
            result.add(cur);
            for (const d of documents.filter(dd => dd.parent_id === cur)) {
              stack.push(d.id);
            }
          }
          return result;
        };
        const excludedIds = moveDialog.docType === 'folder' ? getDescendantIds(moveDialog.docId) : new Set<string>();
        const buildFiltered = (parentId: string | null): TreeNode[] => {
          return documents
            .filter(d => d.type === 'folder' && d.parent_id === parentId && !excludedIds.has(d.id) && d.id !== moveDialog.docId)
            .sort(compareFolderTitle)
            .map(f => ({ id: f.id, title: f.title || '无标题', children: buildFiltered(f.id) }));
        };
        const pickerTree = buildFiltered(null);
        const renderPickerNodes = (nodes: TreeNode[], depth: number) =>
          nodes.map(node => (
            <div key={node.id}>
              <button
                onClick={() => setMoveTargetFolder(node.id)}
                className={`w-full py-2 text-left text-sm flex items-center gap-2 transition-colors rounded ${
                  moveTargetFolder === node.id
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
                style={{ paddingLeft: `${8 + depth * 6}px`, paddingRight: '8px' }}
              >
                <FolderIcon className="w-4 h-4 shrink-0" />
                <span className="truncate">{node.title}</span>
              </button>
              {node.children.length > 0 && renderPickerNodes(node.children, depth + 1)}
            </div>
          ));
        return (
          <div className="fixed inset-0 z-[9999] grid place-items-center p-4 bg-black/50" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }} onClick={() => { setMoveTargetFolder(null); setMoveDialog({ show: false, docId: '', docTitle: '', docType: 'document' }); }}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-80 max-h-[80dvh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">移动到...</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{moveDialog.docTitle}</p>
              </div>
              <div className="flex-1 overflow-y-auto px-2 py-2 custom-scrollbar">
                <button
                  onClick={() => setMoveTargetFolder(null)}
                  className={`w-full py-2 text-left text-sm flex items-center gap-2 transition-colors rounded px-2 ${
                    moveTargetFolder === null
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <Folder className="w-4 h-4 shrink-0" />
                  <span>根目录</span>
                </button>
                {renderPickerNodes(pickerTree, 0)}
              </div>
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                <button
                  onClick={() => { setMoveTargetFolder(null); setMoveDialog({ show: false, docId: '', docTitle: '', docType: 'document' }); }}
                  className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => handleMoveToFolder(moveTargetFolder)}
                  className="px-3 py-1.5 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded transition-colors"
                >
                  移动
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Project Context Menu */}
      {projectContextMenu && (
        <div
          ref={projectContextMenuRef}
          className="fixed bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-[9999] min-w-[140px]"
          style={{ left: projectContextMenu.x, top: projectContextMenu.y }}
        >
          <button
            onClick={() => {
              setEditingProjectId(projectContextMenu.id);
              setEditingProjectName(projectContextMenu.name);
              setProjectContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Edit2 className="w-4 h-4 text-gray-400" />
            <span>重命名</span>
          </button>
          <button
            onClick={async () => {
              const id = projectContextMenu.id;
              setProjectContextMenu(null);
              if (selectedProjectId === id) setSelectedProjectId(null);
              try {
                await archiveProject(id);
                setProjects(prev => prev.filter(p => p.id !== id));
                window.dispatchEvent(new CustomEvent('projects-open-archived'));
              } catch (err) { console.error('Failed to archive project:', err); }
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Archive className="w-4 h-4 text-gray-400" />
            <span>归档</span>
          </button>
          <button
            onClick={() => {
              setProjectToDelete({ id: projectContextMenu.id, name: projectContextMenu.name });
              setProjectContextMenu(null);
              setShowProjectDeleteDialog(true);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash className="w-4 h-4" />
            <span>删除</span>
          </button>
        </div>
      )}

      {/* 文件列表空白区域右键菜单 */}
      {rootContextMenu && (
        <div
          ref={rootContextMenuRef}
          className="fixed z-[9999] w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-800"
          style={{
            left: Math.min(rootContextMenu.x, window.innerWidth - 184),
            top: Math.min(rootContextMenu.y, window.innerHeight - 190),
          }}
        >
          <button
            type="button"
            onClick={() => { setRootContextMenu(null); handleCreateDocument(null); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <DocumentTypeIcon type="document" className="h-4 w-4" />
            <span>新建大纲笔记</span>
          </button>
          <button
            type="button"
            onClick={() => { setRootContextMenu(null); handleCreateNote(null); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <DocumentTypeIcon type="note" className="h-4 w-4" />
            <span>新建普通笔记</span>
          </button>
          <button
            type="button"
            onClick={() => { setRootContextMenu(null); handleCreateExcalidraw(null); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <DocumentTypeIcon type="excalidraw" className="h-4 w-4" />
            <span>新建画布</span>
          </button>
          <button
            type="button"
            onClick={() => {
              pendingFolderParentRef.current = null;
              setRootContextMenu(null);
              setShowNewFolderDialog(true);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <DocumentTypeIcon type="folder" className="h-4 w-4" />
            <span>新建文件夹</span>
          </button>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (() => {
        const MENU_HEIGHT = contextMenu.docType === 'folder' ? 260 : 250;
        const spaceBelow = window.innerHeight - contextMenu.buttonBottom;
        const openUpward = spaceBelow < MENU_HEIGHT;
        return (
        <div
          ref={contextMenuRef}
          className="fixed bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-[9999] min-w-[140px]"
          style={{
            ...(isMobile
              ? { right: 8 }
              : { left: contextMenu.x }
            ),
            ...(openUpward
              ? { bottom: window.innerHeight - contextMenu.y }
              : { top: contextMenu.y }),
          }}
        >
          {(contextMenu.docType === 'document' || contextMenu.docType === 'note' || contextMenu.docType === 'excalidraw') && (
            <>
              <button
                onClick={() => {
                  updateDocumentLocal(contextMenu.docId, { is_starred: !contextMenu.isStarred });
                  updateDocument(contextMenu.docId, { is_starred: !contextMenu.isStarred }).catch(() => {
                    updateDocumentLocal(contextMenu.docId, { is_starred: contextMenu.isStarred });
                  });
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Star className={`w-4 h-4 ${contextMenu.isStarred ? 'fill-current text-yellow-500' : 'text-gray-400'}`} />
                <span>{contextMenu.isStarred ? '取消收藏' : '收藏'}</span>
              </button>
              <button
                onClick={async () => {
                  setContextMenu(null);
                  try {
                    const newDoc = await copyDocument(contextMenu.docId);
                    addDocument(newDoc);
                  } catch (error) {
                    console.error('Failed to copy document', error);
                  }
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Copy className="w-4 h-4 text-gray-400" />
                <span>复制</span>
              </button>
              <button
                onClick={async () => {
                  setContextMenu(null);
                  try {
                    if (contextMenu.docType === 'excalidraw') {
                      // 画布转随想笔记：导出图片
                      // 先等待可能正在进行的防抖保存（2s），再读取最新数据
                      await new Promise(resolve => setTimeout(resolve, 2500));
                      const excalidrawData = await getExcalidrawDataFresh(contextMenu.docId);
                      if (excalidrawData.scene_data) {
                        const sceneData = JSON.parse(excalidrawData.scene_data);
                        // 2. 过滤掉已删除元素（与 Excalidraw getSceneElements 一致）
                        const visibleElements = (sceneData.elements || []).filter(
                          (el: { isDeleted?: boolean }) => !el.isDeleted
                        );
                        if (visibleElements.length > 0) {
                          const { exportToBlob } = await import('@excalidraw/excalidraw');
                          const pngBlob = await exportToBlob({
                            elements: visibleElements,
                            appState: {},
                            mimeType: 'image/png',
                            quality: 1,
                            scale: 2,
                          });
                          const file = new File([pngBlob], `canvas-${Date.now()}.png`, { type: 'image/png' });
                          const uploadResult = await uploadFile(file);
                          await createMemo(`![画布导出](${uploadResult.file_path})`);
                          navigate('/');
                        } else {
                          alert('画布为空，无法导出');
                        }
                      }
                    } else {
                      // 大纲笔记和普通笔记：转换为 markdown
                      const nodes = await getNodes(contextMenu.docId);
                      const markdown = nodesToMemoMarkdown(nodes);
                      await createMemo(markdown);
                      navigate('/');
                    }
                  } catch (error) {
                    console.error('转换失败', error);
                    alert('转换失败：' + (error instanceof Error ? error.message : '未知错误'));
                  }
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <ArrowUpRight className="w-4 h-4 text-gray-400" />
                <span>转换为随想笔记</span>
              </button>
              <button
                onClick={() => {
                  setMoveTargetFolder(null);
                  setMoveDialog({ show: true, docId: contextMenu.docId, docTitle: contextMenu.docTitle, docType: contextMenu.docType });
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Move className="w-4 h-4 text-gray-400" />
                <span>移动到...</span>
              </button>
              <button
                onClick={() => {
                  updateDocument(contextMenu.docId, { ai_excluded: !contextMenu.aiExcluded }).then(() => {
                    updateDocumentLocal(contextMenu.docId, { ai_excluded: !contextMenu.aiExcluded });
                  });
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Sparkles className={`w-4 h-4 ${contextMenu.aiExcluded ? 'text-gray-400' : 'text-blue-500'}`} />
                <span>{contextMenu.aiExcluded ? '取消不参与 AI' : '不参与 AI'}</span>
              </button>
              <button
                onClick={() => {
                  setEditFolderDialog({ show: true, id: contextMenu.docId, title: contextMenu.docTitle, icon: documents.find(d => d.id === contextMenu.docId)?.icon });
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Edit2 className="w-4 h-4 text-gray-400" />
                <span>重命名</span>
              </button>
            </>
          )}
          {contextMenu.docType === 'folder' && (
            <>
              <button
                onClick={() => {
                  handleCreateDocument(contextMenu.docId);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <FilePlus className="w-4 h-4 text-gray-400" />
                <span>新建大纲笔记</span>
              </button>
              <button
                onClick={() => {
                  handleCreateNote(contextMenu.docId);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <FileText className="w-4 h-4 text-gray-400" />
                <span>新建普通笔记</span>
              </button>
              <button
                onClick={() => {
                  openMarkdownImport(contextMenu.docId);
                  setContextMenu(null);
                }}
                disabled={isImportingMarkdown}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                <FileUp className="w-4 h-4 text-gray-400" />
                <span>批量导入 md</span>
              </button>
              <button
                onClick={() => {
                  handleCreateExcalidraw(contextMenu.docId);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Frame className="w-4 h-4 text-gray-400" />
                <span>新建画布</span>
              </button>
              <button
                onClick={() => {
                  pendingFolderParentRef.current = contextMenu.docId;
                  setShowNewFolderDialog(true);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <FolderPlus className="w-4 h-4 text-gray-400" />
                <span>新建子文件夹</span>
              </button>
              <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
              <button
                onClick={() => {
                  setMoveTargetFolder(null);
                  setMoveDialog({ show: true, docId: contextMenu.docId, docTitle: contextMenu.docTitle, docType: 'folder' });
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Move className="w-4 h-4 text-gray-400" />
                <span>移动到...</span>
              </button>
              <button
                onClick={() => {
                  setEditFolderDialog({ show: true, id: contextMenu.docId, title: contextMenu.docTitle, icon: documents.find(d => d.id === contextMenu.docId)?.icon });
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Edit2 className="w-4 h-4 text-gray-400" />
                <span>重命名</span>
              </button>
            </>
          )}
          <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          <button
            onClick={() => {
              setDeleteDialog({ show: true, id: contextMenu.docId, title: contextMenu.docTitle, type: contextMenu.docType });
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash className="w-4 h-4" />
            <span>删除</span>
          </button>
        </div>
        );
      })()}
    </>
  );
};

export default Sidebar;
