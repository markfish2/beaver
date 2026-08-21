import { useState, useEffect, useMemo, Fragment, useRef, useCallback, lazy, startTransition } from 'react';
import type { SetStateAction } from 'react';
import { BriefcaseBusiness, Clock3, FolderOpen, Menu, Search, Star } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import NodeItem from './NodeItem';
import MobileToolbar from './MobileToolbar';
import { useMobileToolbar } from '../context/MobileToolbarContext';
import LoadingSkeleton from './LoadingSkeleton';
import { SaveStatusIndicator } from './SaveStatusIndicator';
import RecoveryDialog from './RecoveryDialog';
import DropIndicator from './DropIndicator';
import TableOfContents from './TableOfContents';
import DocumentSettingsMenu from './DocumentSettingsMenu';
import DocumentTabs from './DocumentTabs';
import EditorActionPortal from './EditorActionPortal';
import { getDocumentTabKey } from './documentTabTypes';
import {
  ACTIVE_DOCUMENT_TAB_STORAGE_KEY,
  DOCUMENT_TABS_STORAGE_KEY,
} from './documentTabTypes';
import type { DocumentTab, DocumentTabMode } from './documentTabTypes';
import DiaryDateBar from './DiaryDateBar';
import UserProfileEditor from './UserProfileEditor';
import AppearanceSettingsPage from './AppearanceSettingsPage';
import TokenPanel from './TokenPanel';
import TrashPanel from './TrashPanel';
import PasswordPanel from './PasswordPanel';
import AISettingsPanel from './AISettingsPanel';
import { useUserView } from '../context/UserViewContext';
import type { UserSubView } from '../context/UserViewContext';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getNodes, getDocument, updateNode, updateDocument, deleteNode, createNode, createNodesBatch, uploadFile, batchUpdateNodes, batchMoveNodes, batchDeleteNodes, moveNode, getDiaryDayDates, getOrCreateDayNode, getMonthlyDiary } from '../api/data';
import { dataCache } from '../api/cache';
import type { Node, Document } from '../api/data';
import { useDocuments } from '../context/DocumentContext';
import { useSearch } from '../context/SearchContext';
import { useDiary } from '../context/DiaryContext';
import { useHistory } from '../hooks/useHistory';
import { useSaveManager } from '../hooks/useSaveManager';
import { useKeyboardScroll } from '../hooks/useKeyboardScroll';
import { usePhoneLayout } from '../hooks/usePhoneLayout';
import { createCommandFactory } from '../commands/implementations';

import { saveStateManager, sendBatchSaveRequest, PendingOperation } from '../utils/saveStateManager';
import { saveViewState, saveScrollPosition, loadScrollPosition } from '../utils/pwaState';
import { getErrorMessage } from '../utils/errors';
import { logNavigation } from '../utils/navigationDebug';
import { flattenParsedNodes, parseMarkdown } from './mainAreaClipboard';
import type { ParsedNode } from './mainAreaClipboard';

const MindMapView = lazy(() => import('./MindMapView'));
const MarkdownNoteEditor = lazy(() => import('./MarkdownNoteEditor'));
const ExcalidrawEditor = lazy(() => import('./ExcalidrawEditor').then(module => ({ default: module.ExcalidrawEditor })));
const AIChatMainView = lazy(() => import('./AIChatMainView'));
const ProjectView = lazy(() => import('./ProjectView'));
const MemoHome = lazy(() => import('./MemoHome'));

type EmptyWorkspaceView = 'files' | 'recent' | 'starred' | 'projects';

const EmptyDocumentWorkspace = ({ view }: { view: EmptyWorkspaceView }) => {
  const content = {
    files: { icon: FolderOpen, title: '请选择一篇笔记', description: '请在左侧文件列表中选择笔记查看或编辑' },
    recent: { icon: Clock3, title: '请选择最近笔记', description: '请在左侧最近列表中选择笔记查看或编辑' },
    starred: { icon: Star, title: '请选择收藏笔记', description: '请在左侧收藏列表中选择笔记查看或编辑' },
    projects: { icon: BriefcaseBusiness, title: '请选择一个项目', description: '请在左侧项目列表中选择项目查看任务' },
  }[view];
  const EmptyIcon: LucideIcon = content.icon;

  return (
    <div className="flex h-full flex-1 items-center justify-center bg-[#f7f6f2] px-6 text-center dark:bg-gray-900">
      <div className="-mt-16 flex max-w-sm flex-col items-center">
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-[#e6eeeb] text-[#4d9383] dark:bg-[#31574f] dark:text-[#b7d8cf]" aria-hidden="true">
          <EmptyIcon className="h-9 w-9" strokeWidth={1.5} />
        </div>
        <h2 className="text-lg font-medium text-gray-700 dark:text-gray-200">{content.title}</h2>
        <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">{content.description}</p>
      </div>
    </div>
  );
};

interface SerializedNode {
  content: string;
  note?: string;
  is_completed?: boolean;
  is_todo?: boolean;
  color?: string | null;
  children: SerializedNode[];
}

type TreeNode = Node & { children: TreeNode[]; subtreeVersion: string; subtreeNodeIds: string[] };

const getNodeOwnVersion = (node: Node): string => [
  node.id,
  node.document_id,
  node.parent_node_id ?? '',
  node.sort_order,
  node.content,
  node.note ?? '',
  node.is_completed ? 1 : 0,
  node.is_in_progress ? 1 : 0,
  node.is_collapsed ? 1 : 0,
  node.heading ?? '',
  node.is_bold ? 1 : 0,
  node.is_italic ? 1 : 0,
  node.color ?? '',
  node.highlight ?? '',
  node.is_todo ? 1 : 0,
  node.content_type ?? '',
  node.file_path ?? '',
  node.file_name ?? '',
  node.version ?? '',
].join('\u001f');

// Helper to build tree from flat list for rendering
const buildTree = (nodes: Node[]): TreeNode[] => {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // Initialize map
  nodes.forEach(node => {
    nodeMap.set(node.id, { ...node, children: [], subtreeVersion: getNodeOwnVersion(node), subtreeNodeIds: [node.id] });
  });

  // Build hierarchy
  nodes.forEach(node => {
    const nodeWithChildren = nodeMap.get(node.id)!;
    // Check if parent exists in the *visible* set
    if (node.parent_node_id && nodeMap.has(node.parent_node_id)) {
      const parent = nodeMap.get(node.parent_node_id)!;
      parent.children.push(nodeWithChildren);
    } else {
      // If parent is not visible (or null), treat as root for this view
      roots.push(nodeWithChildren);
    }
  });

  const updateSubtreeVersion = (node: TreeNode): string => {
    const childVersions = node.children.map(updateSubtreeVersion).join('\u001e');
    node.subtreeNodeIds = [node.id, ...node.children.flatMap(child => child.subtreeNodeIds)];
    node.subtreeVersion = childVersions ? `${node.subtreeVersion}\u001d${childVersions}` : node.subtreeVersion;
    return node.subtreeVersion;
  };
  roots.forEach(updateSubtreeVersion);

  return roots;
};

// Helper: 获取节点的所有子孙节点
const getDescendants = (nodeId: string, allNodes: Node[]): Node[] => {
  const descendants: Node[] = [];
  const children = allNodes.filter(n => n.parent_node_id === nodeId);
  children.forEach(child => {
    descendants.push(child);
    descendants.push(...getDescendants(child.id, allNodes));
  });
  return descendants;
};

const computeHierarchicalRangeSelection = (anchorId: string, currentId: string, allNodes: Node[]): string[] => {
  const nodeById = new Map(allNodes.map(node => [node.id, node]));
  const anchorNode = nodeById.get(anchorId);
  const currentNode = nodeById.get(currentId);
  if (!anchorNode || !currentNode) return [];

  const childrenByParent = new Map<string | null, Node[]>();
  for (const node of allNodes) {
    const parentId = node.parent_node_id && nodeById.has(node.parent_node_id) ? node.parent_node_id : null;
    const siblings = childrenByParent.get(parentId);
    if (siblings) {
      siblings.push(node);
    } else {
      childrenByParent.set(parentId, [node]);
    }
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => a.sort_order - b.sort_order);
  }

  const getPath = (id: string): string[] => {
    const path: string[] = [];
    const seen = new Set<string>();
    let node = nodeById.get(id);
    while (node && !seen.has(node.id)) {
      seen.add(node.id);
      path.unshift(node.id);
      node = node.parent_node_id ? nodeById.get(node.parent_node_id) : undefined;
    }
    return path;
  };

  const anchorPath = getPath(anchorId);
  const currentPath = getPath(currentId);
  const selected = new Set<string>();

  const addSubtree = (id: string) => {
    if (selected.has(id)) return;
    selected.add(id);
    for (const child of childrenByParent.get(id) ?? []) {
      addSubtree(child.id);
    }
  };

  if (anchorPath.includes(currentId)) {
    addSubtree(currentId);
  } else if (currentPath.includes(anchorId)) {
    addSubtree(anchorId);
  } else {
    let commonLength = 0;
    while (
      commonLength < anchorPath.length &&
      commonLength < currentPath.length &&
      anchorPath[commonLength] === currentPath[commonLength]
    ) {
      commonLength += 1;
    }

    const lcaId = commonLength > 0 ? anchorPath[commonLength - 1] : null;
    const anchorBranchId = anchorPath[commonLength];
    const currentBranchId = currentPath[commonLength];
    const siblings = childrenByParent.get(lcaId) ?? [];
    const anchorIndex = siblings.findIndex(node => node.id === anchorBranchId);
    const currentIndex = siblings.findIndex(node => node.id === currentBranchId);

    if (anchorIndex === -1 || currentIndex === -1) {
      addSubtree(anchorId);
      addSubtree(currentId);
    } else {
      const from = Math.min(anchorIndex, currentIndex);
      const to = Math.max(anchorIndex, currentIndex);
      for (const sibling of siblings.slice(from, to + 1)) {
        addSubtree(sibling.id);
      }
    }
  }

  const ordered: string[] = [];
  const appendInDocumentOrder = (parentId: string | null) => {
    for (const node of childrenByParent.get(parentId) ?? []) {
      if (selected.has(node.id)) ordered.push(node.id);
      appendInDocumentOrder(node.id);
    }
  };
  appendInDocumentOrder(null);
  return ordered;
};

// Helper: 将选中的节点转换为 Markdown 格式
const nodesToMarkdown = (allNodes: Node[], selectedIds: string[]): string => {
  const selectedNodes = allNodes.filter(n => selectedIds.includes(n.id));
  const lines: string[] = [];
  
  const processNode = (node: Node, depth: number) => {
    const indent = '  '.repeat(depth);
    const checkbox = node.is_completed ? '[x]' : '[ ]';
    const content = node.is_todo ? `- ${checkbox} ${node.content}` : `- ${node.content}`;
    lines.push(indent + content);
    if (node.note) {
      lines.push(indent + `  > ${node.note}`);
    }
    // 处理子节点
    const children = allNodes.filter(n => n.parent_node_id === node.id && selectedIds.includes(n.id));
    children.forEach(child => processNode(child, depth + 1));
  };
  
  // 只处理根节点（没有父节点或父节点不在选中列表中的节点）
  selectedNodes.filter(n => !n.parent_node_id || !selectedIds.includes(n.parent_node_id)).forEach(node => {
    processNode(node, 0);
  });
  
  return lines.join('\n');
};

// 剪贴板寄存器
const clipboardRegister = {
  data: null as SerializedNode[] | null,
  // 标记：是否刚由应用内部触发了复制
  isInternalCopy: false,
  saveSerializedRows(data: SerializedNode[]) {
    this.data = data;
    this.isInternalCopy = true;
  },
  getSerializedRows(): SerializedNode[] | null {
    return this.data;
  },
  clear() {
    this.data = null;
    this.isInternalCopy = false;
  }
};

// Helper: 序列化节点为树结构（用于内部粘贴）
const serializeNodesToTree = (allNodes: Node[], selectedIds: string[]): SerializedNode[] => {
  const selectedNodes = allNodes.filter(n => selectedIds.includes(n.id));
  
  const processNode = (node: Node): SerializedNode => {
    const children = allNodes.filter(n => n.parent_node_id === node.id && selectedIds.includes(n.id));
    return {
      content: node.content,
      note: node.note,
      is_completed: node.is_completed,
      is_todo: node.is_todo,
      color: node.color,
      children: children.map(child => processNode(child))
    };
  };
  
  // 只处理根节点
  return selectedNodes
    .filter(n => !n.parent_node_id || !selectedIds.includes(n.parent_node_id))
    .map(node => processNode(node));
};

interface MainAreaProps {
  diaryDocId?: string | null;
  onDiaryDocChange?: (docId: string) => void;
  userSubView?: UserSubView | null;
  activeConvId?: string | null;
}

const createSortOrder = () => Date.now();
function loadDocumentTabs(): DocumentTab[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(DOCUMENT_TABS_STORAGE_KEY) || '[]') as DocumentTab[];
    return Array.isArray(parsed) ? parsed.filter(tab => tab && typeof tab.key === 'string') : [];
  } catch {
    return [];
  }
}

function getEmptyWorkspacePath(): string {
  try {
    const sidebarState = JSON.parse(sessionStorage.getItem('sidebar_panel_state') || '{}') as { viewMode?: string };
    if (sidebarState.viewMode === 'recent') return '/?view=recent';
    if (sidebarState.viewMode === 'starred') return '/?view=starred';
    if (sidebarState.viewMode === 'projects') return '/?view=projects';
  } catch {
    // 使用默认文件工作区。
  }
  return '/?view=files';
}

const MainArea = ({ diaryDocId = null, onDiaryDocChange, userSubView = null, activeConvId = null }: MainAreaProps = {}) => {
  const { setActiveConvId, refreshConvList, selectedProjectId, setSelectedProjectId } = useUserView();
  const [showArchivedProjects, setShowArchivedProjects] = useState(false);
  const [archivedProjectsReloadKey, setArchivedProjectsReloadKey] = useState(0);
  const { documentId: urlDocumentId } = useParams();
  const navigate = useNavigate();
  const documentId = diaryDocId || urlDocumentId;
  const [searchParams, setSearchParams] = useSearchParams();
  const { updateDocumentTitle, documents } = useDocuments();
  const { searchQuery, setSearchQuery } = useSearch();
  const [showOutlineFilter, setShowOutlineFilter] = useState(false);
  const diaryCtx = useDiary();
  const fetchIdRef = useRef(0);
  const [nodes, setNodes] = useState<Node[]>([]);
  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  const [loadedDoc, setCurrentDoc] = useState<Document | null>(null);
  const documentsRef = useRef(documents);
  useEffect(() => { documentsRef.current = documents; }, [documents]);

  useEffect(() => {
    const openArchivedProjects = () => {
      setSelectedProjectId(null);
      setShowArchivedProjects(true);
      setArchivedProjectsReloadKey(prev => prev + 1);
    };
    const closeArchivedProjects = () => {
      setShowArchivedProjects(false);
    };
    window.addEventListener('projects-open-archived', openArchivedProjects);
    window.addEventListener('projects-close-archived', closeArchivedProjects);
    return () => {
      window.removeEventListener('projects-open-archived', openArchivedProjects);
      window.removeEventListener('projects-close-archived', closeArchivedProjects);
    };
  }, [setSelectedProjectId]);
  const currentDoc = useMemo(() => {
    if (!documentId) return null;
    const normalizedId = documentId.replace(/-/g, '');
    const contextDoc = documents.find(doc => doc.id.replace(/-/g, '') === normalizedId);
    const loadedMatches = loadedDoc?.id.replace(/-/g, '') === normalizedId;
    const baseDoc = loadedMatches ? loadedDoc : contextDoc;
    if (!baseDoc) return null;
    return contextDoc && contextDoc.title !== baseDoc.title
      ? { ...baseDoc, title: contextDoc.title }
      : baseDoc;
  }, [documentId, documents, loadedDoc]);
  const [isLoading, setIsLoading] = useState(false);
  const { saveStatus, pendingCount, isOnline, offlineQueueCount } = useSaveManager();
  const [documentTabs, setDocumentTabs] = useState<DocumentTab[]>(loadDocumentTabs);
  const [activeDocumentTabKey, setActiveDocumentTabKey] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(ACTIVE_DOCUMENT_TAB_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const pendingTabModeRef = useRef<DocumentTabMode | null>(null);
  const closingDocumentIdsRef = useRef(new Set<string>());
  // Mobile state
  const isMobile = usePhoneLayout();
  const { scrollToElement } = useKeyboardScroll({ enabled: isMobile });
  const focusNode = useCallback((nodeId: string, field: 'content' | 'note' = 'content') => {
    const applyFocus = () => {
      const el = document.getElementById(`${field}-${nodeId}`);
      if (!el) {
        window.setTimeout(applyFocus, 50);
        return;
      }

      el.focus({ preventScroll: true });
      if (field === 'content') {
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
      scrollToElement(nodeId, field);
    };
    applyFocus();
  }, [scrollToElement]);
  const [focusedNodeId, setFocusedNodeId] = useState<{ id: string, field: 'content' | 'note' } | null>(null);

  const [zoomedNodeState, setZoomedNodeState] = useState<{ documentId: string | null; nodeId: string | null }>({ documentId, nodeId: null });
  const zoomedNodeId = zoomedNodeState.documentId === documentId ? zoomedNodeState.nodeId : null;
  const setZoomedNodeId = useCallback((nodeId: string | null) => {
    setZoomedNodeState({ documentId: documentId ?? null, nodeId });
  }, [documentId]);
  const focusBreadcrumbs = useMemo(() => {
    const documentBreadcrumb = {
      id: `document:${currentDoc?.id ?? documentId ?? ''}`,
      label: currentDoc?.title || '无标题',
      nodeId: null as string | null,
    };
    if (!zoomedNodeId || !currentDoc) return [documentBreadcrumb];

    const nodeMap = new Map(nodes.map(node => [node.id, node]));
    const path: { id: string; label: string; nodeId: string }[] = [];
    const visited = new Set<string>();
    let currentNode = nodeMap.get(zoomedNodeId);

    while (currentNode && !visited.has(currentNode.id)) {
      visited.add(currentNode.id);
      path.unshift({
        id: currentNode.id,
        label: currentNode.content || '无标题',
        nodeId: currentNode.id,
      });
      currentNode = currentNode.parent_node_id
        ? nodeMap.get(currentNode.parent_node_id)
        : undefined;
    }

    return [documentBreadcrumb, ...path];
  }, [currentDoc, documentId, nodes, zoomedNodeId]);
  const [tagFilterState, setTagFilterState] = useState<{ documentId: string | null; value: string | null }>({ documentId, value: null });
  const tagFilter = tagFilterState.documentId === documentId ? tagFilterState.value : null;
  const setTagFilter = useCallback((action: SetStateAction<string | null>) => {
    setTagFilterState(previous => {
      const current = previous.documentId === documentId ? previous.value : null;
      const value = typeof action === 'function' ? action(current) : action;
      return { documentId: documentId ?? null, value };
    });
  }, [documentId]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  useEffect(() => { selectedNodeIdsRef.current = selectedNodeIds; }, [selectedNodeIds]);
  const [batchEditPosition, setBatchEditPosition] = useState<{ x: number; y: number } | null>(null);
  const [batchEditButtonPosition, setBatchEditButtonPosition] = useState<{ x: number; y: number } | null>(null);
  const updateSelectedNodeIds = useCallback((action: SetStateAction<string[]>) => {
    setBatchEditPosition(null);
    setSelectedNodeIds(action);
  }, []);
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    nodeId: string;
    message: string;
    descendants: Node[];
  } | null>(null);
  const dragSelectionRef = useRef({ isDragging: false, startNodeId: null as string | null, lastRangeStr: '' });
  const [isDragMoving, setIsDragMoving] = useState(false);
  const [dropTarget, setDropTarget] = useState<{ nodeId: string; position: 'before' | 'after' | 'child' } | null>(null);
  const dropTargetRef = useRef<{ nodeId: string; position: 'before' | 'after' | 'child' } | null>(null);
  const dragMoveRef = useRef({ isMoving: false, startNodeId: null as string | null, selectedIds: [] as string[] });
  const ghostAnchorRef = useRef<HTMLInputElement>(null);
  const nodeIdFromUrl = searchParams.get('nodeId');
  // Diary state
  const { diaryDays, setDiaryDays, register: registerDiaryHandler, unregister: unregisterDiaryHandler, registerAddNode, unregisterAddNode } = diaryCtx;
  const pendingDiaryDayClicksRef = useRef<Set<string>>(new Set());
  const isDiaryDoc = !!(currentDoc?.diary_date);
  const diaryYear = useMemo(() => {
    const m = currentDoc?.diary_date?.match(/^(\d{4})-(\d{2})$/);
    return m ? parseInt(m[1]) : null;
  }, [currentDoc?.diary_date]);
  const diaryMonth = useMemo(() => {
    const m = currentDoc?.diary_date?.match(/^(\d{4})-(\d{2})$/);
    return m ? parseInt(m[2]) : null;
  }, [currentDoc?.diary_date]);
  const diaryMonthMatch = diaryYear !== null && diaryMonth !== null;
  
  const [recoveryOperations, setRecoveryOperations] = useState<PendingOperation[]>(() => saveStateManager.getPendingOperations());
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(() => recoveryOperations.length > 0);
  const [isRecovering, setIsRecovering] = useState(false);
  const [editingNodes, setEditingNodes] = useState<Set<string>>(new Set());
  const editingNodesRef = useRef(editingNodes);
  useEffect(() => { editingNodesRef.current = editingNodes; }, [editingNodes]);
  const [focusedNodeIdForToolbar, setFocusedNodeIdForToolbar] = useState<string | null>(null);
  const focusedNodeIdForToolbarRef = useRef(focusedNodeIdForToolbar);
  useEffect(() => { focusedNodeIdForToolbarRef.current = focusedNodeIdForToolbar; }, [focusedNodeIdForToolbar]);
  const [markdownPreview, setMarkdownPreview] = useState<string | null>(null);

  // Mobile toolbar context - publish handlers to parent layout
  const { publish: publishToolbar, isInsideProvider: hasToolbarProvider } = useMobileToolbar();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const markEditing = useCallback((nodeId: string) => {
    setEditingNodes(prev => new Set(prev).add(nodeId));
  }, []);

  const markSaved = useCallback((nodeId: string) => {
    setEditingNodes(prev => {
      const next = new Set(prev);
      next.delete(nodeId);
      return next;
    });
  }, []);

  const updateBatchEditButtonPosition = useCallback(() => {
    if (selectedNodeIdsRef.current.length <= 1 || dragMoveRef.current.isMoving) {
      setBatchEditButtonPosition(null);
      return;
    }

    const selectedSet = new Set(selectedNodeIdsRef.current);
    const selectedRows = Array.from(document.querySelectorAll<HTMLElement>('[data-node-id]'))
      .filter(row => {
        const nodeId = row.getAttribute('data-node-id');
        return !!nodeId && selectedSet.has(nodeId);
      });

    if (selectedRows.length === 0) {
      setBatchEditButtonPosition(null);
      return;
    }

    const rects = selectedRows.map(row => row.getBoundingClientRect());
    const top = Math.min(...rects.map(rect => rect.top));
    const bottom = Math.max(...rects.map(rect => rect.bottom));
    const left = Math.min(...rects.map(rect => rect.left));

    setBatchEditButtonPosition({
      x: Math.max(12, left - 42),
      y: top + (bottom - top) / 2,
    });
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(updateBatchEditButtonPosition);
    return () => window.cancelAnimationFrame(frameId);
  }, [selectedNodeIds, nodes, updateBatchEditButtonPosition]);

  useEffect(() => {
    if (selectedNodeIds.length <= 1) return;

    const handleViewportChange = () => updateBatchEditButtonPosition();
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [selectedNodeIds.length, updateBatchEditButtonPosition]);

  // 监听全局鼠标松开和点击，拦截拖拽后的点击事件，防止选区消失
  useEffect(() => {
    const handleClickCapture = (e: MouseEvent) => {
      // 如果处于拖拽多选状态，拦截并吃掉这次点击，防止触发 input focus
      if (dragSelectionRef.current.isDragging) {
        e.stopPropagation();
        e.preventDefault();
        dragSelectionRef.current.isDragging = false;
      }
    };

    const handleMouseUp = () => {
      // 移动模式由容器的 onMouseUp 处理，这里跳过
      if (dragMoveRef.current.isMoving) return;
      dragSelectionRef.current.startNodeId = null;
      dragSelectionRef.current.lastRangeStr = '';
      setTimeout(() => {
        dragSelectionRef.current.isDragging = false;
      }, 50);
    };

    window.addEventListener('click', handleClickCapture, true); // 使用捕获阶段
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('click', handleClickCapture, true);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // 拦截页面关闭/刷新，提示未保存的数据
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const editingNodes = editingNodesRef.current;
      const nodes = nodesRef.current;
      if (editingNodes.size > 0) {
        const pendingData = Array.from(editingNodes).map(nodeId => {
          const node = nodes.find(n => n.id === nodeId);
          if (!node) return null;

          // 从 DOM 中获取当前正在编辑的内容
          const contentEl = document.getElementById(`node-${nodeId}`);
          const noteEl = document.getElementById(`note-${nodeId}`);

          const content = contentEl?.textContent || node.content;
          const note = noteEl?.textContent || node.note;

          return { id: nodeId, content, note };
        }).filter(Boolean);

        const operations = pendingData.flatMap(node => node ? [
          {
            id: `final-content-${node.id}`,
            type: 'updateContent',
            data: { id: node.id, newContent: node.content },
          },
          {
            id: `final-note-${node.id}`,
            type: 'updateNote',
            data: { id: node.id, newNote: node.note },
          },
        ] : []);
        sendBatchSaveRequest(operations);
      }

      if (saveStateManager.hasUnsavedChanges()) {
        saveStateManager.forceSaveAll();

        e.preventDefault();
        e.returnValue = '有未保存的更改，确定要离开吗？';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // iOS PWA 状态持久化：保存/恢复滚动位置和笔记缓存
  useEffect(() => {
    const saveState = () => {
      if (saveStateManager.hasUnsavedChanges()) {
        saveStateManager.forceSaveAll();
      }
      const mainContent = document.querySelector('.main-content-area');
      if (mainContent) {
        saveScrollPosition(mainContent.scrollTop);
      }
    };

    const handlePageHide = () => saveState();

    const restoreScroll = () => {
      const scrollTop = loadScrollPosition();
      if (scrollTop != null) {
        requestAnimationFrame(() => {
          const mainContent = document.querySelector('.main-content-area');
          if (mainContent && Math.abs(mainContent.scrollTop - scrollTop) > 50) {
            mainContent.scrollTop = scrollTop;
          }
        });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveState();
      if (document.visibilityState === 'visible') restoreScroll();
    };

    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) restoreScroll();
    };

    // 定期保存滚动位置（每 5 秒）
    const scrollSaveInterval = setInterval(() => {
      const mainContent = document.querySelector('.main-content-area');
      if (mainContent && mainContent.scrollTop > 0) {
        saveScrollPosition(mainContent.scrollTop);
      }
    }, 5000);

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(scrollSaveInterval);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleRecover = async () => {
    setIsRecovering(true);
    try {
      for (const op of recoveryOperations) {
        if (!op.data || !op.data.type) continue;
        
        const { type } = op.data;
        
        try {
          switch (type) {
            case 'updateContent':
              if (op.data.id && op.data.newContent !== undefined) {
                await updateNode(op.data.id, { content: op.data.newContent });
              }
              break;
              
            case 'updateNote':
              if (op.data.id && op.data.newNote !== undefined) {
                await updateNode(op.data.id, { note: op.data.newNote });
              }
              break;
              
            case 'toggleProperty':
              if (op.data.id && op.data.property && op.data.newValue !== undefined) {
                await updateNode(op.data.id, { [op.data.property]: op.data.newValue });
              }
              break;
              
            case 'batchToggleProperty':
              if (op.data.ids && op.data.property && op.data.newValue !== undefined) {
                await batchUpdateNodes(op.data.ids.map((id: string) => ({ id, [op.data.property]: op.data.newValue })));
              }
              break;
              
            case 'moveNode':
              if (op.data.id) {
                await moveNode(op.data.id, op.data.newParent, op.data.newOrder);
              }
              break;
              
            case 'batchMove':
              if (op.data.updates) {
                const payload = op.data.updates.map((u: { id: string; newParent: string | null; newOrder: number }) => ({
                  id: u.id, 
                  parent_node_id: u.newParent, 
                  sort_order: u.newOrder 
                }));
                await batchMoveNodes(payload);
              }
              break;
              
            case 'deleteNode':
              if (op.data.nodeId) {
                await deleteNode(op.data.nodeId);
              }
              break;
              
            case 'batchDelete':
              if (op.data.ids) {
                await batchDeleteNodes(op.data.ids);
              }
              break;
              
            case 'createNode':
              if (op.data.nodeData) {
                await createNode(
                  op.data.nodeData.document_id,
                  op.data.nodeData.content || '',
                  op.data.nodeData.parent_node_id,
                  {
                    id: op.data.nodeId,
                    sort_order: op.data.nodeData.sort_order,
                    note: op.data.nodeData.note,
                    is_completed: op.data.nodeData.is_completed,
                    is_collapsed: op.data.nodeData.is_collapsed,
                    is_todo: op.data.nodeData.is_todo
                  }
                );
              }
              break;
              
            case 'undoDeleteNode':
            case 'undoBatchDelete':
              if (op.data.allNodes) {
                const promises = op.data.allNodes.map((n: Node) => 
                  createNode(n.document_id, n.content, n.parent_node_id, {
                    id: n.id,
                    sort_order: n.sort_order,
                    note: n.note,
                    is_completed: n.is_completed,
                    is_collapsed: n.is_collapsed,
                    is_todo: n.is_todo
                  })
                );
                await Promise.all(promises);
              }
              break;
              
            case 'undoCreateNode':
              if (op.data.nodeId) {
                await deleteNode(op.data.nodeId);
              }
              break;
              
            default:
              console.warn('Unknown operation type:', type);
          }
          
          saveStateManager.markSaved(op.id);
        } catch (err) {
          console.error(`Failed to recover operation ${op.id}:`, err);
        }
      }
      
      saveStateManager.clearLocal();
      setShowRecoveryDialog(false);
      setRecoveryOperations([]);
      
      // 当前节点状态已由命令的乐观更新保留；文档切换时会由加载 effect 重新拉取。
    } catch (error) {
      console.error('Recovery failed:', error);
      alert('恢复失败，部分操作可能未成功。请手动检查并重新编辑。');
    } finally {
      setIsRecovering(false);
    }
  };

  const handleDiscard = () => {
    saveStateManager.clearLocal();
    setShowRecoveryDialog(false);
    setRecoveryOperations([]);
  };

  useEffect(() => {
    const handleSidebarOpen = () => setSidebarOpen(true);
    const handleSidebarClose = () => setSidebarOpen(false);
    window.addEventListener('sidebarOpen', handleSidebarOpen);
    window.addEventListener('sidebarClose', handleSidebarClose);
    return () => {
      window.removeEventListener('sidebarOpen', handleSidebarOpen);
      window.removeEventListener('sidebarClose', handleSidebarClose);
    };
  }, []);

  // Undo/Redo Hook
  const { execute, undo, redo } = useHistory();
  const commands = useMemo(() => createCommandFactory(setNodes), []);

  // View Mode State - 'outline' or 'mindmap'
  const [viewModeState, setViewModeState] = useState<{ documentId: string | null; value: 'outline' | 'mindmap' }>({ documentId, value: 'outline' });
  const viewMode = viewModeState.documentId === documentId ? viewModeState.value : 'outline';
  const openDocumentTab = useCallback((mode: DocumentTabMode, targetDocument?: Document | null) => {
    const doc = targetDocument || currentDoc;
    if (!doc || (doc.type !== 'document' && doc.type !== 'note' && doc.type !== 'excalidraw')) return;
    const key = getDocumentTabKey(doc.id, mode);
    setDocumentTabs(previous => {
      const existing = previous.find(tab => tab.key === key);
      const nextTab: DocumentTab = {
        key,
        documentId: doc.id,
        mode,
        title: doc.title || '无标题',
        type: doc.type,
        dirty: existing?.dirty,
      };
      return existing
        ? previous.map(tab => tab.key === key ? nextTab : tab)
        : [...previous, nextTab];
    });
    setActiveDocumentTabKey(key);
    setViewModeState({ documentId: doc.id, value: mode === 'mindmap' ? 'mindmap' : 'outline' });
  }, [currentDoc]);

  const setDocumentTabDirty = useCallback((tabDocumentId: string, mode: DocumentTabMode, dirty: boolean) => {
    const key = getDocumentTabKey(tabDocumentId, mode);
    setDocumentTabs(previous => {
      const tab = previous.find(item => item.key === key);
      if (!tab || tab.dirty === dirty) return previous;
      return previous.map(item => item.key === key ? { ...item, dirty } : item);
    });
  }, []);
  const handleCurrentOutlineDirty = useCallback((dirty: boolean) => {
    if (documentId) setDocumentTabDirty(documentId, 'outline', dirty);
  }, [documentId, setDocumentTabDirty]);

  useEffect(() => {
    // 关闭最后一个 Tab 后进入空白工作区；下一次重新打开同一文档时，
    // 不能再被上一次关闭流程的标记误判为“正在关闭”。
    if (!documentId) {
      closingDocumentIdsRef.current.clear();
    }
  }, [documentId]);

  useEffect(() => {
    if (!currentDoc || !documentId || isDiaryDoc) return;
    // 关闭当前 Tab 后路由切换尚未完成时，阻止旧文档被同步 effect 重新注册。
    if (closingDocumentIdsRef.current.delete(currentDoc.id)) return;
    const mode = pendingTabModeRef.current
      ?? (activeDocumentTabKey?.startsWith(`${currentDoc.id}:mindmap`) ? 'mindmap' : 'outline');
    pendingTabModeRef.current = null;
    openDocumentTab(mode, currentDoc);
  }, [currentDoc, documentId, isDiaryDoc, activeDocumentTabKey, openDocumentTab]);

  // 不复用上一个文档的滚动位置，避免切换 Tab 后大纲内容从页面中部开始显示。
  useEffect(() => {
    if (!documentId || viewMode !== 'outline') return;
    const frame = requestAnimationFrame(() => {
      const outline = document.querySelector<HTMLElement>('.outline-content-scroll-area');
      outline?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
    return () => cancelAnimationFrame(frame);
  }, [documentId, viewMode]);

  useEffect(() => {
    try {
      sessionStorage.setItem(DOCUMENT_TABS_STORAGE_KEY, JSON.stringify(documentTabs));
      if (activeDocumentTabKey) sessionStorage.setItem(ACTIVE_DOCUMENT_TAB_STORAGE_KEY, activeDocumentTabKey);
      else sessionStorage.removeItem(ACTIVE_DOCUMENT_TAB_STORAGE_KEY);
    } catch {
      // sessionStorage 不可用时仍允许当前页面正常使用 Tab。
    }
  }, [documentTabs, activeDocumentTabKey]);

  // 左侧列表删除文档后同步清理已经打开的失效 Tab。
  // documents 初始加载阶段可能暂时为空，不能因此误删 sessionStorage 中的 Tab。
  useEffect(() => {
    if (documents.length === 0) return;
    const timer = window.setTimeout(() => {
      const validDocumentIds = new Set(documents.map(doc => doc.id));
      setDocumentTabs(previous => {
        const next = previous.filter(tab => validDocumentIds.has(tab.documentId));
        return next.length === previous.length ? previous : next;
      });
      setActiveDocumentTabKey(previous => {
        if (!previous) return previous;
        return documentTabs.some(tab => tab.key === previous && validDocumentIds.has(tab.documentId))
          ? previous
          : null;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [documents, documentTabs]);

  const handleDocumentTabSelect = useCallback((tab: DocumentTab) => {
    if (tab.documentId === documentId) {
      openDocumentTab(tab.mode, currentDoc);
      return;
    }
    pendingTabModeRef.current = tab.mode;
    startTransition(() => navigate(`/d/${tab.documentId}`));
  }, [currentDoc, documentId, navigate, openDocumentTab]);

  const handleDocumentTabClose = useCallback((tab: DocumentTab) => {
    const hasPendingChanges = tab.dirty || (tab.documentId === documentId && (saveStatus === 'saving' || pendingCount > 0));
    if (hasPendingChanges && !window.confirm('当前笔记还有未保存的修改，确定要关闭吗？')) return;

    closingDocumentIdsRef.current.add(tab.documentId);
    startTransition(() => {
      setDocumentTabs(previous => previous.filter(item => item.key !== tab.key));
      if (tab.key !== activeDocumentTabKey) return;

      const remaining = documentTabs.filter(item => item.key !== tab.key);
      const nextTab = remaining[remaining.length - 1];
      if (!nextTab) {
        setActiveDocumentTabKey(null);
        navigate(getEmptyWorkspacePath());
        return;
      }
      setActiveDocumentTabKey(nextTab.key);
      pendingTabModeRef.current = nextTab.mode;
      if (nextTab.documentId === documentId) {
        setViewModeState({ documentId: nextTab.documentId, value: nextTab.mode });
      } else {
        navigate(`/d/${nextTab.documentId}`);
      }
    });
  }, [activeDocumentTabKey, documentId, documentTabs, navigate, pendingCount, saveStatus]);
  const setViewMode = useCallback((value: 'outline' | 'mindmap') => {
    openDocumentTab(value, currentDoc);
  }, [currentDoc, openDocumentTab]);

  const handleMindMapNodeUpdate = async (nodeId: string, content: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || node.content === content) return;
    if (documentId) setDocumentTabDirty(documentId, 'mindmap', true);
    execute(commands.createUpdateContentCommand(nodeId, node.content, content));
  };

  const handleMindMapNodeAdd = async (parentId: string | null, content: string): Promise<Node | null> => {
    if (!documentId) return null;
    
    const siblings = nodes.filter(n => n.parent_node_id === parentId);
    const maxSortOrder = siblings.length > 0 
      ? Math.max(...siblings.map(n => n.sort_order)) 
      : 0;

    const newNodeId = crypto.randomUUID();
    const newNode: Node = {
      id: newNodeId,
      document_id: documentId,
      content,
      parent_node_id: parentId,
      sort_order: maxSortOrder + 1000,
      note: '',
      is_completed: false,
      is_collapsed: false,
      is_todo: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } as Node;

    setDocumentTabDirty(documentId, 'mindmap', true);
    execute(commands.createCreateNodeCommand({
      document_id: documentId,
      content,
      parent_node_id: parentId,
      sort_order: maxSortOrder + 1000
    }));
    
    return newNode;
  };

  const handleMindMapNodeDelete = async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const descendants = getDescendants(nodeId, nodes);
    if (documentId) setDocumentTabDirty(documentId, 'mindmap', true);
    execute(commands.createDeleteNodeCommand(node, descendants));
  };

  const handleMindMapNodeMove = async (nodeId: string, newParentId: string | null) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    if (documentId) setDocumentTabDirty(documentId, 'mindmap', true);
    execute(commands.createMoveNodeCommand(
      nodeId,
      node.parent_node_id,
      node.sort_order,
      newParentId,
      node.sort_order
    ));
  };

  const handleFocus = (id: string) => {
      setFocusedNodeIdForToolbar(id);
  };

  const handleBlurToolbar = useCallback(() => {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      // 保留工具栏：焦点仍在 contentEditable 节点上，或移到了工具栏内
      if (active && (active.getAttribute('contenteditable') || active.closest('[role="toolbar"]'))) {
        return;
      }
      setFocusedNodeIdForToolbar(null);
    });
  }, []);





  // 保存视图状态到 localStorage
  useEffect(() => {
    saveViewState({ lastRoute: documentId ? `/doc/${documentId}` : '/' });
  }, [documentId]);

  // 页面加载时恢复滚动位置
  useEffect(() => {
    const scrollTop = loadScrollPosition();
    if (scrollTop != null) {
      requestAnimationFrame(() => {
        const mainContent = document.querySelector('.main-content-area');
        if (mainContent) mainContent.scrollTop = scrollTop;
      });
    }
  }, []);

  // 监听文章链接点击，导航到目标文章
  useEffect(() => {
    const handleDocLinkClick = (e: Event) => {
      const customEvent = e as CustomEvent;
      const docId = customEvent.detail;
      if (docId) {
        navigate(`/d/${docId}`);
      }
    };
    window.addEventListener('doc-link-click', handleDocLinkClick);
    return () => window.removeEventListener('doc-link-click', handleDocLinkClick);
  }, [navigate]);

  // 监听标签点击，进入/退出标签过滤模式
  useEffect(() => {
    const handleTagClick = (e: Event) => {
      const customEvent = e as CustomEvent;
      const tag = customEvent.detail;
      if (!tag) return;
      setTagFilter(prev => prev === tag ? null : tag);
    };
    window.addEventListener('tag-click', handleTagClick);
    return () => window.removeEventListener('tag-click', handleTagClick);
  }, [setTagFilter]);

  // 注意：不再在 sidebarClose 时重新 fetchData，
  // documentId 变化时 useEffect 已自动加载数据

  const fetchData = useCallback(async (id: string, fetchId?: number) => {
    const normalizedId = id.replace(/-/g, '');
    const contextDoc = documentsRef.current.find(d => d.id.replace(/-/g, '') === normalizedId);
    const isCanvasDocument = contextDoc?.type === 'excalidraw';
    const cachedNodes = isCanvasDocument ? [] : dataCache.get<Node[]>(`nodes:${id}`);
    setIsLoading(!isCanvasDocument && !cachedNodes);
    if (cachedNodes) {
      setNodes(cachedNodes);
    }
    try {
      // 节点和文档元数据互不依赖，并行获取，避免文档不在 context 时多等待一轮 RTT。
      const documentPromise = contextDoc
        ? Promise.resolve(contextDoc)
        : getDocument(id).catch(() => null);
      const [nodesData, foundDoc] = await Promise.all([
        isCanvasDocument || cachedNodes ? Promise.resolve(cachedNodes || [] as Node[]) : getNodes(id),
        documentPromise,
      ]);

      // Check if this fetch is still current
      if (fetchId !== undefined && fetchId !== fetchIdRef.current) return;

      const processedNodes = [...nodesData];
      const ancestorsToExpand: string[] = [];

      if (nodeIdFromUrl) {
        let current = processedNodes.find(n => n.id === nodeIdFromUrl);
        while (current && current.parent_node_id) {
          const parentId = current.parent_node_id;
          const parentIndex = processedNodes.findIndex(n => n.id === parentId);

          if (parentIndex !== -1 && processedNodes[parentIndex].is_collapsed) {
            ancestorsToExpand.push(parentId);
            processedNodes[parentIndex] = { ...processedNodes[parentIndex], is_collapsed: false };
          }
          current = processedNodes[parentIndex];
        }
      }

      setNodes(processedNodes);
      if (foundDoc) {
        setCurrentDoc(foundDoc);
      }

      if (ancestorsToExpand.length > 0) {
        setTimeout(() => {
          execute(commands.createBatchTogglePropertyCommand(ancestorsToExpand, 'is_collapsed', false));
        }, 500);
      }

      if (nodeIdFromUrl) {
        setTimeout(() => {
          setFocusedNodeId({ id: nodeIdFromUrl, field: 'content' });

          requestAnimationFrame(() => {
            const element = document.getElementById(`node-${nodeIdFromUrl}`);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });

              const rowEl = element.closest('.flex.items-start') as HTMLElement;
              if (rowEl) {
                rowEl.style.transition = 'none';
                rowEl.style.backgroundColor = 'rgba(253, 224, 71, 0.4)';

                void rowEl.offsetWidth;

                rowEl.style.transition = 'background-color 1.5s ease-out';
                rowEl.style.backgroundColor = 'transparent';

                setTimeout(() => {
                  rowEl.style.transition = '';
                  rowEl.style.backgroundColor = '';
                }, 1500);
              }
            }
          });

          setSearchParams({}, { replace: true });
        }, 300);
      }
    } catch (error) {
      console.error('Failed to fetch data', error);
    } finally {
      if (fetchId === undefined || fetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [commands, execute, nodeIdFromUrl, setSearchParams]);

  useEffect(() => {
    if (documentId) {
      const id = ++fetchIdRef.current;
      void fetchData(documentId, id);
    } else {
      fetchIdRef.current++;
    }
  }, [documentId, fetchData]);

  useEffect(() => {
    logNavigation('main-area-document-state', {
      documentId,
      urlDocumentId,
      diaryDocId,
      currentDocId: currentDoc?.id || null,
      currentDocType: currentDoc?.type || null,
      diaryDate: currentDoc?.diary_date || null,
      isDiaryDoc,
    });
  }, [currentDoc?.diary_date, currentDoc?.id, currentDoc?.type, diaryDocId, documentId, isDiaryDoc, urlDocumentId]);

  // Fetch diary days when document changes
  useEffect(() => {
    if (isDiaryDoc && diaryYear !== null && diaryMonth !== null) {
      getDiaryDayDates(diaryYear, diaryMonth).then(days => setDiaryDays(new Set(days))).catch(() => setDiaryDays(new Set()));
      return;
    }
    const timer = window.setTimeout(() => setDiaryDays(new Set()), 0);
    return () => window.clearTimeout(timer);
  }, [currentDoc?.diary_date, diaryMonth, diaryYear, isDiaryDoc, setDiaryDays]);

  // 项目任务完成/取消完成会联动当天日记：收到事件后失效缓存并热更新日记文档与日历
  useEffect(() => {
    if (!isDiaryDoc || diaryYear === null || diaryMonth === null || !documentId) return;
    const refreshFromTaskToggle = () => {
      dataCache.invalidate(`nodes:${documentId}`);
      dataCache.invalidate(`diary:days:${diaryYear}:${diaryMonth}`);
      fetchData(documentId, ++fetchIdRef.current);
      getDiaryDayDates(diaryYear, diaryMonth)
        .then(days => setDiaryDays(new Set(days)))
        .catch(() => {});
    };
    window.addEventListener('diary-tasks-updated', refreshFromTaskToggle);
    return () => window.removeEventListener('diary-tasks-updated', refreshFromTaskToggle);
  }, [isDiaryDoc, diaryYear, diaryMonth, documentId, fetchData, setDiaryDays]);

  // Handle clicking a day in the diary date bar (returns true if handled)
  const handleDiaryDayClick = useCallback(async (day: number): Promise<boolean> => {
    if (diaryYear === null || diaryMonth === null || !documentId) return false;
    const pendingKey = `${diaryYear}-${diaryMonth}-${day}`;
    if (pendingDiaryDayClicksRef.current.has(pendingKey)) return true;
    pendingDiaryDayClicksRef.current.add(pendingKey);
    try {
      const result = await getOrCreateDayNode(diaryYear, diaryMonth, day);

      if (result.is_new) {
        // Construct the date node for local state
        const weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
        const dt = new Date(diaryYear, diaryMonth - 1, day);
        const dateContent = `${diaryYear}年${diaryMonth}月${day}日 ${weekdays[dt.getDay() === 0 ? 6 : dt.getDay() - 1]}`;
        const newDateNode: Node = {
          id: result.node_id,
          document_id: documentId,
          parent_node_id: null,
          content: dateContent,
          note: '',
          is_completed: false,
          is_collapsed: false,
          sort_order: day,
          heading: 'h1',
          is_bold: false,
          is_italic: false,
          is_todo: false,
          content_type: 'text',
        };
        const newNodes = [newDateNode];
        if (result.child_node) {
          newNodes.push(result.child_node as Node);
        }
        setNodes(prev => {
          const existingDateNode = prev.find(n =>
            n.parent_node_id === null
            && n.heading === 'h1'
            && n.content === dateContent
          );
          if (existingDateNode || prev.some(n => n.id === result.node_id)) {
            return prev;
          }
          const existingIds = new Set(prev.map(n => n.id));
          return [...prev, ...newNodes.filter(n => !existingIds.has(n.id))];
        });
        // Update diary days
        setDiaryDays(prev => new Set([...prev, day]));
      }

      // Scroll to the day node
      setTimeout(() => {
        const el = document.getElementById(`node-${result.node_id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          const rowEl = el.closest('.flex.items-start') as HTMLElement;
          if (rowEl) {
            rowEl.style.transition = 'background-color 0.3s';
            rowEl.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
            setTimeout(() => { rowEl.style.backgroundColor = ''; }, 1500);
          }
        }
      }, 100);
      return true;
    } catch (e) {
      console.error('Failed to handle day click', e);
      return false;
    } finally {
      pendingDiaryDayClicksRef.current.delete(pendingKey);
    }
  }, [diaryYear, diaryMonth, documentId, setDiaryDays]);

  // Register/unregister diary handler with context
  useEffect(() => {
    logNavigation('main-area-diary-handler', {
      documentId,
      isDiaryDoc,
      diaryYear,
      diaryMonth,
      action: isDiaryDoc && diaryYear !== null && diaryMonth !== null ? 'register' : 'unregister',
    });
    if (isDiaryDoc && diaryYear !== null && diaryMonth !== null) {
      registerDiaryHandler(diaryYear, diaryMonth, handleDiaryDayClick);
    } else {
      unregisterDiaryHandler();
    }
    return () => unregisterDiaryHandler();
  }, [documentId, isDiaryDoc, diaryYear, diaryMonth, handleDiaryDayClick, registerDiaryHandler, unregisterDiaryHandler]);

  // Register addNode callback for drag-drop hot update
  useEffect(() => {
    if (isDiaryDoc) {
      registerAddNode((node: unknown) => {
        setNodes(prev => [...prev, node as Node]);
      });
    } else {
      unregisterAddNode();
    }
    return () => unregisterAddNode();
  }, [isDiaryDoc, registerAddNode, unregisterAddNode]);

  const handleTitleChange = async (newTitle: string) => {
    if (!currentDoc) return;
    setCurrentDoc({ ...currentDoc, title: newTitle });
    updateDocumentTitle(currentDoc.id, newTitle);
    try {
      await updateDocument(currentDoc.id, { title: newTitle });
    } catch (error) {
      console.error('Failed to update title', error);
    }
  };

  const handleNodeChange = async (id: string, content: string) => {
    const node = nodes.find(n => n.id === id);
    if (!node || node.content === content) return;

    // Undo 合并逻辑：同一节点在 500ms 内的连续编辑合并为一条命令
    const now = createSortOrder();
    if (lastEditRef.current?.nodeId === id && now - lastEditRef.current.timestamp < 500) {
      lastEditRef.current = { nodeId: id, timestamp: now, oldContent: lastEditRef.current.oldContent };
      // 不创建新命令，让 saveTimeout 处理最终保存
    } else {
      lastEditRef.current = { nodeId: id, timestamp: now, oldContent: node.content };
      execute(commands.createUpdateContentCommand(id, node.content, content));
    }
  };

  const toggleComplete = async (id: string, is_completed: boolean) => {
    // 兼容旧调用：直接设置 is_completed
    execute(commands.createTogglePropertyCommand(id, 'is_completed', is_completed));
    if (is_completed) {
      execute(commands.createTogglePropertyCommand(id, 'is_in_progress', false));
    }
  };

  // 检查 targetId 是否是 sourceId 的子孙节点
  const isDescendantOf = (sourceId: string, targetId: string, allNodes: Node[]): boolean => {
    const descendants = getDescendants(sourceId, allNodes);
    return descendants.some(d => d.id === targetId);
  };

  const handleDelete = async (id: string) => {
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    const descendants = getDescendants(id, nodes);
    execute(commands.createDeleteNodeCommand(node, descendants));
  };

  const handleConfirmDelete = () => {
    if (!confirmDialog) return;
    const node = nodes.find(n => n.id === confirmDialog.nodeId);
    if (!node) {
      setConfirmDialog(null);
      return;
    }
    
    const currentIndex = sortedNodes.findIndex(n => n.id === confirmDialog.nodeId);
    let nextFocusId = null;

    if (currentIndex > 0) {
      nextFocusId = sortedNodes[currentIndex - 1].id;
    } else {
      const descendantIds = confirmDialog.descendants.map(d => d.id);
      const nextValidNode = sortedNodes.slice(currentIndex + 1).find(n => !descendantIds.includes(n.id));
      if (nextValidNode) {
        nextFocusId = nextValidNode.id;
      }
    }

    // 使用幽灵锚点保持键盘打开
    focusToGhostAnchor();

    // 执行删除操作
    execute(commands.createDeleteNodeCommand(node, confirmDialog.descendants));
    setConfirmDialog(null);

    // 延迟转移到目标节点，确保DOM已经更新
    if (nextFocusId) {
      setTimeout(() => {
        focusNode(nextFocusId);
      }, 100);
    }
  };

  const handleCancelDelete = () => {
    if (!confirmDialog) return;
    setConfirmDialog(null);
  };

  const handlePaste = async (e: React.ClipboardEvent, id: string) => {
    // 文件大小限制 (50MB)
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    
    // 检查是否粘贴了图片或文件
    const items = e.clipboardData.items;
    let hasFile = false;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // 处理图片粘贴
      if (item.type.startsWith('image/')) {
        hasFile = true;
        e.preventDefault();
        e.stopPropagation();
        
        const file = item.getAsFile();
        if (file && currentDoc) {
          // 检查文件大小
          if (file.size > MAX_FILE_SIZE) {
            alert(`文件大小超过限制 (${MAX_FILE_SIZE / 1024 / 1024}MB)`);
            return;
          }
          
          try {
            const uploadResult = await uploadFile(file);
            const targetNode = nodes.find(n => n.id === id);
            
            if (targetNode) {
              // 更新当前节点为图片节点，保留原有文字内容
              const newNodeData = {
                content: targetNode.content || '',  // 保留原有文字内容
                content_type: 'image' as const,
                file_path: uploadResult.file_path,
                file_name: uploadResult.file_name,
              };

              await updateNode(id, newNodeData);
              setNodes(prev => {
                const newNodes = prev.map(n => n.id === id ? { ...n, ...newNodeData } : n);
                return newNodes;
              });
            } else {
              // 创建新的图片节点
              const newNode = await createNode(currentDoc.id, '', null, {
                content_type: 'image',
                file_path: uploadResult.file_path,
                file_name: uploadResult.file_name,
              });
              setNodes(prev => [...prev, newNode]);
            }
          } catch (error: unknown) {
            console.error('图片上传失败', error);
            const errorMessage = getErrorMessage(error, '未知错误');
            alert(`图片上传失败: ${errorMessage}`);
          }
        }
        return;
      }
      
      // 处理文件粘贴
      if (item.kind === 'file' && !item.type.startsWith('image/')) {
        hasFile = true;
        e.preventDefault();
        e.stopPropagation();
        
        const file = item.getAsFile();
        if (file && currentDoc) {
          // 检查文件大小
          if (file.size > MAX_FILE_SIZE) {
            alert(`文件大小超过限制 (${MAX_FILE_SIZE / 1024 / 1024}MB)`);
            return;
          }
          
          try {
            const uploadResult = await uploadFile(file);
            const targetNode = nodes.find(n => n.id === id);

            if (targetNode) {
              // 更新当前节点为附件节点，保留原有文字内容
              // 如果原有内容为空，则使用文件名作为内容
              const existingContent = targetNode.content || '';
              const newNodeData = {
                content: existingContent || file.name,  // 保留原有文字，如果为空则使用文件名
                content_type: 'attachment' as const,
                file_path: uploadResult.file_path,
                file_name: uploadResult.file_name,
              };

              await updateNode(id, newNodeData);
              setNodes(prev => prev.map(n => n.id === id ? { ...n, ...newNodeData } : n));
            } else {
              // 创建新的附件节点
              const newNode = await createNode(currentDoc.id, file.name, null, {
                content_type: 'attachment',
                file_path: uploadResult.file_path,
                file_name: uploadResult.file_name,
              });
              setNodes(prev => [...prev, newNode]);
            }
          } catch (error: unknown) {
            console.error('附件上传失败', error);
            const errorMessage = getErrorMessage(error, '未知错误');
            alert(`附件上传失败: ${errorMessage}`);
          }
        }
        return;
      }
    }
    
    // 如果粘贴了文件，不再处理文本
    if (hasFile) return;
    
    // 优先读取结构化剪贴板格式
    let parsedTree: ParsedNode[] | null = null;

    // 1. 先检查内存寄存器（同标签页内复制粘贴，最可靠）
    const registered = clipboardRegister.getSerializedRows();
    if (registered && registered.length > 0) {
      parsedTree = registered;
    }

    // 2. 尝试从系统剪贴板读取自定义 MIME 类型
    if (!parsedTree) {
      try {
        const types = Array.from(e.clipboardData.types);
        if (types?.includes?.('application/x-miniflowy-nodes') || Array.isArray(types) && types.includes('application/x-miniflowy-nodes')) {
          const raw = e.clipboardData.getData('application/x-miniflowy-nodes');
          if (raw) parsedTree = JSON.parse(raw);
        }
      } catch {
        parsedTree = null;
      }
    }

    // 3. 回退到纯文本 Markdown 解析（跨文件/跨标签页粘贴）
    if (!parsedTree) {
      const text = e.clipboardData.getData('text/plain');
      if (!text) return;

      // 只有当粘贴的内容包含换行符，或者明显是列表语法时，才进行拦截解析
      if (!text.includes('\n') && !text.match(/^[-*#]\s/)) {
        return;
      }

      parsedTree = parseMarkdown(text);
    }

    if (!parsedTree || parsedTree.length === 0) return;

    e.preventDefault();
    e.stopPropagation();

    const targetNode = nodes.find(n => n.id === id);
    if (!targetNode || !currentDoc) return;

    // 判断插入位置逻辑：
    // 如果当前节点已展开且包含子节点，则作为第一个子节点插入
    // 否则，作为同级兄弟节点插入到下方
    const hasChildren = nodes.some(n => n.parent_node_id === id);
    let newParentId = targetNode.parent_node_id;
    let startOrder = targetNode.sort_order;

    if (hasChildren && !targetNode.is_collapsed) {
       newParentId = targetNode.id;
       const children = nodes.filter(n => n.parent_node_id === id).sort((a, b) => a.sort_order - b.sort_order);
       startOrder = children.length > 0 ? children[0].sort_order - 10000 : createSortOrder();
    } else {
       const siblings = nodes.filter(n => n.parent_node_id === targetNode.parent_node_id).sort((a, b) => a.sort_order - b.sort_order);
       const targetIdx = siblings.findIndex(n => n.id === id);
       if (targetIdx !== -1 && targetIdx < siblings.length - 1) {
           startOrder = (siblings[targetIdx].sort_order + siblings[targetIdx + 1].sort_order) / 2;
       } else {
           startOrder = targetNode.sort_order + 10000;
       }
    }

    // 利用已有的 flattenParsedNodes 函数将树展平并生成新 UUID
    const newFlatNodes = flattenParsedNodes(parsedTree, currentDoc.id, newParentId, startOrder);
    const newNodeIds = newFlatNodes.map(n => n.id);

    // 乐观更新 UI：立即显示粘贴的节点
    setNodes(prev => [...prev, ...newFlatNodes as Node[]]);

    // 批量写入数据库（单次请求，避免并发风暴）
    try {
      const nodesData = newFlatNodes.map(nodeData => ({
        id: nodeData.id,
        document_id: nodeData.document_id!,
        content: nodeData.content || '',
        parent_node_id: nodeData.parent_node_id || null,
        sort_order: nodeData.sort_order,
        note: nodeData.note || '',
        is_completed: nodeData.is_completed || false,
        is_collapsed: nodeData.is_collapsed || false,
        is_todo: nodeData.is_todo || false,
      }));
      
      await createNodesBatch(nodesData);
      // 粘贴成功后清除内部剪贴板缓存，避免下次粘贴外部内容时误用旧数据
      clipboardRegister.clear();
    } catch (error) {
      console.error("批量粘贴保存失败", error);
      // 回滚：移除乐观添加的节点
      setNodes(prev => prev.filter(n => !newNodeIds.includes(n.id)));
      alert('粘贴保存失败，请重试');
    }
  };

  const lastEditRef = useRef<{ nodeId: string; timestamp: number; oldContent: string } | null>(null);

  const handleKeyDown = async (e: React.KeyboardEvent, currentNode: Node, type: 'content' | 'note') => { 
    // 拦截输入法组合状态
    if (e.nativeEvent.isComposing || e.keyCode === 229) { 
      return; 
    } 

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const currentIndex = sortedNodes.findIndex(n => n.id === currentNode.id);
      if (currentIndex !== -1) {
        const targetIndex = e.key === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex >= 0 && targetIndex < sortedNodes.length) {
            const targetNode = sortedNodes[targetIndex];
            setFocusedNodeId({ id: targetNode.id, field: 'content' });
        }
      }
      return;
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      const selection = window.getSelection();
      const isTextSelected = selection && !selection.isCollapsed;

      if (e.key === 'Backspace') {
        if (isTextSelected) return;

        const currentElement = e.currentTarget as HTMLElement;
        const currentText = (currentElement.textContent || '').replace(/\n/g, '').trim();
        
        // 1. 精准计算光标位置（防止富文本标签导致的 offset 计算错误）
        let cursorOffset = 0;
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const preCaretRange = range.cloneRange();
          preCaretRange.selectNodeContents(currentElement);
          preCaretRange.setEnd(range.startContainer, range.startOffset);
          cursorOffset = preCaretRange.toString().length;
        }
        const isAtStart = cursorOffset === 0;

        if (isAtStart) {
          if (type === 'content') {
            if (currentText === '' || (!currentNode.content && currentText.length <= 1)) {
              // 2. 绝对拦截！必须阻止浏览器原生的退格动作，不让它擅自把光标扔到上一行开头
              e.preventDefault();
              
              if (nodes.length <= 1) {
                e.stopPropagation();
                setFocusedNodeId(null);
                setFocusedNodeIdForToolbar(null);
                execute(commands.createDeleteNodeCommand(currentNode, []));
                return;
              }

              const descendants = getDescendants(currentNode.id, nodes);
              const descendantIds = descendants.map(d => d.id);

              if (descendants.length > 0) {
                e.stopPropagation();
                setConfirmDialog({
                  show: true, nodeId: currentNode.id, message: `此节点下有 ${descendants.length} 个子节点也将被删除，确定要删除吗？`, descendants
                });
                return;
              }

              const currentIndex = sortedNodes.findIndex(n => n.id === currentNode.id);
              let nextFocusId = null;

              if (currentIndex > 0) {
                nextFocusId = sortedNodes[currentIndex - 1].id;
              } else {
                const nextValidNode = sortedNodes.slice(currentIndex + 1).find(n => !descendantIds.includes(n.id));
                if (nextValidNode) {
                   nextFocusId = nextValidNode.id;
                }
              }

              // 使用幽灵锚点保持键盘打开
              focusToGhostAnchor();
              
              if (nextFocusId) {
                  setFocusedNodeId({ id: nextFocusId, field: 'content' });
              }

              execute(commands.createDeleteNodeCommand(currentNode, descendants));
            } else {
              // 如果在句首，但文字没删完，直接跳到上一个节点末尾
              const currentIndex = sortedNodes.findIndex(n => n.id === currentNode.id);
              if (currentIndex > 0) {
                e.preventDefault();
                const prevNodeId = sortedNodes[currentIndex - 1].id;
                setFocusedNodeId({ id: prevNodeId, field: 'content' });
              }
            }
          } else if (type === 'note') {
            if (currentText === '') {
              e.preventDefault();
              setFocusedNodeId({ id: currentNode.id, field: 'content' });
            }
          }
          return;
        }
      }
    }

    if (e.key === 'Enter' && e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();

      // Shift+Enter: Add/edit note for current node
      if (type === 'content') {
        // Check if cursor is at the end of content
        const selection = window.getSelection();
        const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        const endOffset = range ? range.endOffset : 0;
        const contentLength = currentNode.content.length;
        const isAtEnd = endOffset >= contentLength;
        
        // If cursor is at end or note already exists, show note
        const shouldShowNote = isAtEnd || (currentNode.note !== undefined && currentNode.note !== null);
        
        if (shouldShowNote) {
          // If note doesn't exist or is null/undefined, create empty note first
          if (!currentNode.note && currentNode.note !== '') {
            // Directly update nodes state to ensure note field is created
            setNodes(prev => prev.map(n =>
              n.id === currentNode.id ? { ...n, note: '' } : n
            ));
            // Also sync to backend
            handleNoteChange(currentNode.id, '');
          }
          // Focus on note field after a short delay to ensure state is updated
          setTimeout(() => {
            setFocusedNodeId({ id: currentNode.id, field: 'note' });
          }, 0);
        }
      } else {
        // Already in note, go back to content
        setFocusedNodeId({ id: currentNode.id, field: 'content' });
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      
      const selection = window.getSelection();
      const currentElement = e.currentTarget as HTMLElement;
      const fullText = currentElement.textContent || '';
      
      let cursorOffset = 0;
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(currentElement);
        preCaretRange.setEnd(range.startContainer, range.startOffset);
        cursorOffset = preCaretRange.toString().length;
      }
      
      // 移除强制失焦，避免移动端键盘闪烁
      // 改为使用更温和的方式处理光标位置
      
      const isAtStart = cursorOffset === 0;
      const isAtEnd = cursorOffset === fullText.length;
      const hasChildren = nodes.some(n => n.parent_node_id === currentNode.id);
      
      if (type === 'content' && !isAtStart && !isAtEnd) {
        const textBeforeCursor = fullText.slice(0, cursorOffset);
        const textAfterCursor = fullText.slice(cursorOffset);
        
        currentElement.textContent = textBeforeCursor;
        
        let newParentId = currentNode.parent_node_id;
        let newSortOrder = 0;
        
        if (hasChildren && !currentNode.is_collapsed) {
          newParentId = currentNode.id;
          const children = nodes.filter(n => n.parent_node_id === currentNode.id)
                                .sort((a, b) => a.sort_order - b.sort_order);
          const firstChild = children[0];
          newSortOrder = firstChild ? firstChild.sort_order - 1000 : createSortOrder();
        } else {
          const siblings = nodes.filter(n => n.parent_node_id === newParentId)
                                .sort((a, b) => a.sort_order - b.sort_order);
          const currentIndex = siblings.findIndex(n => n.id === currentNode.id);
          
          if (currentIndex !== -1 && currentIndex < siblings.length - 1) {
            const nextSibling = siblings[currentIndex + 1];
            newSortOrder = (currentNode.sort_order + nextSibling.sort_order) / 2;
          } else {
            newSortOrder = currentNode.sort_order + 1000;
          }
        }
        
        const updateCommand = commands.createUpdateContentCommand(currentNode.id, currentNode.content, textBeforeCursor);

        const createCommand = commands.createCreateNodeCommand({
          document_id: currentNode.document_id,
          content: textAfterCursor,
          parent_node_id: newParentId,
          sort_order: newSortOrder,
          is_todo: currentNode.is_todo
        });

        const compositeCommand = commands.createCompositeCommand([updateCommand, createCommand], 'Split Node');
        execute(compositeCommand);
        if (createCommand.nodeId) setFocusedNodeId({ id: createCommand.nodeId, field: 'content' });
        return;
      }
      
      if (type === 'content') {
        const currentDomContent = (e.currentTarget as HTMLElement).textContent || '';
        if (currentDomContent !== currentNode.content) {
          setNodes(prev => prev.map(n => 
            n.id === currentNode.id ? { ...n, content: currentDomContent } : n
          ));
          updateNode(currentNode.id, { content: currentDomContent });
        }
      }
      
      let newParentId = currentNode.parent_node_id;
      let newSortOrder = 0;

      if (type === 'content' && isAtStart && currentNode.content.length > 0) {
          newParentId = currentNode.parent_node_id;
          const siblings = nodes.filter(n => n.parent_node_id === newParentId)
                                .sort((a, b) => a.sort_order - b.sort_order);
          const currentIndex = siblings.findIndex(n => n.id === currentNode.id);
          
          if (currentIndex > 0) {
              newSortOrder = (siblings[currentIndex - 1].sort_order + currentNode.sort_order) / 2;
          } else {
              newSortOrder = currentNode.sort_order - 1000;
          }
      }
      else if (type === 'note') {
        newParentId = currentNode.parent_node_id;
        const siblings = nodes.filter(n => n.parent_node_id === newParentId)
                              .sort((a, b) => a.sort_order - b.sort_order);
        const currentIndex = siblings.findIndex(n => n.id === currentNode.id);
        
        if (currentIndex !== -1 && currentIndex < siblings.length - 1) {
            const nextSibling = siblings[currentIndex + 1];
            newSortOrder = (currentNode.sort_order + nextSibling.sort_order) / 2;
        } else {
            newSortOrder = currentNode.sort_order + 1000;
        }
      }
      else if (hasChildren && !currentNode.is_collapsed) {
          newParentId = currentNode.id;
          const children = nodes.filter(n => n.parent_node_id === currentNode.id)
                                .sort((a, b) => a.sort_order - b.sort_order);
          const firstChild = children[0];
          newSortOrder = firstChild ? firstChild.sort_order - 1000 : createSortOrder();
      } 
      else {
          newParentId = currentNode.parent_node_id;
          const siblings = nodes.filter(n => n.parent_node_id === newParentId)
                                .sort((a, b) => a.sort_order - b.sort_order);
          const currentIndex = siblings.findIndex(n => n.id === currentNode.id);
          
          if (currentIndex !== -1 && currentIndex < siblings.length - 1) {
              const nextSibling = siblings[currentIndex + 1];
              newSortOrder = (currentNode.sort_order + nextSibling.sort_order) / 2;
          } else {
              newSortOrder = currentNode.sort_order + 1000;
          }
      }

      const command = commands.createCreateNodeCommand({
        document_id: currentNode.document_id,
        content: '',
        parent_node_id: newParentId,
        sort_order: newSortOrder,
        is_todo: currentNode.is_todo
      });

      execute(command);
      if (command.nodeId) setFocusedNodeId({ id: command.nodeId, field: 'content' });
    }
    else if (e.key === 'Tab') {
      e.preventDefault();
      
      if (type === 'content') {
        const currentDomContent = (e.currentTarget as HTMLElement).textContent || '';
        if (currentDomContent !== currentNode.content) {
          setNodes(prev => prev.map(n => 
            n.id === currentNode.id ? { ...n, content: currentDomContent } : n
          ));
          updateNode(currentNode.id, { content: currentDomContent });
        }
      }
      
      if (e.shiftKey) {
        // Outdent
        if (currentNode.parent_node_id) {
           const parent = nodes.find(n => n.id === currentNode.parent_node_id);
           if (parent) {
             const grandParentId = parent.parent_node_id;
             const newOrder = parent.sort_order + 100;
             
             execute(commands.createBatchMoveCommand([{
                 id: currentNode.id, 
                 oldParent: currentNode.parent_node_id,
                 oldOrder: currentNode.sort_order,
                 newParent: grandParentId, 
                 newOrder
             }]));
             
             // 移动后保持焦点在当前节点，光标在文字末尾
             setTimeout(() => {
               setFocusedNodeId({ id: currentNode.id, field: 'content' });
             }, 50);
           }
        }
      } else {
        // Indent - 每次只缩进一个层级
        // 找到当前节点的同级前一个兄弟节点
        const siblings = nodes.filter(n => n.parent_node_id === currentNode.parent_node_id)
                              .sort((a, b) => a.sort_order - b.sort_order);
        const siblingIndex = siblings.findIndex(n => n.id === currentNode.id);
        
        if (siblingIndex > 0) {
          // 有前一个兄弟节点，可以缩进
          const prevSibling = siblings[siblingIndex - 1];
          const newParentId = prevSibling.id;
          
          // 直接更新节点状态，不通过命令系统（避免命令冲突）
          // 展开父节点只是为了确保子节点可见，不需要撤销
          if (prevSibling.is_collapsed) {
            setNodes(prev => prev.map(n => n.id === newParentId ? { ...n, is_collapsed: false } : n));
            updateNode(newParentId, { is_collapsed: false });
          }

          // 计算新的 sort_order（作为新父节点的最后一个子节点）
          const existingChildren = nodes.filter(n => n.parent_node_id === newParentId)
                                        .sort((a, b) => a.sort_order - b.sort_order);
          const lastChild = existingChildren.length > 0 ? existingChildren[existingChildren.length - 1] : null;
          const newSortOrder = lastChild ? lastChild.sort_order + 1000 : createSortOrder();

          execute(commands.createBatchMoveCommand([{
              id: currentNode.id,
              oldParent: currentNode.parent_node_id,
              oldOrder: currentNode.sort_order,
              newParent: newParentId,
              newOrder: newSortOrder
          }]));
          
          // 移动后保持焦点在当前节点，光标在文字末尾
          setTimeout(() => {
            setFocusedNodeId({ id: currentNode.id, field: 'content' });
          }, 50);
        }
      }
    }
  };

  const handleNoteChange = async (id: string, note: string | null) => {
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    if (node.note === note) return;
    execute(commands.createUpdateNoteCommand(id, node.note || '', note || ''));
  };

  const handleCollapseToggle = async (id: string, is_collapsed: boolean) => {
    execute(commands.createTogglePropertyCommand(id, 'is_collapsed', is_collapsed));
  };

  const handleStyleChange = useCallback((id: string, styles: Partial<Node>) => {
    setNodes(prev => {
      const node = prev.find(n => n.id === id);
      if (!node) return prev;
      return prev.map(n => n.id === id ? { ...n, ...styles } : n);
    });

    updateNode(id, styles).catch((error) => {
      console.error('Failed to update node styles', error);
    });
  }, []);

  const getSortedNodes = useCallback((allNodes: Node[]) => {
    // 预建索引：parentId → children (O(n) 构建，避免每次 filter 扫描全量)
    const childrenMap = new Map<string | null, Node[]>();
    for (const node of allNodes) {
      const key = node.parent_node_id || null;
      let arr = childrenMap.get(key);
      if (!arr) { arr = []; childrenMap.set(key, arr); }
      arr.push(node);
    }
    // 每组 children 排序一次
    for (const arr of childrenMap.values()) {
      arr.sort((a, b) => a.sort_order - b.sort_order);
    }
    const getChildren = (parentId: string | null) => childrenMap.get(parentId) || [];
    const nodeMap = new Map(allNodes.map(n => [n.id, n]));

    // 聚焦模式：只显示 zoomedNodeId 及其子孙节点
    if (zoomedNodeId) {
      const collectDescendants = (nodeId: string): Node[] => {
        const node = nodeMap.get(nodeId);
        if (!node) return [];
        const children = getChildren(nodeId);
        const sortedChildren = children.flatMap(child => collectDescendants(child.id));
        return [{ ...node, is_collapsed: false }, ...sortedChildren];
      };
      return collectDescendants(zoomedNodeId);
    }

    if (!searchQuery && !tagFilter) {
      const buildTree = (parentId: string | null): Node[] => {
        return getChildren(parentId).flatMap(node => [node, ...buildTree(node.id)]);
      };
      return buildTree(null);
    }

    // 标签过滤模式
    if (tagFilter) {
      const tagRegex = new RegExp(tagFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[^a-zA-Z0-9_\\u4e00-\\u9fa5]|$)');
      const matches = new Set<string>();
      for (const node of allNodes) {
        if (tagRegex.test(node.content) || (node.note && tagRegex.test(node.note))) {
          matches.add(node.id);
        }
      }
      const visibilityMap = new Map<string, { match: boolean; keep: boolean }>();
      const process = (node: Node): boolean => {
        const isMatch = matches.has(node.id);
        const children = getChildren(node.id);
        let subtreeHasMatch = false;
        for (const child of children) {
          if (process(child)) subtreeHasMatch = true;
        }
        const keep = isMatch || subtreeHasMatch;
        visibilityMap.set(node.id, { match: isMatch, keep });
        return keep;
      };
      for (const node of getChildren(null)) process(node);
      const buildFilteredTree = (parentId: string | null): Node[] => {
        return getChildren(parentId).flatMap(node => {
          const status = visibilityMap.get(node.id);
          if (!status || !status.keep) return [];
          return [{ ...node, is_collapsed: false }, ...buildFilteredTree(node.id)];
        });
      };
      return buildFilteredTree(null);
    }

    const query = searchQuery.toLowerCase();
    const matches = new Set<string>();
    const docTitleMatch = currentDoc?.title.toLowerCase().includes(query);

    for (const node of allNodes) {
      if (node.content.toLowerCase().includes(query) || (node.note && node.note.toLowerCase().includes(query))) {
        matches.add(node.id);
      }
    }
    if (docTitleMatch) {
      for (const node of allNodes) matches.add(node.id);
    }

    const visibilityMap = new Map<string, { match: boolean; keep: boolean }>();

    const process = (node: Node): boolean => {
      const isMatch = matches.has(node.id);
      const children = getChildren(node.id);
      let subtreeHasMatch = false;
      for (const child of children) {
        if (process(child)) subtreeHasMatch = true;
      }
      const keep = isMatch || subtreeHasMatch;
      visibilityMap.set(node.id, { match: isMatch, keep });
      return keep;
    };

    for (const node of getChildren(null)) process(node);

    const buildFilteredTree = (parentId: string | null): Node[] => {
      return getChildren(parentId).flatMap(node => {
        const status = visibilityMap.get(node.id);
        if (!status || !status.keep) return [];
        return [{ ...node, is_collapsed: false }, ...buildFilteredTree(node.id)];
      });
    };

    return buildFilteredTree(null);
  }, [currentDoc?.title, searchQuery, tagFilter, zoomedNodeId]);

  // 小黑点按住 → 只记录起点，不选节点（避免干扰容器的框选逻辑）
  const executeMultiNodeMove = useCallback((targetNodeId: string, position: 'before' | 'after' | 'child', movingIds = selectedNodeIds) => {
    const selectedSet = new Set(movingIds);
    // 筛选顶层选中节点（父节点未被选中的）
    const topLevelSelected = getSortedNodes(nodes)
      .filter(n => selectedSet.has(n.id) && (!n.parent_node_id || !selectedSet.has(n.parent_node_id)));

    if (topLevelSelected.length === 0) return;

    // 防止移动到自身或子孙节点下
    for (const sel of topLevelSelected) {
      if (sel.id === targetNodeId || isDescendantOf(sel.id, targetNodeId, nodes)) {
        return;
      }
    }

    const targetNode = nodes.find(n => n.id === targetNodeId);
    if (!targetNode) return;

    const moveUpdates: { id: string; oldParent: string | null; oldOrder: number; newParent: string | null; newOrder: number }[] = [];

    if (position === 'child') {
      // 变成目标节点的子节点，追加到末尾
      const existingChildren = nodes.filter(n => n.parent_node_id === targetNodeId);
      const baseOrder = existingChildren.length > 0
        ? Math.max(...existingChildren.map(n => n.sort_order))
        : 0;
      topLevelSelected.forEach((node, i) => {
        moveUpdates.push({
          id: node.id,
          oldParent: node.parent_node_id,
          oldOrder: node.sort_order,
          newParent: targetNodeId,
          newOrder: baseOrder + (i + 1) * 1000,
        });
      });
    } else {
      // 插入到目标节点之前/之后，与目标同级
      const newParent = targetNode.parent_node_id;
      if (position === 'before') {
        // 在目标之前，逆序插入使第一个选中节点紧贴目标前面
        topLevelSelected.forEach((node, i) => {
          moveUpdates.push({
            id: node.id,
            oldParent: node.parent_node_id,
            oldOrder: node.sort_order,
            newParent,
            newOrder: targetNode.sort_order - (topLevelSelected.length - i) * 1000,
          });
        });
      } else {
        // 在目标之后
        topLevelSelected.forEach((node, i) => {
          moveUpdates.push({
            id: node.id,
            oldParent: node.parent_node_id,
            oldOrder: node.sort_order,
            newParent,
            newOrder: targetNode.sort_order + (i + 1) * 1000,
          });
        });
      }
    }

    execute(commands.createBatchMoveCommand(moveUpdates));
    updateSelectedNodeIds([]);
    dropTargetRef.current = null;
    setDropTarget(null);
  }, [commands, execute, getSortedNodes, nodes, selectedNodeIds, updateSelectedNodeIds]);

  const updateDropTarget = useCallback((next: { nodeId: string; position: 'before' | 'after' | 'child' } | null) => {
    dropTargetRef.current = next;
    setDropTarget(prev => {
      if (prev?.nodeId === next?.nodeId && prev?.position === next?.position) return prev;
      return next;
    });
  }, []);

  const finishDragMove = useCallback(() => {
    if (!dragMoveRef.current.isMoving) return;
    const currentDropTarget = dropTargetRef.current;
    const movingIds = dragMoveRef.current.selectedIds;
    if (currentDropTarget && movingIds.length > 0) {
      executeMultiNodeMove(currentDropTarget.nodeId, currentDropTarget.position, movingIds);
    }
    dragMoveRef.current = { isMoving: false, startNodeId: null, selectedIds: [] };
    setIsDragMoving(false);
    updateDropTarget(null);
  }, [executeMultiNodeMove, updateDropTarget]);

  useEffect(() => {
    if (!isDragMoving) return;
    const handleWindowMouseUp = () => finishDragMove();
    const handleWindowBlur = () => finishDragMove();
    window.addEventListener('mouseup', handleWindowMouseUp);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [finishDragMove, isDragMoving]);

  const generateMarkdownPreview = (allNodes: Node[]): string => {
    const rootNodes = allNodes.filter(n => !n.parent_node_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    
    const serialize = (node: Node, depth: number): string => {
      const indent = '  '.repeat(depth);
      const bullet = '- ';
      const check = node.is_completed ? '[x] ' : '';
      let line = `${indent}${bullet}${check}${node.content}`;
      
      if (node.note) {
        const noteIndent = '  '.repeat(depth + 1);
        const noteLines = node.note.split('\n').map(l => `${noteIndent}> ${l}`).join('\n');
        line += `\n${noteLines}`;
      }
      
      const children = allNodes.filter(n => n.parent_node_id === node.id)
        .sort((a, b) => a.sort_order - b.sort_order);
      const childrenLines = children.map(c => serialize(c, depth + 1)).join('\n');
      
      return childrenLines ? `${line}\n${childrenLines}` : line;
    };
    
    return rootNodes.map(r => serialize(r, 0)).join('\n');
  };

  // 大纲节点树只在节点、过滤条件或聚焦范围变化时重算，避免工具栏/保存状态变化时重复构建整棵树。
  // React Compiler 当前无法保留这两个手动 memo，但它们依赖的是稳定的节点计算输入。
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const sortedNodes = useMemo(() => getSortedNodes(nodes), [getSortedNodes, nodes]);
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const treeNodes = useMemo(() => buildTree(sortedNodes), [sortedNodes]);

  // 幽灵锚点：用于保持移动端键盘打开
  const focusToGhostAnchor = useCallback(() => {
    if (ghostAnchorRef.current) {
      ghostAnchorRef.current.focus();
    }
  }, []);

  // Mobile toolbar handlers - useCallback with refs to avoid re-creating on every render
  const handleMobileMoveUp = async () => {
    const nodeId = focusedNodeIdForToolbarRef.current;
    if (!nodeId) return;
    const allNodes = nodesRef.current;
    const currentNode = allNodes.find(n => n.id === nodeId);
    if (!currentNode) return;
    const siblings = allNodes.filter(n => n.parent_node_id === currentNode.parent_node_id)
                          .sort((a, b) => a.sort_order - b.sort_order);
    const siblingIndex = siblings.findIndex(n => n.id === nodeId);
    if (siblingIndex > 0) {
      const prevSibling = siblings[siblingIndex - 1];
      focusToGhostAnchor();
      execute(commands.createBatchMoveCommand([{
        id: currentNode.id, oldParent: currentNode.parent_node_id, oldOrder: currentNode.sort_order,
        newParent: currentNode.parent_node_id, newOrder: prevSibling.sort_order - 100
      }]));
      setTimeout(() => focusNode(nodeId), 100);
    }
  };

  const handleMobileMoveDown = async () => {
    const nodeId = focusedNodeIdForToolbarRef.current;
    if (!nodeId) return;
    const allNodes = nodesRef.current;
    const currentNode = allNodes.find(n => n.id === nodeId);
    if (!currentNode) return;
    const siblings = allNodes.filter(n => n.parent_node_id === currentNode.parent_node_id)
                          .sort((a, b) => a.sort_order - b.sort_order);
    const siblingIndex = siblings.findIndex(n => n.id === nodeId);
    if (siblingIndex < siblings.length - 1) {
      const nextSibling = siblings[siblingIndex + 1];
      focusToGhostAnchor();
      execute(commands.createBatchMoveCommand([{
        id: currentNode.id, oldParent: currentNode.parent_node_id, oldOrder: currentNode.sort_order,
        newParent: currentNode.parent_node_id, newOrder: nextSibling.sort_order + 100
      }]));
      setTimeout(() => focusNode(nodeId), 100);
    }
  };

  const handleMobileToggleComplete = () => {
    const nodeId = focusedNodeIdForToolbarRef.current;
    if (!nodeId) return;
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (node) handleStyleChange(nodeId, { is_todo: !node.is_todo });
  };

  const handleMobileAddNote = () => {
    const nodeId = focusedNodeIdForToolbarRef.current;
    if (nodeId) setFocusedNodeId({ id: nodeId, field: 'note' });
  };

  const handleMobileDelete = async () => {
    const nodeId = focusedNodeIdForToolbarRef.current;
    if (!nodeId) return;
    const allNodes = nodesRef.current;
    const node = allNodes.find(n => n.id === nodeId);
    if (!node) return;
    const descendants = getDescendants(nodeId, allNodes);
    const msg = descendants.length > 0
      ? `确定删除此节点及其 ${descendants.length} 个子节点？`
      : '确定删除此节点？';
    if (!window.confirm(msg)) return;
    const sorted = getSortedNodes(allNodes);
    const currentIndex = sorted.findIndex(n => n.id === nodeId);
    let nextFocusId: string | null = null;
    if (currentIndex > 0) {
      nextFocusId = sorted[currentIndex - 1].id;
    } else {
      const descendantIds = descendants.map(d => d.id);
      const nextValidNode = sorted.slice(currentIndex + 1).find(n => !descendantIds.includes(n.id));
      if (nextValidNode) nextFocusId = nextValidNode.id;
    }
    focusToGhostAnchor();
    execute(commands.createDeleteNodeCommand(node, descendants));
    if (nextFocusId) {
      setFocusedNodeIdForToolbar(nextFocusId);
      setTimeout(() => focusNode(nextFocusId!), 100);
    } else {
      setFocusedNodeIdForToolbar(null);
    }
  };

  const handleMobileIndent = async () => {
    const nodeId = focusedNodeIdForToolbarRef.current;
    if (!nodeId) return;
    const allNodes = nodesRef.current;
    const currentNode = allNodes.find(n => n.id === nodeId);
    if (!currentNode) return;
    const siblings = allNodes.filter(n => n.parent_node_id === currentNode.parent_node_id)
                          .sort((a, b) => a.sort_order - b.sort_order);
    const siblingIndex = siblings.findIndex(n => n.id === nodeId);
    if (siblingIndex > 0) {
      const prevSibling = siblings[siblingIndex - 1];
      const children = allNodes.filter(n => n.parent_node_id === prevSibling.id)
                           .sort((a, b) => a.sort_order - b.sort_order);
      const lastChild = children[children.length - 1];
      const newSortOrder = lastChild ? lastChild.sort_order + 1000 : createSortOrder();
      focusToGhostAnchor();
      execute(commands.createBatchMoveCommand([{
        id: currentNode.id, oldParent: currentNode.parent_node_id, oldOrder: currentNode.sort_order,
        newParent: prevSibling.id, newOrder: newSortOrder
      }]));
      setTimeout(() => focusNode(nodeId), 100);
    }
  };

  const handleMobileOutdent = async () => {
    const nodeId = focusedNodeIdForToolbarRef.current;
    if (!nodeId) return;
    const allNodes = nodesRef.current;
    const node = allNodes.find(n => n.id === nodeId);
    if (!node || !node.parent_node_id) return;
    const parentNode = allNodes.find(n => n.id === node.parent_node_id);
    if (!parentNode) return;
    const siblings = allNodes.filter(n => n.parent_node_id === parentNode.id)
                         .sort((a, b) => a.sort_order - b.sort_order);
    const siblingIndex = siblings.findIndex(n => n.id === node.id);
    let newSortOrder: number;
    if (siblingIndex < siblings.length - 1) {
      const nextSibling = siblings[siblingIndex + 1];
      newSortOrder = (parentNode.sort_order + nextSibling.sort_order) / 2;
    } else {
      newSortOrder = parentNode.sort_order + 1000;
    }
    focusToGhostAnchor();
    execute(commands.createBatchMoveCommand([{
      id: node.id, oldParent: node.parent_node_id, oldOrder: node.sort_order,
      newParent: parentNode.parent_node_id, newOrder: newSortOrder
    }]));
    setTimeout(() => focusNode(nodeId), 100);
  };

  const handleMobileZoom = () => {
    const nodeId = focusedNodeIdForToolbarRef.current;
    if (nodeId) setZoomedNodeId(nodeId);
  };

  const handleMobileUndo = async () => {
    focusToGhostAnchor();
    await undo();
  };

  // 用 effect 同步实现，向 Context 暴露的包装函数保持稳定，避免发布状态造成渲染循环。
  const mobileActionsRef = useRef({
    indent: handleMobileIndent,
    outdent: handleMobileOutdent,
    toggleTodo: handleMobileToggleComplete,
    addNote: handleMobileAddNote,
    moveUp: handleMobileMoveUp,
    moveDown: handleMobileMoveDown,
    zoom: handleMobileZoom,
    undo: handleMobileUndo,
    deleteNode: handleMobileDelete,
  });
  useEffect(() => {
    mobileActionsRef.current = {
      indent: handleMobileIndent,
      outdent: handleMobileOutdent,
      toggleTodo: handleMobileToggleComplete,
      addNote: handleMobileAddNote,
      moveUp: handleMobileMoveUp,
      moveDown: handleMobileMoveDown,
      zoom: handleMobileZoom,
      undo: handleMobileUndo,
      deleteNode: handleMobileDelete,
    };
  });
  const toolbarHandlers = useMemo(() => ({
    onIndent: () => mobileActionsRef.current.indent(),
    onOutdent: () => mobileActionsRef.current.outdent(),
    onToggleTodo: () => mobileActionsRef.current.toggleTodo(),
    onAddNote: () => mobileActionsRef.current.addNote(),
    onMoveUp: () => mobileActionsRef.current.moveUp(),
    onMoveDown: () => mobileActionsRef.current.moveDown(),
    onZoom: () => mobileActionsRef.current.zoom(),
    onUndo: () => mobileActionsRef.current.undo(),
    onDelete: () => mobileActionsRef.current.deleteNode(),
  }), []);

  useEffect(() => {
    if (!isMobile) return;
    publishToolbar(!!focusedNodeIdForToolbar, toolbarHandlers);
  }, [isMobile, focusedNodeIdForToolbar, publishToolbar, toolbarHandlers]);

  // 当窗口失焦或非应用复制时，清除内部剪贴板缓存
  // 避免从外部复制文字后粘贴仍使用旧的内部节点数据
  useEffect(() => {
    const handleCopy = () => {
      // 如果不是应用内部触发的复制，清除缓存
      if (!clipboardRegister.isInternalCopy) {
        clipboardRegister.clear();
      }
      // 重置标记，下次复制事件如果不是从应用触发的就会清除
      clipboardRegister.isInternalCopy = false;
    };

    const handleWindowBlur = () => {
      // 窗口失焦时清除缓存（用户可能在其他窗口复制了内容）
      clipboardRegister.clear();
    };

    document.addEventListener('copy', handleCopy);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('copy', handleCopy);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  // Keyboard Shortcuts for Undo/Redo
  useEffect(() => {
    const handleGlobalKey = async (e: KeyboardEvent) => {
      // 画布区域（Excalidraw）内的快捷键不拦截，让 Excalidraw 自行处理
      const eventTarget = e.target as HTMLElement;
      if (eventTarget.closest('.excalidraw-editor-wrapper')) {
        return;
      }

      const nodes = nodesRef.current;
      const selectedNodeIds = selectedNodeIdsRef.current;
      // Compute sorted nodes locally (avoid stale closure)
      const buildTree = (parentId: string | null): Node[] =>
        nodes.filter(n => n.parent_node_id === parentId)
          .sort((a, b) => a.sort_order - b.sort_order)
          .flatMap(n => [n, ...buildTree(n.id)]);
      const sortedNodes = buildTree(null);
      // --- 【新增】：多选状态下的快捷键最高优先级接管 ---
      if (selectedNodeIds.length > 0) {
        // 1. 批量删除
        if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          e.stopPropagation();
          const nodesToDelete = nodes.filter(n => selectedNodeIds.includes(n.id));
          let allDescendants: Node[] = [];
          nodesToDelete.forEach(n => {
              allDescendants = [...allDescendants, ...getDescendants(n.id, nodes)];
          });
          const uniqueDescendants = allDescendants.filter(d => !selectedNodeIds.includes(d.id));
          execute(commands.createBatchDeleteCommand(nodesToDelete, uniqueDescendants));
          updateSelectedNodeIds([]);
          return;
        }

        // 2. 批量复制 / 剪切
        if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x')) {
          e.preventDefault();
          e.stopPropagation();
          
          // 写入纯文本 Markdown 到系统剪贴板
          const markdown = nodesToMarkdown(nodes, selectedNodeIds);

          // 存入结构化数据到内存寄存器
          const serializedData = serializeNodesToTree(nodes, selectedNodeIds);
          clipboardRegister.saveSerializedRows(serializedData);

          // 尝试写入自定义 MIME 类型 + text/plain
          const customBlob = new Blob([JSON.stringify(serializedData)], { type: 'application/x-miniflowy-nodes' });
          const plainBlob = new Blob([markdown], { type: 'text/plain' });
          try {
            navigator.clipboard.write([
              new ClipboardItem({
                'text/plain': plainBlob,
                'application/x-miniflowy-nodes': customBlob
              })
            ]);
          } catch {
            navigator.clipboard.writeText(markdown);
          }

          // 如果是剪切，执行删除
          if (e.key.toLowerCase() === 'x') {
            const nodesToDelete = nodes.filter(n => selectedNodeIds.includes(n.id));
            let allDescendants: Node[] = [];
            nodesToDelete.forEach(n => {
                allDescendants = [...allDescendants, ...getDescendants(n.id, nodes)];
            });
            const uniqueDescendants = allDescendants.filter(d => !selectedNodeIds.includes(d.id));
            execute(commands.createBatchDeleteCommand(nodesToDelete, uniqueDescendants));
          }
          
          updateSelectedNodeIds([]);
          return;
        }

        // 3. Tab / Shift+Tab 批量缩进/取消缩进
        if (e.key === 'Tab') {
          e.preventDefault();
          e.stopPropagation();

          const selectedNodes = nodes.filter(n => selectedNodeIds.includes(n.id));
          
          // 顶级节点过滤法。
          // 如果一个节点的父节点也在选中列表里，说明它是"跟随者"，不需要独立计算移动。
          const topLevelSelected = selectedNodes
            .filter(n => !selectedNodeIds.includes(n.parent_node_id!))
            .sort((a, b) => {
               const idxA = sortedNodes.findIndex(n => n.id === a.id);
               const idxB = sortedNodes.findIndex(n => n.id === b.id);
               return idxA - idxB;
            });
          
          const moveUpdates: { id: string, oldParent: string | null, oldOrder: number, newParent: string | null, newOrder: number }[] = [];
          
          if (e.shiftKey) {
            // Shift+Tab: 批量取消缩进
            for (const node of topLevelSelected) {
              if (node.parent_node_id) {
                const parent = nodes.find(n => n.id === node.parent_node_id);
                if (parent) {
                  const grandParentId = parent.parent_node_id;
                  
                  const grandParentChildren = nodes.filter(n => n.parent_node_id === grandParentId)
                                                   .sort((a, b) => a.sort_order - b.sort_order);
                  const parentIndex = grandParentChildren.findIndex(n => n.id === parent.id);
                  
                  let newOrder: number;
                  if (parentIndex === grandParentChildren.length - 1) {
                    newOrder = parent.sort_order + 10000 + (moveUpdates.length * 100);
                  } else {
                    const nextSibling = grandParentChildren[parentIndex + 1];
                    newOrder = parent.sort_order + ((nextSibling.sort_order - parent.sort_order) / 2) + (moveUpdates.length * 10);
                  }
                  
                  moveUpdates.push({
                    id: node.id,
                    oldParent: node.parent_node_id,
                    oldOrder: node.sort_order,
                    newParent: grandParentId,
                    newOrder
                  });
                }
              }
            }
          } else {
            // Tab: 批量缩进
            // 使用 Map 记录每个新父节点的下一个排序值，防止多个同级节点挤在同一个位置
            const parentNextOrderMap = new Map<string, number>();

            for (const node of topLevelSelected) {
              const siblings = nodes.filter(n => n.parent_node_id === node.parent_node_id)
                                    .sort((a, b) => a.sort_order - b.sort_order);
              const siblingIndex = siblings.findIndex(n => n.id === node.id);
              
              // 寻找上方最近的【未被选中】的兄弟节点作为新父节点
              // 解决连续选中多个同级节点缩进时的结构错乱问题
              let prevUnselectedSibling = null;
              for (let i = siblingIndex - 1; i >= 0; i--) {
                if (!selectedNodeIds.includes(siblings[i].id)) {
                  prevUnselectedSibling = siblings[i];
                  break;
                }
              }
              
              if (prevUnselectedSibling) {
                const newParentId = prevUnselectedSibling.id;
                
                if (prevUnselectedSibling.is_collapsed) {
                  setNodes(prev => prev.map(n => n.id === newParentId ? { ...n, is_collapsed: false } : n));
                  updateNode(newParentId, { is_collapsed: false });
                }

                let newSortOrder: number;
                if (parentNextOrderMap.has(newParentId)) {
                    newSortOrder = parentNextOrderMap.get(newParentId)! + 1000;
                } else {
                    const existingChildren = nodes.filter(n => n.parent_node_id === newParentId)
                                                  .sort((a, b) => a.sort_order - b.sort_order);
                    const lastChild = existingChildren.length > 0 ? existingChildren[existingChildren.length - 1] : null;
                    newSortOrder = lastChild ? lastChild.sort_order + 1000 : createSortOrder();
                }
                
                parentNextOrderMap.set(newParentId, newSortOrder);

                moveUpdates.push({
                  id: node.id,
                  oldParent: node.parent_node_id,
                  oldOrder: node.sort_order,
                  newParent: newParentId,
                  newOrder: newSortOrder
                });
              }
            }
          }
          
          if (moveUpdates.length > 0) {
            execute(commands.createBatchMoveCommand(moveUpdates));
          }
          return;
        }

        // 4. Escape 清除选择
        if (e.key === 'Escape') {
          updateSelectedNodeIds([]);
          return;
        }
      }

      // --- 下面保留原有的 Undo/Redo 逻辑 --- 
      
      // Undo/Redo (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z)
      // 表单和 CodeMirror 使用各自的原生历史；大纲 contentEditable 节点仍使用命令历史。
      const target = e.target as HTMLElement;
      const isTextField = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';
      const isCodeMirror = target.closest('.cm-editor') !== null;
      const usesEditorHistory = isTextField || isCodeMirror;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (usesEditorHistory) return;
        e.preventDefault();
        e.stopPropagation();

        if (e.shiftKey) {
          await redo();
        } else {
          await undo();
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        if (usesEditorHistory) return;
        e.preventDefault();
        e.stopPropagation();
        await redo();
        return;
      }
    };
    
    // Use capture phase to intercept shortcuts before they reach editing elements
    window.addEventListener('keydown', handleGlobalKey, { capture: true });
    return () => window.removeEventListener('keydown', handleGlobalKey, { capture: true });
  }, [undo, redo, commands, execute, updateSelectedNodeIds]);

  const getSelectedNodes = useCallback(() => {
    const selectedSet = new Set(selectedNodeIds);
    return nodes.filter(node => selectedSet.has(node.id));
  }, [nodes, selectedNodeIds]);

  const selectionAllMatch = useCallback(<K extends keyof Node>(key: K, value: Node[K]) => {
    const selectedNodes = getSelectedNodes();
    return selectedNodes.length > 0 && selectedNodes.every(node => node[key] === value);
  }, [getSelectedNodes]);

  const applyBatchStyleToggle = useCallback(<K extends keyof Node>(key: K, activeValue: Node[K], inactiveValue: Node[K]) => {
    const nextValue = selectionAllMatch(key, activeValue) ? inactiveValue : activeValue;
    selectedNodeIds.forEach(id => handleStyleChange(id, { [key]: nextValue } as Partial<Node>));
    setBatchEditPosition(null);
  }, [handleStyleChange, selectedNodeIds, selectionAllMatch]);

  // Project view rendering (also handles archived projects view when no project selected)
  if (selectedProjectId || showArchivedProjects) {
    return (
      <div className="flex-1 min-w-0 h-full">
        <ProjectView
          projectId={selectedProjectId}
          showArchived={showArchivedProjects}
          archivedReloadKey={archivedProjectsReloadKey}
          onToggleArchived={setShowArchivedProjects}
          onDeselectProject={() => setSelectedProjectId(null)}
        />
      </div>
    );
  }

  // User sub-view rendering
  if (userSubView) {
    return (
      <div
        className="flex-1 h-full min-h-0 flex flex-col overflow-hidden bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
        style={document.documentElement.dataset.mobileLayout ? { paddingTop: 'calc(env(safe-area-inset-top, 0px) + 44px)', paddingBottom: '52px' } : undefined}
      >
        {userSubView === 'profile' && <UserProfileEditor />}
        {userSubView === 'appearance' && <AppearanceSettingsPage />}
        {userSubView === 'token' && <TokenPanel />}
        {userSubView === 'ai' && <AISettingsPanel />}
        {userSubView === 'trash' && <TrashPanel />}
        {userSubView === 'password' && <PasswordPanel />}
        {userSubView === 'ai-chat' && (
          <AIChatMainView
            conversationId={activeConvId}
            onConversationCreated={(convId) => { setActiveConvId(convId); refreshConvList(); }}
            onNavigate={(type, id) => {
              if (type === 'memo') {
                navigate(`/?highlight=${id}`);
              } else {
                navigate(`/d/${id}`);
              }
            }}
          />
        )}
      </div>
    );
  }

  if (!documentId) {
    const emptyWorkspaceView = searchParams.get('view');
    if (emptyWorkspaceView === 'files' || emptyWorkspaceView === 'recent' || emptyWorkspaceView === 'starred' || emptyWorkspaceView === 'projects') {
      return <EmptyDocumentWorkspace view={emptyWorkspaceView} />;
    }
    return <MemoHome sidebarOpen={sidebarOpen} isMobile={isMobile} />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans h-full">
      {/* 日记/日历复用文档内容区，但不属于文档 Tab 工作区。已有笔记 Tab 保留在状态中，返回文件时再恢复。 */}
      {documentTabs.length > 0 && !isDiaryDoc && !isMobile && (
        <div className="flex h-11 shrink-0 items-center border-b border-gray-200 bg-white px-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="min-w-0 w-[68%]">
            <DocumentTabs
              tabs={documentTabs}
              activeKey={activeDocumentTabKey}
              onSelect={handleDocumentTabSelect}
              onClose={handleDocumentTabClose}
            />
          </div>
          <div id="editor-action-slot" className="relative ml-auto flex min-w-0 items-center justify-end gap-2" />
        </div>
      )}
      {currentDoc?.type !== 'note'
        && currentDoc?.type !== 'excalidraw'
        && !isDiaryDoc
        && viewMode === 'outline'
        && !isLoading
        && (
          <div className="hidden" style={{ paddingTop: isMobile ? 'env(safe-area-inset-top)' : undefined }}>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {/* 移动端菜单按钮 */}
              {isMobile && (
                <button
                  onClick={() => {
                    const event = new CustomEvent('toggleSidebar');
                    window.dispatchEvent(event);
                  }}
                  className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 transition-colors"
                  title="打开菜单"
                >
                  <Menu size={16} />
                </button>
              )}
              {/* 聚焦层级面包屑：仅在聚焦节点时显示，避免与 Tab 重复占用空间 */}
              <div className={`${zoomedNodeId ? 'flex' : 'hidden'} min-w-0 max-w-[38%] items-center gap-1 overflow-x-auto whitespace-nowrap scrollbar-none`}>
                {focusBreadcrumbs.map((breadcrumb, index) => (
                  <Fragment key={breadcrumb.id}>
                    {index > 0 && <span className="editor-topbar-action shrink-0 text-sm text-gray-400 dark:text-gray-500">/</span>}
                    <button
                      type="button"
                      onClick={() => setZoomedNodeId(breadcrumb.nodeId)}
                      className={`editor-topbar-action max-w-[min(42vw,18rem)] shrink-0 truncate text-left text-sm transition-colors ${
                        index === focusBreadcrumbs.length - 1
                          ? 'font-medium text-gray-700 dark:text-gray-200'
                          : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                      }`}
                      title={breadcrumb.label}
                      aria-current={index === focusBreadcrumbs.length - 1 ? 'page' : undefined}
                    >
                      {breadcrumb.label}
                    </button>
                  </Fragment>
                ))}
              </div>

              {searchQuery && documentId && (
                <div className="editor-topbar-action ml-4 flex items-center bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-full text-sm animate-in fade-in">
                  <span className="text-blue-600 dark:text-blue-400 mr-2">正在过滤: {searchQuery}</span>
                  <button onClick={() => setSearchQuery('')} className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-300">✕</button>
                </div>
              )}
            </div>
            <EditorActionPortal>
            <div className="flex items-center gap-2">
              {/* 大纲过滤：独立于全局搜索 */}
              <div className="flex items-center gap-1.5">
                {showOutlineFilter && (
                  <input
                    autoFocus
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setShowOutlineFilter(false);
                        setSearchQuery('');
                      }
                    }}
                    placeholder="过滤当前大纲..."
                    className="editor-topbar-action w-40 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm outline-none placeholder:text-gray-400 focus:border-blue-400 dark:border-gray-700 dark:bg-gray-800"
                  />
                )}
                <button
                  onClick={() => {
                    if (showOutlineFilter) setSearchQuery('');
                    setShowOutlineFilter(v => !v);
                  }}
                  className={`editor-topbar-button editor-topbar-icon-button ${searchQuery ? 'is-active' : ''}`}
                  title={searchQuery ? `正在过滤: ${searchQuery}` : '过滤当前大纲'}
                >
                  <Search className="w-5 h-5" />
                </button>
              </div>
              <button
                onClick={() => setViewMode('mindmap')}
                className="editor-topbar-button editor-topbar-icon-button"
                title="思维导图"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 48 48">
                  <path d="M0 0h48v48H0z" fill="none" stroke="none" />
                  <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={4}>
                    <path d="M26 24L42 24" />
                    <path d="M26 38H42" />
                    <path d="M26 10H42" />
                    <path d="M18 24L6 24C6 24 7.65685 24 10 24M18 38C12 36 16 24 10 24M18 10C12 12 16 24 10 24" />
                  </g>
                </svg>
              </button>
              <button
                onClick={() => {
                  const hasCollapsed = nodes.some(n => n.is_collapsed);
                  if (hasCollapsed) {
                    const collapsedNodeIds = nodes.filter(n => n.is_collapsed).map(n => n.id);
                    execute(commands.createBatchTogglePropertyCommand(collapsedNodeIds, 'is_collapsed', false));
                  } else {
                    const nodesWithChildren = nodes.filter(n => nodes.some(child => child.parent_node_id === n.id));
                    const expandedNodeIds = nodesWithChildren.map(n => n.id);
                    execute(commands.createBatchTogglePropertyCommand(expandedNodeIds, 'is_collapsed', true));
                  }
                }}
                className="editor-topbar-button editor-topbar-icon-button"
                title={nodes.some(n => n.is_collapsed) ? "展开全部" : "折叠全部"}
              >
                {nodes.some(n => n.is_collapsed) ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13l-7 7-7-7m14-8l-7 7-7-7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 11l7-7 7 7M5 19l7-7 7 7" />
                  </svg>
                )}
              </button>
              <DocumentSettingsMenu
                nodes={nodes}
                currentDoc={currentDoc}
                generateMarkdownPreview={generateMarkdownPreview}
              />
              <SaveStatusIndicator status={saveStatus} pendingCount={pendingCount} offlineQueueCount={offlineQueueCount} />
            </div>
            </EditorActionPortal>
          </div>
        )}

      {isLoading ? (
        <div className="flex-1 min-h-0">
          <LoadingSkeleton />
        </div>
      ) : (
        <>
      {!isOnline && (
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-6 py-2">
          <div className="flex items-center justify-center gap-2 text-sm text-red-800 dark:text-red-200">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
            </svg>
            <span>
              当前处于离线模式
              {offlineQueueCount > 0 && `，${offlineQueueCount} 个操作将在恢复连接后自动同步`}
            </span>
          </div>
        </div>
      )}

      {/* Note View - Markdown note editor */}
      {currentDoc?.type === 'note' && (
        <div className="main-content-area flex-1 overflow-hidden custom-scrollbar">
          <MarkdownNoteEditor
            documentId={documentId!}
            isNew={currentDoc.title === '新笔记'}
            initialNodes={nodes}
            initialDocuments={documents}
            documentTabs={documentTabs}
            activeDocumentTabKey={activeDocumentTabKey}
            showDocumentTabs={false}
            onDocumentTabSelect={handleDocumentTabSelect}
            onDocumentTabClose={handleDocumentTabClose}
            onDirtyChange={handleCurrentOutlineDirty}
          />
        </div>
      )}

      {/* Excalidraw View - Canvas editor */}
      {currentDoc?.type === 'excalidraw' && (
        <div className="main-content-area flex-1" style={{ minHeight: 0, position: 'relative' }}>
          <ExcalidrawEditor
            documentId={documentId!}
            title={currentDoc.title}
            readOnly={isMobile}
            mobileViewOnly={isMobile}
            documentTabs={documentTabs}
            activeDocumentTabKey={activeDocumentTabKey}
            showDocumentTabs={false}
            isActive
            onDocumentTabSelect={handleDocumentTabSelect}
            onDocumentTabClose={handleDocumentTabClose}
          />
        </div>
      )}

      {/* Outline View - Only show in outline mode */}
      {viewMode === 'outline' && currentDoc?.type !== 'note' && currentDoc?.type !== 'excalidraw' && (
        <>
        <div className="toc-layout-container flex-1 min-h-0 flex overflow-hidden">
        <div
          className="main-content-area outline-content-scroll-area min-w-0 flex-1 overflow-y-auto px-8 py-8 custom-scrollbar"
          onClick={() => updateSelectedNodeIds([])}
        >
          <div className="max-w-[900px] ml-auto mr-auto md:ml-16 md:mr-auto">
            {currentDoc && !isDiaryDoc && (
              <h1
                className="text-4xl font-semibold mb-8 text-gray-800 dark:text-gray-100 outline-none leading-tight"
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleTitleChange(e.currentTarget.textContent || '')}
                onFocus={(e) => {
                  if (currentDoc.title === '新文章') {
                    const el = e.currentTarget;
                    el.textContent = '';
                    // 光标定位到开头
                    const range = document.createRange();
                    const sel = window.getSelection();
                    range.setStart(el, 0);
                    range.collapse(true);
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                  }
                }}
              >
                 {currentDoc.title}
              </h1>
            )}

            {/* Diary date navigation bar */}
            {isDiaryDoc && diaryMonthMatch && (() => {
              return (
                <DiaryDateBar
                  docYear={diaryYear!}
                  docMonth={diaryMonth!}
                  diaryDays={diaryDays}
                  onDayClick={handleDiaryDayClick}
                  showMonthArrows={isMobile}
                  onMonthNavigate={async (y, m) => {
                    try {
                      const data = await getMonthlyDiary(y, m);
                      if (onDiaryDocChange) {
                        onDiaryDocChange(data.document.id);
                      } else {
                        navigate(`/d/${data.document.id}`);
                      }
                    } catch (e) {
                      console.error('Failed to navigate to month', e);
                    }
                  }}
                />
              );
            })()}

            {/* 标签过滤提示 */}
            {tagFilter && (
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 text-sm rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                  <span className="font-medium">{tagFilter}</span>
                  <button
                    onClick={() => setTagFilter(null)}
                    className="ml-0.5 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full w-4 h-4 flex items-center justify-center transition-colors"
                  >
                    ✕
                  </button>
                </span>
              </div>
            )}

            <div
              className="relative pb-[40vh]"
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                const target = e.target as HTMLElement;

                // 拖拽手柄：直接进入单节点拖拽模式（不经过框选）
                const handleEl = target.closest('[data-drag-handle]') as HTMLElement;
                if (handleEl) {
                  e.preventDefault();
                  const dragNodeId = handleEl.getAttribute('data-drag-handle')!;
                  updateSelectedNodeIds([dragNodeId]);
                  dragMoveRef.current = { isMoving: true, startNodeId: dragNodeId, selectedIds: [dragNodeId] };
                  setIsDragMoving(true);
                  return;
                }

                const nodeEl = target.closest('[data-node-id]') as HTMLElement;

                if (nodeEl) {
                  const nodeId = nodeEl.getAttribute('data-node-id');
                  // 如果点击的节点已选中 → 进入移动模式
                  if (nodeId && selectedNodeIds.includes(nodeId) && selectedNodeIds.length > 0) {
                    e.preventDefault();
                    dragMoveRef.current = { isMoving: true, startNodeId: nodeId, selectedIds: [...selectedNodeIds] };
                    setIsDragMoving(true);
                    return;
                  }
                  // 否则 → 进入框选模式
                  dragSelectionRef.current.startNodeId = nodeId;
                  dragSelectionRef.current.isDragging = false;
                  dragSelectionRef.current.lastRangeStr = '';
                } else {
                  updateSelectedNodeIds([]);
                  dragSelectionRef.current.lastRangeStr = '';
                }
              }}
              onMouseMove={(e) => {
                // 移动模式：计算放置目标
                if (dragMoveRef.current.isMoving) {
                  const allRows = Array.from(document.querySelectorAll('[data-node-id]'));
                  let targetNodeId: string | null = null;

                  // 找到鼠标下的节点
                  const target = e.target as HTMLElement;
                  const nodeEl = target.closest('[data-node-id]') as HTMLElement;
                  if (nodeEl) {
                    targetNodeId = nodeEl.getAttribute('data-node-id');
                  } else {
                    // 按垂直距离找最近的节点
                    let minDist = Infinity;
                    for (const row of allRows) {
                      const rect = row.getBoundingClientRect();
                      const dist = Math.min(Math.abs(e.clientY - rect.top), Math.abs(e.clientY - rect.bottom));
                      if (dist < minDist) {
                        minDist = dist;
                        targetNodeId = row.getAttribute('data-node-id');
                      }
                    }
                  }

                  if (targetNodeId && !dragMoveRef.current.selectedIds.includes(targetNodeId)) {
                    // 计算放置位置（上1/4 → before，下1/4 → after，中间1/2 → child）
                    const targetEl = document.querySelector(`[data-node-id="${targetNodeId}"]`);
                    if (targetEl) {
                      const rect = targetEl.getBoundingClientRect();
                      const relY = (e.clientY - rect.top) / rect.height;
                      let position: 'before' | 'after' | 'child';
                      if (relY < 0.25) {
                        position = 'before';
                      } else if (relY > 0.75) {
                        position = 'after';
                      } else {
                        position = 'child';
                      }
                      updateDropTarget({ nodeId: targetNodeId, position });
                    }
                  } else {
                    updateDropTarget(null);
                  }
                  return;
                }

                // 框选模式：按行中心点和鼠标 Y 坐标计算范围，避免快速滑过节点时漏选
                const { startNodeId } = dragSelectionRef.current;
                if (!startNodeId) return;

                const allRows = Array.from(document.querySelectorAll<HTMLElement>('[data-node-id]'));
                const rowMetrics = allRows
                  .map((row, index) => {
                    const rect = row.getBoundingClientRect();
                    return {
                      id: row.getAttribute('data-node-id'),
                      index,
                      top: rect.top,
                      bottom: rect.bottom,
                      center: rect.top + rect.height / 2,
                    };
                  })
                  .filter((item): item is { id: string; index: number; top: number; bottom: number; center: number } => !!item.id);

                const currentRow = rowMetrics.find(row => e.clientY >= row.top && e.clientY <= row.bottom)
                  ?? rowMetrics.reduce<{ id: string; index: number; top: number; bottom: number; center: number } | null>((nearest, row) => {
                    if (!nearest) return row;
                    return Math.abs(e.clientY - row.center) < Math.abs(e.clientY - nearest.center) ? row : nearest;
                  }, null);
                const currentId = currentRow?.id ?? null;

                if (currentId && currentId !== startNodeId) {
                    dragSelectionRef.current.isDragging = true;
                    window.getSelection()?.removeAllRanges();
                    if (document.activeElement instanceof HTMLElement) {
                      document.activeElement.blur();
                    }

                    const startIdx = rowMetrics.find(row => row.id === startNodeId)?.index ?? -1;
                    const currentIdx = currentRow?.index ?? -1;

                    if (startIdx !== -1 && currentIdx !== -1) {
                      const selectedArray = computeHierarchicalRangeSelection(startNodeId, currentId, nodes);
                      const rangeStr = selectedArray.join(',');
                      if (dragSelectionRef.current.lastRangeStr !== rangeStr) {
                          updateSelectedNodeIds(selectedArray);
                          dragSelectionRef.current.lastRangeStr = rangeStr;
                      }
                    }
                }
              }}
              onMouseUp={() => {
                // 移动模式：执行移动
                if (dragMoveRef.current.isMoving) {
                  finishDragMove();
                  return;
                }
              }}
            >
               {treeNodes.map((node, index) => {
                  const isDateNode = node.heading === 'h1' && /^\d{4}年\d{1,2}月\d{1,2}日\s+星期[一二三四五六日]$/.test(node.content || '');
                  const needsGap = !!currentDoc?.diary_date && isDateNode && index > 0;
                  return (
                    <div
                      key={node.id}
                      className={`outline-node-render-row ${needsGap ? 'mt-5' : ''}`}
                    >
                      <NodeItem
                        node={node}
                        childrenNodes={node.children}
                        documents={documents}
                        onContentChange={handleNodeChange}
                        onNoteChange={handleNoteChange}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        onCompleteToggle={toggleComplete}
                        onCollapseToggle={handleCollapseToggle}
                        onStyleChange={handleStyleChange}
                        focusedNodeId={focusedNodeId}
                        onFocus={handleFocus}
                        onBlurToolbar={handleBlurToolbar}
                        onDelete={handleDelete}
                        onZoom={(id) => setZoomedNodeId(id)}
                        selectedNodeIds={selectedNodeIds}
                        onSelect={(id, multi) => {
                          if (multi) {
                            updateSelectedNodeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
                          } else {
                            updateSelectedNodeIds([id]);
                          }
                        }}
                        clearSelection={() => updateSelectedNodeIds([])}
                        isDragMoving={isDragMoving}
                        onStartEditing={markEditing}
                        onEndEditing={markSaved}
                      />
                    </div>
                  );
               })}
               
               {nodes.length === 0 && (
                 <div
                  onClick={(e) => {
                    e.stopPropagation();
                    if (currentDoc) {
                      const command = commands.createCreateNodeCommand({
                        document_id: currentDoc.id,
                        content: '',
                        parent_node_id: null,
                        sort_order: createSortOrder()
                      });
                      execute(command);
                      if (command.nodeId) setFocusedNodeId({ id: command.nodeId, field: 'content' });
                    }
                  }}
                  className="group flex items-center py-2 opacity-50 hover:opacity-100 cursor-pointer"
                 >
                     <div className="mr-3 w-4 h-4 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-400"></div>
                     </div>
                     <div className="text-gray-400 text-lg">Click here to start typing...</div>
                 </div>
               )}
            </div>
          </div>
        </div>
        {!isMobile && <TableOfContents nodes={sortedNodes} documentId={documentId} />}
        </div>
        </>
      )}

      {/* Drop Indicator for drag-move */}
      {dropTarget && (
        <DropIndicator targetNodeId={dropTarget.nodeId} position={dropTarget.position} />
      )}

      {/* Batch Edit Entry Button */}
      {batchEditButtonPosition && !batchEditPosition && selectedNodeIds.length > 1 && !isDragMoving && (
        <button
          type="button"
          className="fixed z-[145] h-8 px-2.5 rounded-full bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 shadow-lg text-xs font-medium text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/40 transition-colors"
          style={{
            left: `${batchEditButtonPosition.x}px`,
            top: `${batchEditButtonPosition.y}px`,
            transform: 'translateY(-50%)',
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setBatchEditPosition({
              x: batchEditButtonPosition.x + 44,
              y: batchEditButtonPosition.y,
            });
          }}
          title="打开批量编辑"
          aria-label={`打开 ${selectedNodeIds.length} 个节点的批量编辑菜单`}
        >
          编辑
        </button>
      )}

      {/* Mobile Toolbar - inline only when not inside MobileToolbarProvider */}
      {isMobile && !hasToolbarProvider && (
        <MobileToolbar
          isVisible={!!focusedNodeIdForToolbar}
          onIndent={handleMobileIndent}
          onOutdent={handleMobileOutdent}
          onToggleTodo={handleMobileToggleComplete}
          onAddNote={handleMobileAddNote}
          onMoveUp={handleMobileMoveUp}
          onMoveDown={handleMobileMoveDown}
          onZoom={handleMobileZoom}
          onUndo={handleMobileUndo}
          onDelete={handleMobileDelete}
        />
      )}

      {/* Batch Edit Toolbar */}
      {batchEditPosition && selectedNodeIds.length > 1 && (
        <div 
          className="fixed z-[150] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-2"
          style={{ 
            left: `${batchEditPosition.x}px`, 
            top: `${batchEditPosition.y}px`,
            transform: 'translateY(-50%)'
          }}
        >
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-400 px-2">
              已选择 {selectedNodeIds.length} 个节点
            </span>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
            <button
              onClick={() => applyBatchStyleToggle('is_bold', true, false)}
              className={`p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm font-bold ${selectionAllMatch('is_bold', true) ? 'bg-blue-500 text-white hover:bg-blue-600' : ''}`}
              title="加粗"
            >
              B
            </button>
            <button
              onClick={() => applyBatchStyleToggle('is_italic', true, false)}
              className={`p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm italic ${selectionAllMatch('is_italic', true) ? 'bg-blue-500 text-white hover:bg-blue-600' : ''}`}
              title="斜体"
            >
              I
            </button>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
            <button
              onClick={() => applyBatchStyleToggle('color', 'red', null)}
              className={`w-5 h-5 rounded-full bg-red-500 hover:ring-2 ring-red-300 ${selectionAllMatch('color', 'red') ? 'ring-2 ring-offset-2 ring-red-500' : ''}`}
              title="红色"
            />
            <button
              onClick={() => applyBatchStyleToggle('color', 'blue', null)}
              className={`w-5 h-5 rounded-full bg-blue-500 hover:ring-2 ring-blue-300 ${selectionAllMatch('color', 'blue') ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
              title="蓝色"
            />
            <button
              onClick={() => applyBatchStyleToggle('color', 'green', null)}
              className={`w-5 h-5 rounded-full bg-green-500 hover:ring-2 ring-green-300 ${selectionAllMatch('color', 'green') ? 'ring-2 ring-offset-2 ring-green-500' : ''}`}
              title="绿色"
            />
            <button
              onClick={() => applyBatchStyleToggle('color', 'purple', null)}
              className={`w-5 h-5 rounded-full bg-purple-500 hover:ring-2 ring-purple-300 ${selectionAllMatch('color', 'purple') ? 'ring-2 ring-offset-2 ring-purple-500' : ''}`}
              title="紫色"
            />
            <button
              onClick={() => {
                selectedNodeIds.forEach(id => handleStyleChange(id, { color: null }));
                setBatchEditPosition(null);
              }}
              className="w-5 h-5 rounded-full border border-gray-300 dark:border-gray-600 hover:ring-2 ring-gray-300 flex items-center justify-center text-xs text-gray-500"
              title="清除颜色"
            >
              ×
            </button>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
            <button
              onClick={() => applyBatchStyleToggle('highlight', 'yellow', null)}
              className={`w-5 h-5 rounded bg-yellow-200 hover:ring-2 ring-yellow-300 ${selectionAllMatch('highlight', 'yellow') ? 'ring-2 ring-offset-2 ring-yellow-400' : ''}`}
              title="黄色高亮"
            />
            <button
              onClick={() => {
                selectedNodeIds.forEach(id => handleStyleChange(id, { highlight: null }));
                setBatchEditPosition(null);
              }}
              className="w-5 h-5 rounded border border-gray-300 dark:border-gray-600 hover:ring-2 ring-gray-300 flex items-center justify-center text-xs text-gray-500"
              title="清除高亮"
            >
              ×
            </button>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
            <button
              onClick={() => applyBatchStyleToggle('is_todo', true, false)}
              className={`p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm ${selectionAllMatch('is_todo', true) ? 'bg-blue-500 text-white hover:bg-blue-600' : ''}`}
              title="设为待办"
            >
              ☑️
            </button>
            <button
              onClick={() => applyBatchStyleToggle('heading', 'h1', null)}
              className={`p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm font-bold ${selectionAllMatch('heading', 'h1') ? 'bg-blue-500 text-white hover:bg-blue-600' : ''}`}
              title="一级标题"
            >
              H1
            </button>
            <button
              onClick={() => applyBatchStyleToggle('heading', 'h2', null)}
              className={`p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm font-bold ${selectionAllMatch('heading', 'h2') ? 'bg-blue-500 text-white hover:bg-blue-600' : ''}`}
              title="二级标题"
            >
              H2
            </button>
            <button
              onClick={() => applyBatchStyleToggle('heading', 'h3', null)}
              className={`p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm font-bold ${selectionAllMatch('heading', 'h3') ? 'bg-blue-500 text-white hover:bg-blue-600' : ''}`}
              title="三级标题"
            >
              H3
            </button>
            <button
              onClick={() => {
                selectedNodeIds.forEach(id => handleStyleChange(id, { heading: null }));
                setBatchEditPosition(null);
              }}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm"
              title="清除标题"
            >
              H-
            </button>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
            <button
              onClick={() => {
                setBatchEditPosition(null);
                updateSelectedNodeIds([]);
              }}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400"
              title="关闭"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      {confirmDialog?.show && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center p-4 z-[200]" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm shadow-xl">
            <p className="text-gray-800 dark:text-gray-200 mb-4">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancelDelete}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Markdown Preview Modal */}
      {markdownPreview !== null && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center p-4 z-[200]" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full shadow-xl max-h-[80dvh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Markdown 预览</h3>
              <button
                onClick={() => setMarkdownPreview(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <pre className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-900 p-4 rounded text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono">
              {markdownPreview}
            </pre>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(markdownPreview);
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                复制
              </button>
              <button
                onClick={() => setMarkdownPreview(null)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      <RecoveryDialog
        isOpen={showRecoveryDialog}
        pendingOperations={recoveryOperations}
        onRecover={handleRecover}
        onDiscard={handleDiscard}
        isRecovering={isRecovering}
      />

      {/* Mind Map View */}
      {viewMode === 'mindmap' && currentDoc?.type === 'document' && (
        <MindMapView
          nodes={nodes}
          documentTitle={currentDoc?.title || ''}
          onNodeUpdate={handleMindMapNodeUpdate}
          onNodeAdd={handleMindMapNodeAdd}
          onNodeDelete={handleMindMapNodeDelete}
          onNodeMove={handleMindMapNodeMove}
          documentTabs={documentTabs}
          activeDocumentTabKey={activeDocumentTabKey}
          showDocumentTabs={false}
          onDocumentTabSelect={handleDocumentTabSelect}
          onDocumentTabClose={handleDocumentTabClose}
        />
      )}
        </>
      )}
      
      {/* 幽灵锚点：用于保持移动端键盘打开 */}
      <input
        ref={ghostAnchorRef}
        style={{
          position: 'absolute',
          opacity: 0,
          pointerEvents: 'none',
          width: 1,
          height: 1,
          top: 0,
          left: 0,
          zIndex: -1
        }}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
};

export default MainArea;
