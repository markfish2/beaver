import { useState, useEffect, useMemo, Fragment, useRef, useCallback } from 'react';
import { Menu, ChevronUp, ChevronDown } from 'lucide-react';
import Breadcrumbs from './Breadcrumbs';
import NodeItem from './NodeItem';
import MobileToolbar from './MobileToolbar';
import { useMobileToolbar } from '../context/MobileToolbarContext';
import { useFontSettings } from './FontSettings';
import MindMapView from './MindMapView';
import LoadingSkeleton from './LoadingSkeleton';
import { SaveStatusIndicator } from './SaveStatusIndicator';
import RecoveryDialog from './RecoveryDialog';
import DropIndicator from './DropIndicator';
import TableOfContents from './TableOfContents';
import DocumentSettingsMenu from './DocumentSettingsMenu';
import DiaryDateBar from './DiaryDateBar';
import MarkdownNoteEditor from './MarkdownNoteEditor';
import { ExcalidrawEditor } from './ExcalidrawEditor';
import MemoHome from './MemoHome';
import UserProfileEditor from './UserProfileEditor';
import TokenPanel from './TokenPanel';
import TrashPanel from './TrashPanel';
import PasswordPanel from './PasswordPanel';
import AISettingsPanel from './AISettingsPanel';
import AIChatMainView from './AIChatMainView';
import { useUserView } from '../context/UserViewContext';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getNodes, getDocument, updateNode, updateDocument, deleteNode, createNode, createNodesBatch, uploadFile, batchUpdateNodes, batchMoveNodes, batchDeleteNodes, moveNode, getDiaryDayDates, getOrCreateDayNode, getMonthlyDiary } from '../api/data';
import type { Node, Document } from '../api/data';
import { useDocuments } from '../context/DocumentContext';
import { useSearch } from '../context/SearchContext';
import { useDiary } from '../context/DiaryContext';
import { useHistory } from '../hooks/useHistory';
import { useSaveManager } from '../hooks/useSaveManager';
import { useKeyboardScroll } from '../hooks/useKeyboardScroll';
import { createCommandFactory } from '../commands/implementations';

import { saveStateManager, PendingOperation } from '../utils/saveStateManager';
import { saveViewState, saveScrollPosition, loadScrollPosition } from '../utils/pwaState';

// Helper to build tree from flat list for rendering
const buildTree = (nodes: Node[]): (Node & { children: Node[] })[] => {
  const nodeMap = new Map<string, Node & { children: Node[] }>();
  const roots: (Node & { children: Node[] })[] = [];

  // Initialize map
  nodes.forEach(node => {
    nodeMap.set(node.id, { ...node, children: [] });
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
  data: null as any[] | null,
  // 标记：是否刚由应用内部触发了复制
  isInternalCopy: false,
  saveSerializedRows(data: any[]) {
    this.data = data;
    this.isInternalCopy = true;
  },
  getSerializedRows(): any[] | null {
    return this.data;
  },
  clear() {
    this.data = null;
    this.isInternalCopy = false;
  }
};

// Helper: 序列化节点为树结构（用于内部粘贴）
const serializeNodesToTree = (allNodes: Node[], selectedIds: string[]): any[] => {
  const selectedNodes = allNodes.filter(n => selectedIds.includes(n.id));
  
  const processNode = (node: Node): any => {
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

// Helper: 解析 Markdown 文本为树状结构
interface ParsedNode {
  content: string;
  note?: string;
  is_completed?: boolean;
  is_todo?: boolean;
  children: ParsedNode[];
}

const parseMarkdown = (text: string): ParsedNode[] => {
  const lines = text.split('\n');
  const root: ParsedNode[] = [];
  const stack: { node: ParsedNode; indent: number }[] = [];

  lines.forEach(line => {
    if (!line.trim()) return;

    // 精确计算物理缩进。将 1 个制表符(\t)视为 4 个空格
    // 这完美兼容了 Obsidian 的默认复制格式，也兼容内部的 2 空格格式
    const match = line.match(/^(\s*)/);
    const whitespace = match ? match[1] : '';
    const indentLength = whitespace.replace(/\t/g, '    ').length;

    const trimmedLine = line.trim();
    let content = trimmedLine;
    let is_completed = false;
    let is_todo = false;

    // 识别引用的备注块（支持内部多节点复制时带出的备注）
    if (trimmedLine.startsWith('>')) {
      const noteContent = trimmedLine.replace(/^>\s*/, '');
      if (stack.length > 0) {
         const parent = stack[stack.length - 1].node;
         parent.note = parent.note ? parent.note + '\n' + noteContent : noteContent;
      }
      return; // 备注直接附加到父节点，不作为独立节点压栈
    }

    // 匹配 checkbox 格式: - [ ] 或 - [x]
    const checkboxMatch = trimmedLine.match(/^[-*]\s+\[([ xX])\]\s*(.*)$/);
    if (checkboxMatch) {
      is_todo = true;
      is_completed = checkboxMatch[1].toLowerCase() === 'x';
      content = checkboxMatch[2];
    } else {
      // 匹配普通列表格式: - 或 *
      const listMatch = trimmedLine.match(/^[-*]\s+(.*)$/);
      if (listMatch) {
        content = listMatch[1];
      } else {
        // 匹配标题格式: # ## ### 等
        const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
          content = headingMatch[2];
        }
      }
    }

    const newNode: ParsedNode = {
      content: content.trim(),
      is_completed,
      is_todo,
      children: []
    };

    // 基于绝对缩进长度（indentLength）寻找父节点
    // 只要栈顶节点的缩进"大于或等于"当前行，就一直出栈，直到找到真正包含它的父级
    while (stack.length > 0 && stack[stack.length - 1].indent >= indentLength) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(newNode);
    } else {
      stack[stack.length - 1].node.children.push(newNode);
    }

    stack.push({ node: newNode, indent: indentLength });
  });

  return root;
};

// Helper: 将解析后的树展平为节点数组
const flattenParsedNodes = (
  parsedNodes: ParsedNode[],
  documentId: string,
  parentId: string | null,
  startOrder: number
): Partial<Node>[] => {
  const result: Partial<Node>[] = [];
  let currentOrder = startOrder;

  const processNode = (node: ParsedNode, parentId: string | null) => {
    const newNode: Partial<Node> = {
      id: crypto.randomUUID(),
      document_id: documentId,
      content: node.content,
      note: node.note,
      parent_node_id: parentId,
      sort_order: currentOrder,
      is_completed: node.is_completed || false,
      is_todo: node.is_todo || false,
      color: null,
      is_collapsed: false,
    };
    result.push(newNode);
    currentOrder += 10000;

    // 递归处理子节点
    node.children.forEach(child => {
      processNode(child, newNode.id as string);
    });
  };

  parsedNodes.forEach(parsedNode => {
    processNode(parsedNode, parentId);
  });

  return result;
};

type UserSubView = 'profile' | 'token' | 'ai' | 'trash' | 'password';

interface MainAreaProps {
  diaryDocId?: string | null;
  onDiaryDocChange?: (docId: string) => void;
  userSubView?: UserSubView | null;
  activeConvId?: string | null;
}

const MainArea = ({ diaryDocId = null, onDiaryDocChange, userSubView = null, activeConvId = null }: MainAreaProps = {}) => {
  const { setActiveConvId, refreshConvList, setUserSubView } = useUserView();
  const { documentId: urlDocumentId } = useParams();
  const navigate = useNavigate();
  const documentId = diaryDocId || urlDocumentId;
  const [searchParams, setSearchParams] = useSearchParams();
  const { updateDocumentTitle, documents } = useDocuments();
  const { searchQuery, setSearchQuery } = useSearch();
  const diaryCtx = useDiary();
  const fetchIdRef = useRef(0);
  const [nodes, setNodes] = useState<Node[]>([]);
  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  const [currentDoc, setCurrentDoc] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { saveStatus, pendingCount, hasUnsavedChanges, isOnline, offlineQueueCount } = useSaveManager();
  // Mobile state
  const [isMobile, setIsMobile] = useState(false);
  const { scrollToElement } = useKeyboardScroll({ enabled: isMobile });
  const [focusedNodeId, setFocusedNodeId] = useState<{ id: string, field: 'content' | 'note' } | null>(null);

  const [zoomedNodeId, setZoomedNodeId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  useEffect(() => { selectedNodeIdsRef.current = selectedNodeIds; }, [selectedNodeIds]);
  const [batchEditPosition, setBatchEditPosition] = useState<{ x: number; y: number } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    nodeId: string;
    message: string;
    descendants: Node[];
  } | null>(null);
  const dragSelectionRef = useRef({ isDragging: false, startNodeId: null as string | null, lastRangeStr: '' });
  const [isDragMoving, setIsDragMoving] = useState(false);
  const [dropTarget, setDropTarget] = useState<{ nodeId: string; position: 'before' | 'after' | 'child' } | null>(null);
  const dragMoveRef = useRef({ isMoving: false, startNodeId: null as string | null });
  const ghostAnchorRef = useRef<HTMLInputElement>(null);
  const nodeIdFromUrl = searchParams.get('nodeId');
  // Diary state
  const { diaryDays, setDiaryDays, register: registerDiaryHandler, unregister: unregisterDiaryHandler, registerAddNode, unregisterAddNode } = diaryCtx;
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
  
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [recoveryOperations, setRecoveryOperations] = useState<PendingOperation[]>([]);
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
  const [headerCollapsed, setHeaderCollapsed] = useState(true);

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

    const handleMouseUp = (e: MouseEvent) => {
      // 移动模式由容器的 onMouseUp 处理，这里跳过
      if (dragMoveRef.current.isMoving) return;
      if (dragSelectionRef.current.isDragging && selectedNodeIds.length > 1) {
        setBatchEditPosition({ x: e.clientX, y: e.clientY });
      }
      dragSelectionRef.current.startNodeId = null;
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

        if (pendingData.length > 0) {
          const blob = new Blob([JSON.stringify({ operations: pendingData })], { type: 'application/json' });
          navigator.sendBeacon('/api/nodes/batch/save', blob);
        }
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

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const pendingOps = saveStateManager.getPendingOperations();
    if (pendingOps && pendingOps.length > 0) {
      setShowRecoveryDialog(true);
      setRecoveryOperations(pendingOps);
    }
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
                const payload = op.data.updates.map((u: any) => ({ 
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
      
      if (documentId) {
        fetchData(documentId);
      }
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

  // Font Settings Hook
  const fontSettings = useFontSettings();

  // View Mode State - 'outline' or 'mindmap'
  const [viewMode, setViewMode] = useState<'outline' | 'mindmap'>('outline');

  const handleMindMapNodeUpdate = async (nodeId: string, content: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || node.content === content) return;
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
    execute(commands.createDeleteNodeCommand(node, descendants));
  };

  const handleMindMapNodeMove = async (nodeId: string, newParentId: string | null) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, []);

  useEffect(() => {
    setTagFilter(null);
    setViewMode('outline');
    if (documentId) {
      const id = ++fetchIdRef.current;
      fetchData(documentId, id);
    } else {
      fetchIdRef.current++;
      setNodes([]);
      setCurrentDoc(null);
      setIsLoading(false);
    }
  }, [documentId]);

  // 当 documents 加载完成后，如果 currentDoc 为 null 但有匹配的文档，更新 currentDoc
  useEffect(() => {
    if (documentId && !currentDoc && documents.length > 0) {
      // Normalize: compare without hyphens
      const normalizedId = documentId.replace(/-/g, '');
      const foundDoc = documents.find(d => d.id.replace(/-/g, '') === normalizedId);
      if (foundDoc) {
        setCurrentDoc(foundDoc);
      }
    }
  }, [documents, documentId, currentDoc]);

  // 侧边栏重命名 → 同步标题到 currentDoc（只更新 title，不覆盖其他本地状态）
  useEffect(() => {
    if (!currentDoc || !documentId) return;
    // Normalize: compare without hyphens
    const normalizedId = documentId.replace(/-/g, '');
    const ctxDoc = documents.find(d => d.id.replace(/-/g, '') === normalizedId);
    if (ctxDoc && ctxDoc.title !== currentDoc.title) {
      setCurrentDoc(prev => prev ? { ...prev, title: ctxDoc.title } : prev);
    }
  }, [documents, documentId]);

  // 注意：不再在 sidebarClose 时重新 fetchData，
  // documentId 变化时 useEffect 已自动加载数据

  const fetchData = async (id: string, fetchId?: number) => {
    setIsLoading(true);
    try {
      const nodesData = await getNodes(id);

      // Check if this fetch is still current
      if (fetchId !== undefined && fetchId !== fetchIdRef.current) return;

      let processedNodes = [...nodesData];
      let ancestorsToExpand: string[] = [];

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
      // 先从 context 查找，找不到则从 API 获取（日记文档会被 context 过滤）
      // Normalize: compare without hyphens
      const normalizedId = id.replace(/-/g, '');
      let foundDoc = documents.find(d => d.id.replace(/-/g, '') === normalizedId);
      if (!foundDoc) {
        try {
          foundDoc = await getDocument(id);
        } catch {}
      }

      // Check again after async operations
      if (fetchId !== undefined && fetchId !== fetchIdRef.current) return;

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
  };

  // Fetch diary days when document changes
  useEffect(() => {
    if (isDiaryDoc && diaryYear !== null && diaryMonth !== null) {
      getDiaryDayDates(diaryYear, diaryMonth).then(days => setDiaryDays(new Set(days))).catch(() => setDiaryDays(new Set()));
    } else {
      setDiaryDays(new Set());
    }
  }, [currentDoc?.diary_date]);

  // Handle clicking a day in the diary date bar (returns true if handled)
  const handleDiaryDayClick = useCallback(async (day: number): Promise<boolean> => {
    if (diaryYear === null || diaryMonth === null || !documentId) return false;
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
        setNodes(prev => [...prev, ...newNodes]);
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
    }
  }, [diaryYear, diaryMonth, documentId]);

  // Register/unregister diary handler with context
  useEffect(() => {
    if (isDiaryDoc && diaryYear !== null && diaryMonth !== null) {
      registerDiaryHandler(diaryYear, diaryMonth, handleDiaryDayClick);
    } else {
      unregisterDiaryHandler();
    }
    return () => unregisterDiaryHandler();
  }, [isDiaryDoc, diaryYear, diaryMonth, handleDiaryDayClick, registerDiaryHandler, unregisterDiaryHandler]);

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
    const now = Date.now();
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

  // 小黑点按住 → 只记录起点，不选节点（避免干扰容器的框选逻辑）
  const executeMultiNodeMove = (targetNodeId: string, position: 'before' | 'after' | 'child') => {
    const selectedSet = new Set(selectedNodeIds);
    // 筛选顶层选中节点（父节点未被选中的）
    const topLevelSelected = sortedNodes
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
      let baseOrder = existingChildren.length > 0
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
    setSelectedNodeIds([]);
    setDropTarget(null);
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
          } catch (error: any) {
            console.error('图片上传失败', error);
            const errorMessage = error?.response?.data?.detail || error?.message || '未知错误';
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
          } catch (error: any) {
            console.error('附件上传失败', error);
            const errorMessage = error?.response?.data?.detail || error?.message || '未知错误';
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
        const types = (e.clipboardData as any).types;
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
       startOrder = children.length > 0 ? children[0].sort_order - 10000 : Date.now();
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

  // ----- 光标位置精确保存与恢复工具函数 -----
  const cursorPositionRef = useRef<{ nodeId: string; offset: number } | null>(null);
  const lastEditRef = useRef<{ nodeId: string; timestamp: number; oldContent: string } | null>(null);

  const saveCursorPosition = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.anchorNode) {
      cursorPositionRef.current = null;
      return;
    }

    let el: HTMLElement | null = sel.anchorNode instanceof Element
      ? sel.anchorNode
      : sel.anchorNode.parentElement;
    while (el && !el.hasAttribute('data-node-id')) {
      el = el.parentElement;
    }
    if (!el) {
      cursorPositionRef.current = null;
      return;
    }

    const contentEl = document.getElementById(`node-${el.getAttribute('data-node-id')}`);
    if (!contentEl) {
      cursorPositionRef.current = null;
      return;
    }

    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(contentEl);
    range.setEnd(sel.anchorNode, sel.anchorOffset);
    const textOffset = range.toString().length;

    cursorPositionRef.current = {
      nodeId: el.getAttribute('data-node-id')!,
      offset: textOffset
    };
  }, []);

  const restoreCursorPosition = useCallback(() => {
    const pos = cursorPositionRef.current;
    if (!pos) return;

    const el = document.getElementById(`node-${pos.nodeId}`);
    if (!el) return;

    el.focus({ preventScroll: true });
    const safeOffset = Math.min(pos.offset, (el.textContent || '').length);

    const sel = window.getSelection();
    if (!sel) return;

    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let accumulated = 0;
    let targetNode: Text | null = null;
    let targetOffset = 0;

    while (tw.nextNode()) {
      const textNode = tw.currentNode as Text;
      const len = textNode.length;
      if (accumulated + len >= safeOffset) {
        targetNode = textNode;
        targetOffset = safeOffset - accumulated;
        break;
      }
      accumulated += len;
    }

    if (targetNode) {
      const range = document.createRange();
      range.setStart(targetNode, targetOffset);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, []);

  const focusNode = (nodeId: string, field: 'content' | 'note' = 'content') => {
    const el = document.getElementById(`${field}-${nodeId}`);
    if (!el) {
      setTimeout(() => focusNode(nodeId, field), 50);
      return;
    }

    el.focus({ preventScroll: true });
    if (field === 'content') {
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }

    scrollToElement(nodeId, field);
  };

  const handleKeyDown = async (e: React.KeyboardEvent, currentNode: Node, type: 'content' | 'note') => { 
    // 拦截输入法组合状态
    if (e.nativeEvent.isComposing || e.keyCode === 229) { 
      return; 
    } 

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const currentIndex = sortedNodes.findIndex(n => n.id === currentNode.id);
      if (currentIndex !== -1) {
        let targetIndex = e.key === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1;
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
        const currentText = currentElement.textContent || '';
        
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
            if (currentText === '') {
              // 2. 绝对拦截！必须阻止浏览器原生的退格动作，不让它擅自把光标扔到上一行开头
              e.preventDefault();
              
              if (nodes.length <= 1) {
                e.stopPropagation();
                if (currentDoc) {
                  const cmd = commands.createCreateNodeCommand({
                    document_id: currentDoc.id, content: '', parent_node_id: null, sort_order: Date.now()
                  });
                  execute(cmd);
                  if (cmd.nodeId) setFocusedNodeId({ id: cmd.nodeId, field: 'content' });
                }
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
          newSortOrder = firstChild ? firstChild.sort_order - 1000 : Date.now();
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
          newSortOrder = firstChild ? firstChild.sort_order - 1000 : Date.now();
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
      
      const currentIndex = sortedNodes.findIndex(n => n.id === currentNode.id);

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
          let newSortOrder = lastChild ? lastChild.sort_order + 1000 : Date.now();

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

  const handleStyleChange = (id: string, styles: Partial<Node>) => {
    setNodes(prev => {
      const node = prev.find(n => n.id === id);
      if (!node) return prev;
      return prev.map(n => n.id === id ? { ...n, ...styles } : n);
    });

    updateNode(id, styles).catch((error) => {
      console.error('Failed to update node styles', error);
    });
  };

  const getSortedNodes = (allNodes: Node[]) => {
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
  };

  const getSelectionFromRange = (rangeIds: string[], allNodes: Node[]): string[] => {
    const selectedIds = new Set<string>();
    const rangeSet = new Set(rangeIds);

    // Helper to collect all descendants into selectedIds
    const collectDescendants = (id: string) => {
      const children = allNodes.filter(n => n.parent_node_id === id);
      children.forEach(child => {
        selectedIds.add(child.id);
        collectDescendants(child.id);
      });
    };

    rangeIds.forEach(id => {
      selectedIds.add(id);
      collectDescendants(id);
    });
    
    const isAncestorOf = (ancestorId: string, descendantId: string): boolean => {
      const node = allNodes.find(n => n.id === descendantId);
      if (!node || !node.parent_node_id) return false;
      if (node.parent_node_id === ancestorId) return true;
      return isAncestorOf(ancestorId, node.parent_node_id);
    };
    
    const rootNodesInRange: string[] = [];
    rangeIds.forEach(id => {
      const hasAncestorInRange = rangeIds.some(otherId => otherId !== id && isAncestorOf(otherId, id));
      if (!hasAncestorInRange) {
        rootNodesInRange.push(id);
      }
    });
    
    if (rootNodesInRange.length <= 1) {
      return Array.from(selectedIds);
    }
    
    rangeIds.forEach(id => {
      let currentId = id;
      while (true) {
        const node = allNodes.find(n => n.id === currentId);
        if (!node || !node.parent_node_id) break;
        
        const parentId = node.parent_node_id;
        const siblings = allNodes.filter(n => n.parent_node_id === parentId && n.id !== currentId);
        const hasSelectedSibling = siblings.some(s => selectedIds.has(s.id));
        
        if (hasSelectedSibling) break;
        
        selectedIds.add(parentId);
        const parentSiblings = allNodes.filter(n => n.parent_node_id === parentId);
        parentSiblings.forEach(sibling => {
          selectedIds.add(sibling.id);
          getDescendants(sibling.id);
        });
        
        currentId = parentId;
      }
    });
    
    return Array.from(selectedIds);
  };

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

  const sortedNodes = useMemo(() => getSortedNodes(nodes), [nodes, zoomedNodeId, searchQuery, tagFilter, currentDoc?.title]);
  const treeNodes = useMemo(() => buildTree(sortedNodes), [sortedNodes]);

  // 幽灵锚点：用于保持移动端键盘打开
  const focusToGhostAnchor = useCallback(() => {
    if (ghostAnchorRef.current) {
      ghostAnchorRef.current.focus();
    }
  }, []);

  // Mobile toolbar handlers - useCallback with refs to avoid re-creating on every render
  const handleMobileMoveUp = useCallback(async () => {
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
  }, [execute, commands]);

  const handleMobileMoveDown = useCallback(async () => {
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
  }, [execute, commands]);

  const handleMobileToggleComplete = useCallback(() => {
    const nodeId = focusedNodeIdForToolbarRef.current;
    if (!nodeId) return;
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (node) handleStyleChange(nodeId, { is_todo: !node.is_todo });
  }, [handleStyleChange]);

  const handleMobileAddNote = useCallback(() => {
    const nodeId = focusedNodeIdForToolbarRef.current;
    if (nodeId) setFocusedNodeId({ id: nodeId, field: 'note' });
  }, []);

  const handleMobileDelete = useCallback(async () => {
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
  }, [execute, commands, getSortedNodes]);

  const handleMobileIndent = useCallback(async () => {
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
      const newSortOrder = lastChild ? lastChild.sort_order + 1000 : Date.now();
      focusToGhostAnchor();
      execute(commands.createBatchMoveCommand([{
        id: currentNode.id, oldParent: currentNode.parent_node_id, oldOrder: currentNode.sort_order,
        newParent: prevSibling.id, newOrder: newSortOrder
      }]));
      setTimeout(() => focusNode(nodeId), 100);
    }
  }, [execute, commands]);

  const handleMobileOutdent = useCallback(async () => {
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
  }, [execute, commands]);

  const handleMobileZoom = useCallback(() => {
    const nodeId = focusedNodeIdForToolbarRef.current;
    if (nodeId) setZoomedNodeId(nodeId);
  }, []);

  const handleMobileUndo = useCallback(async () => {
    focusToGhostAnchor();
    await undo();
  }, [undo]);

  // Publish toolbar handlers to MobileToolbarContext for MobileLayout to render
  useEffect(() => {
    if (!isMobile) return;
    publishToolbar(!!focusedNodeIdForToolbar, {
      onIndent: handleMobileIndent,
      onOutdent: handleMobileOutdent,
      onToggleTodo: handleMobileToggleComplete,
      onAddNote: handleMobileAddNote,
      onMoveUp: handleMobileMoveUp,
      onMoveDown: handleMobileMoveDown,
      onZoom: handleMobileZoom,
      onUndo: handleMobileUndo,
      onDelete: handleMobileDelete,
    });
  }, [isMobile, focusedNodeIdForToolbar, publishToolbar,
      handleMobileIndent, handleMobileOutdent, handleMobileToggleComplete,
      handleMobileAddNote, handleMobileMoveUp, handleMobileMoveDown,
      handleMobileZoom, handleMobileUndo, handleMobileDelete]);

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
          setSelectedNodeIds([]);
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
          
          setSelectedNodeIds([]);
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
                    newSortOrder = lastChild ? lastChild.sort_order + 1000 : Date.now();
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
          setSelectedNodeIds([]);
          return;
        }
      }

      // --- 下面保留原有的 Undo/Redo 逻辑 --- 
      
      // Undo/Redo (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z)
      // Only let browser handle native undo in textarea/input; contentEditable nodes still use custom undo
      const target = e.target as HTMLElement;
      const isTextField = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (isTextField) return;
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
        if (isTextField) return;
        e.preventDefault();
        e.stopPropagation();
        await redo();
        return;
      }
    };
    
    // Use capture phase to intercept shortcuts before they reach editing elements
    window.addEventListener('keydown', handleGlobalKey, { capture: true });
    return () => window.removeEventListener('keydown', handleGlobalKey, { capture: true });
  }, [undo, redo, commands, execute]);

  // User sub-view rendering
  if (userSubView) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        {userSubView === 'profile' && <UserProfileEditor />}
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
    return <MemoHome sidebarOpen={sidebarOpen} isMobile={isMobile} />;
  }

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  const breadcrumbs = [
    { id: 'root', title: 'memo' },
    ...(currentDoc ? [{ id: currentDoc.id, title: currentDoc.title }] : [])
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans h-screen">
      {!document.documentElement.dataset.mobileLayout && (
        <>
          {/* 导航栏展开/收起按钮 — 始终可见 */}
          <button
            onClick={() => setHeaderCollapsed(prev => !prev)}
            className="absolute top-0 left-1/2 -translate-x-1/2 z-10 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200/80 dark:hover:bg-gray-700/80 transition-colors"
            style={{ paddingTop: isMobile ? 'calc(env(safe-area-inset-top, 0px) + 2px)' : '2px' }}
            title={headerCollapsed ? '展开导航栏' : '收起导航栏'}
          >
            {headerCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>

          {!headerCollapsed && (
          <div className="flex items-center justify-between px-6 bg-gray-50/80 dark:bg-gray-800/50" style={{ minHeight: '3rem', paddingTop: isMobile ? 'env(safe-area-inset-top)' : undefined, boxShadow: '0 2px 8px -3px rgba(0,0,0,0.08)' }}>
            <div className="flex items-center flex-wrap gap-1">
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
          
          <Breadcrumbs items={breadcrumbs} onNavigate={(id) => {
            if (id === 'root') {
              setSearchQuery('');
              setZoomedNodeId(null);
              setTagFilter(null);
              navigate('/');
            } else if (currentDoc && id === currentDoc.id) {
              setZoomedNodeId(null);
              setTagFilter(null);
            }
          }} />
          
          {/* 聚焦层级面包屑 */}
          {zoomedNodeId && (() => {
            const getAncestors = (nodeId: string): Node[] => {
              const ancestors: Node[] = [];
              let currentId: string | null = nodeId;
              while (currentId) {
                const node = nodes.find(n => n.id === currentId);
                if (node) {
                  ancestors.unshift(node);
                  currentId = node.parent_node_id;
                } else {
                  break;
                }
              }
              return ancestors;
            };
            
            const ancestors = getAncestors(zoomedNodeId);
            const maxLength = isMobile ? 3 : 15;
            
            return ancestors.map((ancestor, index) => (
              <Fragment key={ancestor.id}>
                <span className="text-sm text-gray-400 dark:text-gray-500 mx-1">
                  {'>'}
                </span>
                <span 
                  className={`text-sm cursor-pointer ${
                    index === ancestors.length - 1 
                      ? 'text-yellow-600 dark:text-yellow-400 font-medium' 
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                  onClick={() => setZoomedNodeId(ancestor.id)}
                  title={ancestor.content || '无标题'}
                >
                  {(ancestor.content.slice(0, maxLength) || '无标题')}
                  {ancestor.content.length > maxLength ? '...' : ''}
                </span>
              </Fragment>
            ));
          })()}
          
          {searchQuery && documentId && (
            <div className="ml-4 flex items-center bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full text-xs animate-in fade-in">
              <span className="text-blue-600 dark:text-blue-400 mr-2">正在过滤: {searchQuery}</span>
              <button 
                onClick={() => setSearchQuery('')} 
                className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-300"
              >✕</button>
            </div>
          )}
            </div>
            <div className="flex items-center gap-2">
          {currentDoc?.type === 'document' && (
            <button
              onClick={() => setViewMode('mindmap')}
              className="p-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
              title="思维导图"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </button>
          )}
          {currentDoc?.type !== 'note' && (
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
              className="p-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
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
          )}
          <DocumentSettingsMenu
            nodes={nodes}
            currentDoc={currentDoc}
            generateMarkdownPreview={generateMarkdownPreview}
            fontSettings={fontSettings}
          />
          <SaveStatusIndicator status={saveStatus} pendingCount={pendingCount} offlineQueueCount={offlineQueueCount} />
        </div>
      </div>
          )}
        </>
      )}

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
          <MarkdownNoteEditor documentId={documentId!} isNew={currentDoc.title === '新笔记'} />
        </div>
      )}

      {/* Excalidraw View - Canvas editor */}
      {currentDoc?.type === 'excalidraw' && (
        <div className="main-content-area flex-1" style={{ minHeight: 0, position: 'relative' }}>
          {isMobile ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-gray-500 p-8">
              <p className="text-center text-sm">画布编辑器暂不支持移动端</p>
              <p className="text-center text-xs text-gray-400">请在 PC 端浏览器中查看和编辑画布</p>
            </div>
          ) : (
            <ExcalidrawEditor
              documentId={documentId!}
              title={currentDoc?.title}
              onTitleChange={handleTitleChange}
            />
          )}
        </div>
      )}

      {/* Outline View - Only show in outline mode */}
      {viewMode === 'outline' && currentDoc?.type !== 'note' && currentDoc?.type !== 'excalidraw' && (
        <>
        <div
          className="main-content-area flex-1 overflow-y-auto px-8 py-8 custom-scrollbar"
          onClick={() => setSelectedNodeIds([])}
        >
          <div className="max-w-[900px] ml-auto mr-auto md:ml-16 md:mr-auto">
            {currentDoc && !diaryDocId && (
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
                  setSelectedNodeIds([dragNodeId]);
                  dragMoveRef.current = { isMoving: true, startNodeId: dragNodeId };
                  setIsDragMoving(true);
                  return;
                }

                const nodeEl = target.closest('[data-node-id]') as HTMLElement;

                if (nodeEl) {
                  const nodeId = nodeEl.getAttribute('data-node-id');
                  // 如果点击的节点已选中 → 进入移动模式
                  if (nodeId && selectedNodeIds.includes(nodeId) && selectedNodeIds.length > 0) {
                    e.preventDefault();
                    dragMoveRef.current = { isMoving: true, startNodeId: nodeId };
                    setIsDragMoving(true);
                    return;
                  }
                  // 否则 → 进入框选模式
                  dragSelectionRef.current.startNodeId = nodeId;
                  dragSelectionRef.current.isDragging = false;
                } else {
                  setSelectedNodeIds([]);
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

                  if (targetNodeId && !selectedNodeIds.includes(targetNodeId)) {
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
                      const newTarget = { nodeId: targetNodeId, position };
                      setDropTarget(prev => {
                        if (prev && prev.nodeId === newTarget.nodeId && prev.position === newTarget.position) return prev;
                        return newTarget;
                      });
                    }
                  } else {
                    setDropTarget(prev => prev ? null : prev);
                  }
                  return;
                }

                // 框选模式：原有逻辑
                const { startNodeId } = dragSelectionRef.current;
                if (!startNodeId) return;

                let currentId: string | null = null;
                const target = e.target as HTMLElement;
                const nodeEl = target.closest('[data-node-id]') as HTMLElement;

                const allRows = Array.from(document.querySelectorAll('[data-node-id]'));

                if (nodeEl) {
                  currentId = nodeEl.getAttribute('data-node-id');
                } else {
                  let minDistance = Infinity;
                  for (const row of allRows) {
                      const rect = row.getBoundingClientRect();
                      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
                          currentId = row.getAttribute('data-node-id');
                          break;
                      }
                      const dist = Math.min(Math.abs(e.clientY - rect.top), Math.abs(e.clientY - rect.bottom));
                      if (dist < minDistance) {
                          minDistance = dist;
                          currentId = row.getAttribute('data-node-id');
                      }
                  }
                }

                if (currentId && currentId !== startNodeId) {
                    dragSelectionRef.current.isDragging = true;
                    window.getSelection()?.removeAllRanges();
                    if (document.activeElement instanceof HTMLElement) {
                      document.activeElement.blur();
                    }

                    const startIdx = allRows.findIndex(row => row.getAttribute('data-node-id') === startNodeId);
                    const currentIdx = allRows.findIndex(row => row.getAttribute('data-node-id') === currentId);

                    if (startIdx !== -1 && currentIdx !== -1) {
                      const min = Math.min(startIdx, currentIdx);
                      const max = Math.max(startIdx, currentIdx);
                      const rangeIds = allRows.slice(min, max + 1).map(row => row.getAttribute('data-node-id') as string);

                      const selectedArray = getSelectionFromRange(rangeIds, nodes);
                      const rangeStr = selectedArray.join(',');
                      if (dragSelectionRef.current.lastRangeStr !== rangeStr) {
                          setSelectedNodeIds(selectedArray);
                          dragSelectionRef.current.lastRangeStr = rangeStr;
                      }
                    }
                }
              }}
              onMouseUp={(e) => {
                // 移动模式：执行移动
                if (dragMoveRef.current.isMoving) {
                  if (dropTarget) {
                    executeMultiNodeMove(dropTarget.nodeId, dropTarget.position);
                  }
                  dragMoveRef.current = { isMoving: false, startNodeId: null };
                  setIsDragMoving(false);
                  setDropTarget(null);
                  return;
                }
              }}
            >
               {treeNodes.map((node, index) => {
                  const isDateNode = node.heading === 'h1' && /^\d{4}年\d{1,2}月\d{1,2}日\s+星期[一二三四五六日]$/.test(node.content || '');
                  const needsGap = !!currentDoc?.diary_date && isDateNode && index > 0;
                  return (
                    <div key={node.id} className={needsGap ? 'mt-5' : ''}>
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
                            setSelectedNodeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
                          } else {
                            setSelectedNodeIds([id]);
                          }
                        }}
                        clearSelection={() => setSelectedNodeIds([])}
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
                        sort_order: Date.now()
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
        </>
      )}

      {/* Drop Indicator for drag-move */}
      {dropTarget && (
        <DropIndicator targetNodeId={dropTarget.nodeId} position={dropTarget.position} />
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
            top: `${batchEditPosition.y + 10}px`,
            transform: 'translateX(-50%)'
          }}
        >
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-400 px-2">
              已选择 {selectedNodeIds.length} 个节点
            </span>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
            <button
              onClick={() => {
                selectedNodeIds.forEach(id => handleStyleChange(id, { is_bold: true }));
                setBatchEditPosition(null);
              }}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm font-bold"
              title="加粗"
            >
              B
            </button>
            <button
              onClick={() => {
                selectedNodeIds.forEach(id => handleStyleChange(id, { is_italic: true }));
                setBatchEditPosition(null);
              }}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm italic"
              title="斜体"
            >
              I
            </button>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
            <button
              onClick={() => {
                selectedNodeIds.forEach(id => handleStyleChange(id, { color: 'red' }));
                setBatchEditPosition(null);
              }}
              className="w-5 h-5 rounded-full bg-red-500 hover:ring-2 ring-red-300"
              title="红色"
            />
            <button
              onClick={() => {
                selectedNodeIds.forEach(id => handleStyleChange(id, { color: 'blue' }));
                setBatchEditPosition(null);
              }}
              className="w-5 h-5 rounded-full bg-blue-500 hover:ring-2 ring-blue-300"
              title="蓝色"
            />
            <button
              onClick={() => {
                selectedNodeIds.forEach(id => handleStyleChange(id, { color: 'green' }));
                setBatchEditPosition(null);
              }}
              className="w-5 h-5 rounded-full bg-green-500 hover:ring-2 ring-green-300"
              title="绿色"
            />
            <button
              onClick={() => {
                selectedNodeIds.forEach(id => handleStyleChange(id, { color: 'purple' }));
                setBatchEditPosition(null);
              }}
              className="w-5 h-5 rounded-full bg-purple-500 hover:ring-2 ring-purple-300"
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
              onClick={() => {
                selectedNodeIds.forEach(id => handleStyleChange(id, { highlight: 'yellow' }));
                setBatchEditPosition(null);
              }}
              className="w-5 h-5 rounded bg-yellow-200 hover:ring-2 ring-yellow-300"
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
              onClick={() => {
                selectedNodeIds.forEach(id => handleStyleChange(id, { is_todo: true }));
                setBatchEditPosition(null);
              }}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm"
              title="设为待办"
            >
              ☑️
            </button>
            <button
              onClick={() => {
                selectedNodeIds.forEach(id => handleStyleChange(id, { heading: 'h1' }));
                setBatchEditPosition(null);
              }}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm font-bold"
              title="一级标题"
            >
              H1
            </button>
            <button
              onClick={() => {
                selectedNodeIds.forEach(id => handleStyleChange(id, { heading: 'h2' }));
                setBatchEditPosition(null);
              }}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm font-bold"
              title="二级标题"
            >
              H2
            </button>
            <button
              onClick={() => {
                selectedNodeIds.forEach(id => handleStyleChange(id, { heading: 'h3' }));
                setBatchEditPosition(null);
              }}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm font-bold"
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
                setSelectedNodeIds([]);
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
          onBackToOutline={() => setViewMode('outline')}
        />
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
