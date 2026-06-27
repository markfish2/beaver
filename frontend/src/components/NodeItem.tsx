import React, { useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Node, Document } from '../api/data';
import { getFileUrl, getThumbnailUrl, getNodes, createMemo } from '../api/data';
import { ArrowUpRight } from 'lucide-react';
import { nodesToMemoMarkdown } from '../utils/convertNode';
import MentionDropdown from './MentionDropdown';
import ImageViewer from './ImageViewer';
import DeleteConfirmDialog from './DeleteConfirmDialog';

interface NodeItemProps {
  node: Node;
  childrenNodes?: Node[];
  documents?: Document[];
  onContentChange: (id: string, content: string) => void;
  onNoteChange: (id: string, note: string | null) => void;
  onKeyDown: (e: React.KeyboardEvent, node: Node, type: 'content' | 'note') => void;
  onCompleteToggle: (id: string, completed: boolean) => void;
  onCollapseToggle: (id: string, collapsed: boolean) => void;
  onStyleChange?: (id: string, styles: Partial<Node>) => void;
  focusedNodeId?: { id: string, field: 'content' | 'note' } | null;
  onFocus?: (id: string) => void;
  onDelete?: (id: string) => void;
  onZoom?: (id: string) => void;
  onPaste?: (e: React.ClipboardEvent, id: string) => void;
  selectedNodeIds?: string[];
  onSelect?: (id: string, multi: boolean) => void;
  clearSelection?: () => void;
  isDragMoving?: boolean;
  onStartEditing?: (id: string) => void;
  onEndEditing?: (id: string) => void;
  onBlurToolbar?: () => void;
}

const NodeItem = memo(({
  node,
  childrenNodes = [],
  documents = [],
  onContentChange,
  onNoteChange,
  onKeyDown,
  onCompleteToggle,
  onCollapseToggle,
  onStyleChange,
  focusedNodeId,
  onFocus,
  onDelete,
  onZoom,
  onPaste,
  selectedNodeIds = [],
  onSelect,
  clearSelection,
  isDragMoving = false,
  onStartEditing,
  onEndEditing,
  onBlurToolbar,
}: NodeItemProps) => {
  const navigate = useNavigate();
  const [converting, setConverting] = useState(false);
  const shouldFocus = focusedNodeId?.id === node.id ? focusedNodeId.field : null;
  const isSelected = selectedNodeIds.includes(node.id);
  
  const contentRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const isInitializedRef = useRef(false);
  const prevNodeIdRef = useRef<string>(node.id);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // 图片查看器状态
  const [imageViewer, setImageViewer] = useState<{ isOpen: boolean; src: string; alt: string }>({
    isOpen: false,
    src: '',
    alt: ''
  });

  // 删除附件/图片确认弹窗
  const [deleteFileDialog, setDeleteFileDialog] = useState<{ show: boolean; type: 'image' | 'attachment' }>({ show: false, type: 'image' });
  
  // @提及功能状态
  const [showMention, setShowMention] = useState(false);
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [mentionSearchText, setMentionSearchText] = useState('');
  const [mentionStartOffset, setMentionStartOffset] = useState<number | null>(null);
  const mentionTriggerRef = useRef<boolean>(false);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // 本地折叠状态 — Workflowy 模式：即时切换，无动画，debounced 同步后端
  const [localCollapsed, setLocalCollapsed] = useState(node.is_collapsed);
  const collapseSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCollapseRef = useRef<boolean | null>(null);

  // 同步外部状态变化（如 undo/redo），但忽略本地已变更的情况
  useEffect(() => {
    if (pendingCollapseRef.current === null) {
      setLocalCollapsed(node.is_collapsed);
    }
  }, [node.is_collapsed]);

  const hasChildren = childrenNodes.length > 0;

  const generateHtmlContent = useCallback((content: string) => {
    if (!content) return '';
    
    const escapeHtml = (unsafe: string) => {
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };
    
    let html = escapeHtml(content);
    
    const urlRegex = /(https?:\/\/[^\s<>&"']+)/g;
    
    const urlPlaceholders: { placeholder: string; url: string }[] = [];
    html = html.replace(urlRegex, (match) => {
      const placeholder = `__URL_${urlPlaceholders.length}__`;
      urlPlaceholders.push({ placeholder, url: match });
      return placeholder;
    });
    
    const tagRegex = /(#[a-zA-Z0-9_\u4e00-\u9fa5]+)/g;
    html = html.replace(tagRegex, '<span class="text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-0.5 rounded cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/50" data-tag="$1">$1</span>');
    
    urlPlaceholders.forEach(({ placeholder, url }) => {
      const linkHtml = `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-600 underline" data-url="${url}" onclick="event.stopPropagation();">${url}</a>`;
      html = html.replace(placeholder, linkHtml);
    });
    
    const docLinkRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    html = html.replace(docLinkRegex, '<a href="/d/$2" class="text-blue-500 hover:text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-1 rounded cursor-pointer" data-doc-link="$2" data-doc-title="$1" contenteditable="false" onclick="event.preventDefault(); event.stopPropagation(); window.dispatchEvent(new CustomEvent(\'doc-link-click\', { detail: \'$2\' }));">@$1</a>');
    
    return html;
  }, []);
  
  const htmlContent = useMemo(() => generateHtmlContent(node.content), [node.content, generateHtmlContent]);
  const htmlNote = useMemo(() => generateHtmlContent(node.note), [node.note, generateHtmlContent]);

  useEffect(() => {
    if (contentRef.current && !isInitializedRef.current) {
      contentRef.current.innerHTML = htmlContent;
      if (noteRef.current) {
        noteRef.current.innerHTML = htmlNote;
      }
      isInitializedRef.current = true;
      prevNodeIdRef.current = node.id;
    }
  }, [htmlContent, htmlNote, node.id]);

  useEffect(() => {
    if (contentRef.current && isInitializedRef.current && document.activeElement !== contentRef.current) {
      if (prevNodeIdRef.current !== node.id) {
        prevNodeIdRef.current = node.id;
        return;
      }
      contentRef.current.innerHTML = htmlContent;
    }
  }, [htmlContent, node.id]);

  useEffect(() => {
    if (noteRef.current && document.activeElement !== noteRef.current) {
      noteRef.current.innerHTML = htmlNote;
    }
  }, [htmlNote]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (collapseSyncRef.current) {
        clearTimeout(collapseSyncRef.current);
      }
    };
  }, []);

  // 监听点击外部区域关闭菜单
  useEffect(() => {
    if (!showToolbar) return;

    const handleClickOutside = (e: MouseEvent) => {
      // 原生 DOM 校验：如果点击不在菜单内，且不在触发按钮内，关闭菜单
      if (
        toolbarRef.current && !toolbarRef.current.contains(e.target as globalThis.Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as globalThis.Node)
      ) {
        setShowToolbar(false);
      }
    };

    // 使用原生捕获阶段 (capture: true)，确保在 React 合成事件之前判定，绝不吞噬正常点击
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [showToolbar]);

  useEffect(() => {
    if (shouldFocus === 'content') {
      const el = document.getElementById(`node-${node.id}`);
      if (el) {
        el.focus({ preventScroll: true });
        moveCursorToEnd(el);
        scrollIntoViewSafe(el);
      }
    } else if (shouldFocus === 'note') {
      setIsEditingNote(true);
      const el = document.getElementById(`note-${node.id}`);
      if (el) {
        el.focus({ preventScroll: true });
        scrollIntoViewSafe(el);
      }
    }
  }, [shouldFocus, node.id]);

  const scrollIntoViewSafe = (el: HTMLElement) => {
    const isMobile = window.innerWidth < 768;
    if (!isMobile) return;
    
    const toolbarHeight = 48;
    const rect = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    
    if (rect.bottom > viewportHeight - toolbarHeight) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const moveCursorToEnd = (el: HTMLElement) => {
    const selection = window.getSelection();
    if (!selection) return;
    
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    
    selection.removeAllRanges();
    selection.addRange(range);
  };

  // 从 HTML 中提取原始文本内容（保留链接格式）
  const extractTextContent = (element: HTMLElement): string => {
    let text = '';
    
    const processNode = (node: globalThis.Node) => {
      if (node.nodeType === globalThis.Node.TEXT_NODE) {
        text += node.textContent || '';
      } else if (node.nodeType === globalThis.Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.hasAttribute('data-doc-link')) {
          // 将 HTML 链接转换回 @[标题](ID) 格式
          const docId = el.getAttribute('data-doc-link');
          const docTitle = el.getAttribute('data-doc-title');
          text += `@[${docTitle}](${docId})`;
        } else if (el.hasAttribute('data-tag')) {
          text += el.textContent || '';
        } else if (el.tagName === 'A' && el.hasAttribute('data-url')) {
          text += el.getAttribute('data-url') || '';
        } else {
          // 递归处理子节点
          node.childNodes.forEach(child => processNode(child));
        }
      }
    };
    
    element.childNodes.forEach(child => processNode(child));
    return text;
  };

  const handleContentInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const textContent = extractTextContent(e.currentTarget);
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      onContentChange(node.id, textContent);
      saveTimeoutRef.current = null;
    }, 500);
  }, [node.id, onContentChange]);

  const handleNoteInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    // 不在这里调用 onNoteChange，避免触发重新渲染导致光标跳转
    // 只在 blur 时保存
  }, []);

  // @提及功能：处理选择文章
  const handleMentionSelect = useCallback((doc: Document) => {
    if (!contentRef.current || mentionStartOffset === null) return;
    
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    // 创建文章链接文本
    const linkText = `@[${doc.title || '无标题'}](${doc.id})`;
    
    // 获取当前文本内容
    const textContent = contentRef.current.textContent || '';
    
    // mentionStartOffset 是 @ 符号的位置
    // mentionSearchText 是 @ 后面的搜索文本
    const searchTextLength = mentionSearchText.length;
    const mentionEndOffset = mentionStartOffset + 1 + searchTextLength; // +1 是 @ 符号
    
    // 构建新内容：@ 之前 + 链接文本 + 搜索文本之后
    const beforeAt = textContent.substring(0, mentionStartOffset);
    const afterMention = textContent.substring(mentionEndOffset);

    // 设置新的内容
    contentRef.current.textContent = beforeAt + linkText + afterMention;
    
    // 将光标移动到链接后面
    const newOffset = beforeAt.length + linkText.length;
    const newRange = document.createRange();
    const textNode = contentRef.current.firstChild;
    
    if (textNode) {
      newRange.setStart(textNode, Math.min(newOffset, textNode.textContent?.length || 0));
      newRange.setEnd(textNode, Math.min(newOffset, textNode.textContent?.length || 0));
      selection.removeAllRanges();
      selection.addRange(newRange);
    }
    
    // 触发内容更新
    onContentChange(node.id, contentRef.current.textContent || '');
    
    // 关闭下拉框
    setShowMention(false);
    setMentionSearchText('');
    setMentionStartOffset(null);
    mentionTriggerRef.current = false;
  }, [mentionStartOffset, mentionSearchText, node.id, onContentChange]);

  // @提及功能：处理输入事件
  const handleInputForMention = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const content = e.currentTarget.textContent || '';
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const cursorOffset = range.startOffset;

    // 查找光标前最近的 @ 符号
    let atOffset = -1;
    for (let i = cursorOffset - 1; i >= 0; i--) {
      if (content[i] === '@') {
        atOffset = i;
        break;
      }
      // 如果遇到空格，停止搜索
      if (content[i] === ' ' || content[i] === '\n') {
        break;
      }
    }

    if (atOffset !== -1 && atOffset < cursorOffset) {
      // 获取 @ 后面的搜索文本
      const searchText = content.substring(atOffset + 1, cursorOffset);

      // 检查是否包含空格（如果有空格则关闭下拉框）
      if (searchText.includes(' ') || searchText.includes('\n')) {
        setShowMention(false);
        mentionTriggerRef.current = false;
        return;
      }

      setMentionSearchText(searchText);
      setMentionStartOffset(atOffset);

      // 计算下拉框位置
      const rect = range.getBoundingClientRect();
      setMentionPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX
      });

      if (!showMention) {
        setShowMention(true);
      }
    } else {
      setShowMention(false);
      mentionTriggerRef.current = false;
    }
  }, [showMention]);

  const getHeadingClass = () => {
    switch (node.heading) {
      case 'h1': return 'text-3xl font-bold heading-node';
      case 'h2': return 'text-2xl font-bold heading-node';
      case 'h3': return 'text-xl font-bold heading-node';
      case 'h4': return 'text-lg font-bold heading-node';
      default: return '';
    }
  };

  const getColorClass = () => {
    switch (node.color) {
      case 'red': return 'text-red-500';
      case 'blue': return 'text-blue-500';
      case 'green': return 'text-green-500';
      case 'purple': return 'text-purple-500';
      default: return '';
    }
  };

  const getHighlightClass = () => {
    switch (node.highlight) {
      case 'red': return 'highlight-red';
      case 'yellow': return 'highlight-yellow';
      case 'green': return 'highlight-green';
      case 'purple': return 'highlight-purple';
      case 'mint': return 'highlight-mint';
      default: return '';
    }
  };

  const getBulletMarginTop = () => {
    if (isDateNode) return 'mt-[4px]';
    switch (node.heading) {
      case 'h1': return 'mt-[12px]';
      case 'h2': return 'mt-[8px]';
      case 'h3': return 'mt-[6px]';
      case 'h4': return 'mt-[5px]';
      default: return 'mt-[4px]';
    }
  };

  // Detect date node pattern: "2026年5月26日 星期一"
  const isDateNode = node.heading === 'h1' && /^\d{4}年\d{1,2}月\d{1,2}日\s+星期[一二三四五六日]$/.test(node.content || '');

  const contentClasses = [
    'node-content outline-none leading-relaxed break-words min-h-[1.75em] py-0',
    node.is_bold && !isDateNode ? 'font-bold' : '',
    node.is_italic ? 'italic' : '',
    isDateNode ? '' : getHeadingClass(),
    getColorClass(),
    isDateNode ? '' : (node.highlight ? '' : 'flex-1 min-w-[1px]'),
    getHighlightClass(),
    isDateNode ? 'bg-gray-100 dark:bg-gray-700 rounded-full px-3 py-0.5 text-sm font-medium text-gray-700 dark:text-gray-200 w-fit' : '',
  ].filter(Boolean).join(' ');

  // 强制同步 contentEditable 元素的样式（React 对 contentEditable 的属性更新不可靠）
  useLayoutEffect(() => {
    if (contentRef.current) {
      const el = contentRef.current;
      el.className = contentClasses;
      // 直接操作 DOM style 属性，绕过 React 对 contentEditable 的渲染限制
      el.style.fontWeight = node.is_bold ? 'bold' : '';
      el.style.fontStyle = node.is_italic ? 'italic' : '';
    }
  }, [contentClasses, node.is_bold, node.is_italic, node.color, node.highlight, node.heading]);

  // Check if this node is part of a multi-selection
  const isInMultiSelection = selectedNodeIds.length > 1 && selectedNodeIds.includes(node.id);

  const handleStyleChange = (styles: Partial<Node>) => {
    if (isInMultiSelection) {
      selectedNodeIds.forEach(id => onStyleChange?.(id, styles));
    } else {
      onStyleChange?.(node.id, styles);
    }
    // 强制浏览器重绘：快速 blur + refocus contentEditable
    if (contentRef.current) {
      contentRef.current.blur();
      contentRef.current.focus();
    }
  };

  const handleColorChange = (styles: Partial<Node>) => {
    if (isInMultiSelection) {
      selectedNodeIds.forEach(id => onStyleChange?.(id, styles));
    } else {
      onStyleChange?.(node.id, styles);
    }
    // 强制浏览器重绘：快速 blur + refocus contentEditable
    if (contentRef.current) {
      contentRef.current.blur();
      contentRef.current.focus();
    }
  };

  const handleConvertToMemo = async () => {
    if (converting) return;
    setConverting(true);
    try {
      const allNodes = await getNodes(node.document_id);
      // Current node content as first line, children as list
      let content = node.content;
      const childMarkdown = nodesToMemoMarkdown(allNodes, node.id);
      if (childMarkdown.trim()) {
        content += '\n\n' + childMarkdown;
      }
      await createMemo(content);
      setShowToolbar(false);
      navigate('/');
    } catch (e) {
      console.error('转换失败', e);
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="relative">
      {/* Row Container */}
      <div
         data-node-id={node.id}
         className={`group relative flex items-start py-0 rounded-sm transition-colors ${
           isSelected ? 'bg-gray-100 dark:bg-gray-700' : ''
         } ${isDragMoving && isSelected ? 'opacity-40' : ''}`}
         onClick={(e) => {
             e.stopPropagation();

             // 【核心修复】：防止破坏同级拖拽选区
             // 当鼠标在文字处按下，在左侧小黑点等空白处松开时，会触发外层行的 click 事件。
             // 此时检测：如果用户已经在当前行内部划选了文字，直接返回，绝不强行重置光标去破坏选区！
             const selection = window.getSelection();
             if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
                 const range = selection.getRangeAt(0);
                 // 确保划选的范围是在当前这行节点内部
                 if (e.currentTarget.contains(range.commonAncestorContainer)) {
                     return;
                 }
             }

             // 如果没有选中文字（只是普通的点击空白处），则正常让输入框获取焦点并将光标移至末尾
             const el = document.getElementById(`node-${node.id}`);
             if (el) {
                 el.focus();
                 // 使用宏任务队列，确保光标移动在浏览器原生焦点初始化逻辑之后执行
                 setTimeout(() => {
                   moveCursorToEnd(el);
                   onFocus?.(node.id);
                 }, 0);
             }
         }}
      >
        {/* Bullet wrapper - relative 定位使按钮居中仅对齐内容行，不受备注高度影响 */}
        <div className={`relative flex-shrink-0 ${getBulletMarginTop()} ${!hasChildren ? 'ml-0' : ''}`}>
          {/* Edit Button - 悬停时显示 */}
          <button
            ref={triggerRef}
            onClick={(e) => {
              e.stopPropagation();
              if (!showToolbar && triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect();
                setToolbarPos({ top: rect.bottom + 4, left: rect.left });
              }
              setShowToolbar(!showToolbar);
            }}
            className={`absolute -left-10 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center z-10 transition-opacity cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 rounded ${
              showToolbar ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            title="编辑样式"
          >
            <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>

          {/* Drag Handle - 悬停时显示，拖拽移动单个节点 */}
          <div
            data-drag-handle={node.id}
            className="absolute -left-5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center z-10 transition-opacity cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 rounded select-none"
            title="拖拽移动"
          >
            <svg className="w-3 h-3 text-gray-400 pointer-events-none" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="5" cy="3" r="1.3" /><circle cx="11" cy="3" r="1.3" />
              <circle cx="5" cy="8" r="1.3" /><circle cx="11" cy="8" r="1.3" />
              <circle cx="5" cy="13" r="1.3" /><circle cx="11" cy="13" r="1.3" />
            </svg>
          </div>

          {/* Bullet Point - 点击折叠/展开 / 双击放大 / Ctrl+点击多选 */}
          <div
            className={`w-5 h-5 flex items-center justify-center z-10 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors ${
              hasChildren && localCollapsed ? 'bg-gray-200 dark:bg-gray-700' : ''
            }`}
            onClick={(e) => {
              // Ctrl/Cmd+点击：多选
              if (e.metaKey || e.ctrlKey) {
                e.stopPropagation();
                onSelect?.(node.id, true);
                return;
              }
              e.stopPropagation();
              if (hasChildren) {
                // Workflowy 模式：即时折叠/展开，无延迟，无动画
                const newCollapsed = !localCollapsed;
                setLocalCollapsed(newCollapsed);
                // Debounced 同步到后端（500ms 内连续折叠只保存最后一次）
                pendingCollapseRef.current = newCollapsed;
                if (collapseSyncRef.current) clearTimeout(collapseSyncRef.current);
                collapseSyncRef.current = setTimeout(() => {
                  if (pendingCollapseRef.current !== null) {
                    onCollapseToggle?.(node.id, pendingCollapseRef.current);
                    pendingCollapseRef.current = null;
                  }
                }, 500);
              } else {
                // 叶子节点：聚焦编辑
                const el = document.getElementById(`node-${node.id}`);
                if (el) {
                  el.focus();
                  setTimeout(() => { moveCursorToEnd(el); onFocus?.(node.id); }, 0);
                }
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onZoom?.(node.id);
            }}
          >
            <div className={`rounded-full transition-transform pointer-events-none ${
              hasChildren && localCollapsed
                ? 'w-2 h-2 bg-gray-600 dark:bg-gray-400'
                : 'w-1.5 h-1.5 bg-gray-600 dark:bg-gray-400'
            } ${node.is_completed ? 'bg-gray-400' : node.is_in_progress ? 'bg-blue-400' : ''}`}></div>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="relative">
            {/* 待办复选框 - 当节点是待办状态时显示，absolute 定位在第一行中心 */}
            {node.is_todo && (
              <span
                role="checkbox"
                aria-checked={node.is_completed || false}
                className={`absolute left-0 top-[5px] inline-flex items-center justify-center w-4 h-4 rounded-full border cursor-pointer shrink-0 transition-colors ${
                  (node.is_completed || false)
                    ? 'bg-emerald-500 border-emerald-500'
                    : (node.is_in_progress || false)
                      ? 'bg-white dark:bg-gray-700 border-blue-400'
                      : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-500'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  // 三态循环：未完成 → 进行中 → 已完成 → 未完成
                  if (node.is_completed) {
                    handleStyleChange({ is_completed: false, is_in_progress: false });
                  } else if (node.is_in_progress) {
                    handleStyleChange({ is_completed: true, is_in_progress: false });
                  } else {
                    handleStyleChange({ is_in_progress: true });
                  }
                }}
              >
                {(node.is_completed || false) ? (
                  <svg viewBox="0 0 16 16" fill="none" className="w-2.5 h-2.5 text-white" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
                  </svg>
                ) : (node.is_in_progress || false) ? (
                  <span className="w-2 h-0.5 bg-blue-400 rounded-full"></span>
                ) : null}
              </span>
            )}

            {/* 内容区域 - 支持文字+图片/附件同时显示 */}
            <div className={`flex-1 flex flex-col gap-2 ${node.is_todo ? 'pl-[22px]' : ''}`}>
              {/* 文字内容 - 始终显示（如果有内容） */}
              <div
                ref={contentRef}
                contentEditable
                className={contentClasses}
                suppressContentEditableWarning
                onFocus={() => {
                  clearSelection?.();
                  onFocus?.(node.id);
                  onStartEditing?.(node.id);
                }}
                onBlur={(e) => {
                  if (saveTimeoutRef.current) {
                    clearTimeout(saveTimeoutRef.current);
                    saveTimeoutRef.current = null;
                  }
                  const textContent = extractTextContent(e.currentTarget);
                  onContentChange(node.id, textContent);
                  if (contentRef.current) {
                    contentRef.current.innerHTML = generateHtmlContent(textContent);
                  }
                  onEndEditing?.(node.id);
                  onBlurToolbar?.();
                }}
                onKeyDown={(e) => onKeyDown(e, node, 'content')}
                onInput={(e) => {
                  handleInputForMention(e);
                  handleContentInput(e);
                }}
                onPaste={(e) => {
                  onPaste?.(e, node.id);
                }}
                id={`node-${node.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  const target = e.target as HTMLElement;
                  // 处理文章链接点击
                  if (target.hasAttribute('data-doc-link')) {
                    e.preventDefault();
                    const docId = target.getAttribute('data-doc-link');
                    if (docId) {
                      window.dispatchEvent(new CustomEvent('doc-link-click', { detail: docId }));
                      return;
                    }
                  }
                  const docLinkEl = target.closest('[data-doc-link]');
                  if (docLinkEl) {
                    e.preventDefault();
                    const docId = docLinkEl.getAttribute('data-doc-link');
                    if (docId) {
                      window.dispatchEvent(new CustomEvent('doc-link-click', { detail: docId }));
                      return;
                    }
                  }
                  // 处理标签点击
                  if (target.hasAttribute('data-tag')) {
                    const tag = target.getAttribute('data-tag');
                    if (tag) {
                      window.dispatchEvent(new CustomEvent('tag-click', { detail: tag }));
                    }
                  } else {
                    const tagEl = target.closest('[data-tag]');
                    if (tagEl) {
                      const tag = tagEl.getAttribute('data-tag');
                      if (tag) {
                        window.dispatchEvent(new CustomEvent('tag-click', { detail: tag }));
                      }
                    }
                  }
                }}
              />

              {/* 图片 - 如果有图片则显示 */}
              {node.content_type === 'image' && node.file_path && (
                <div className="relative group">
                  <img
                    src={getThumbnailUrl(node.file_path)}
                    alt={node.file_name || '图片'}
                    className="max-w-full max-h-64 rounded cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      setImageViewer({
                        isOpen: true,
                        src: getFileUrl(node.file_path),
                        alt: node.file_name || '图片'
                      });
                    }}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
                    }}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteFileDialog({ show: true, type: 'image' });
                    }}
                    className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-black/50 hover:bg-black/70 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    title="删除图片"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              {/* 附件 - 如果有附件则显示 */}
              {node.content_type === 'attachment' && node.file_path && (
                <div className="relative group inline-block">
                  <a
                    href={getFileUrl(node.file_path)}
                    download={node.file_name}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    <span className="truncate max-w-xs">{node.file_name || '附件'}</span>
                  </a>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteFileDialog({ show: true, type: 'attachment' });
                    }}
                    className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center bg-red-500 hover:bg-red-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    title="删除附件"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* @提及下拉框 */}
          {showMention && (
            <MentionDropdown
              documents={documents}
              onSelect={handleMentionSelect}
              onClose={() => {
                setShowMention(false);
                setMentionSearchText('');
                setMentionStartOffset(null);
                mentionTriggerRef.current = false;
              }}
              position={mentionPosition}
              searchText={mentionSearchText}
            />
          )}
          
          {/* Note */}
          {(node.note && node.note.trim() !== '') || isEditingNote || shouldFocus === 'note' ? (
            <div className="mt-0 leading-none">
              {(isEditingNote || shouldFocus === 'note' || !node.note) ? (
                <div
                  ref={noteRef}
                  contentEditable
                  className="node-note outline-none text-[13px] text-gray-500 dark:text-gray-400 leading-tight break-words min-h-0 py-0 pl-0"
                  suppressContentEditableWarning
                  onFocus={() => {
                    clearSelection?.();
                    setIsEditingNote(true);
                    onFocus?.(node.id);
                    onStartEditing?.(node.id);
                  }}
                  onBlur={(e) => {
                    if (saveTimeoutRef.current) {
                      clearTimeout(saveTimeoutRef.current);
                      saveTimeoutRef.current = null;
                    }
                    const content = e.currentTarget.textContent || '';
                    setIsEditingNote(false);
                    if (content.trim() === '') {
                      onNoteChange(node.id, null);
                    } else {
                      onNoteChange(node.id, content);
                    }
                    onEndEditing?.(node.id);
                    onBlurToolbar?.();
                  }}
                  onKeyDown={(e) => onKeyDown(e, node, 'note')}
                  onInput={handleNoteInput}
                  id={`note-${node.id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {node.note || ''}
                </div>
              ) : (
                <div
                  className="node-note text-[13px] text-gray-500 dark:text-gray-400 leading-tight break-words min-h-0 py-0 cursor-text"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingNote(true);
                    setTimeout(() => {
                      const el = document.getElementById(`note-${node.id}`);
                      if (el) {
                        el.focus();
                      }
                    }, 0);
                  }}
                >
                  {node.note}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Style Toolbar */}
      {showToolbar && (
        <div
          ref={toolbarRef}
          className="fixed z-[9999] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 flex flex-col gap-2 min-w-[200px]"
          style={{ top: toolbarPos.top, left: toolbarPos.left }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Batch editing indicator */}
          {isInMultiSelection && (
            <div className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded mb-1">
              批量编辑 {selectedNodeIds.length} 个节点
            </div>
          )}

          {/* Heading Buttons */}
          <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 pb-2">
            <span className="text-xs text-gray-500 mr-2">标题</span>
            <button
              onClick={() => handleStyleChange({ heading: node.heading === 'h1' ? null : 'h1' })}
              className={`px-2 py-1 text-xs rounded ${node.heading === 'h1' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
            >
              H1
            </button>
            <button
              onClick={() => handleStyleChange({ heading: node.heading === 'h2' ? null : 'h2' })}
              className={`px-2 py-1 text-xs rounded ${node.heading === 'h2' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
            >
              H2
            </button>
            <button
              onClick={() => handleStyleChange({ heading: node.heading === 'h3' ? null : 'h3' })}
              className={`px-2 py-1 text-xs rounded ${node.heading === 'h3' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
            >
              H3
            </button>
            <button
              onClick={() => handleStyleChange({ heading: node.heading === 'h4' ? null : 'h4' })}
              className={`px-2 py-1 text-xs rounded ${node.heading === 'h4' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
            >
              H4
            </button>
          </div>

          {/* Text Style Buttons */}
          <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 pb-2">
            <button
              onClick={() => handleStyleChange({ is_bold: !node.is_bold })}
              className={`px-2 py-1 text-xs font-bold rounded ${node.is_bold ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
            >
              B
            </button>
            <button
              onClick={() => handleStyleChange({ is_italic: !node.is_italic })}
              className={`px-2 py-1 text-xs italic rounded ${node.is_italic ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
            >
              I
            </button>
            <button
              onClick={() => handleStyleChange({ is_todo: !node.is_todo })}
              className={`px-2 py-1 text-xs rounded ${node.is_todo ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
            >
              待办
            </button>
          </div>

          {/* Color Buttons */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 mr-2">颜色</span>
            <button
              onClick={() => handleColorChange({ color: node.color === 'red' ? null : 'red' })}
              className={`w-6 h-6 rounded-full bg-red-500 ${node.color === 'red' ? 'ring-2 ring-offset-2 ring-red-500' : ''}`}
              title="红色"
            />
            <button
              onClick={() => handleColorChange({ color: node.color === 'blue' ? null : 'blue' })}
              className={`w-6 h-6 rounded-full bg-blue-500 ${node.color === 'blue' ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
              title="蓝色"
            />
            <button
              onClick={() => handleColorChange({ color: node.color === 'green' ? null : 'green' })}
              className={`w-6 h-6 rounded-full bg-green-500 ${node.color === 'green' ? 'ring-2 ring-offset-2 ring-green-500' : ''}`}
              title="绿色"
            />
            <button
              onClick={() => handleColorChange({ color: node.color === 'purple' ? null : 'purple' })}
              className={`w-6 h-6 rounded-full bg-purple-500 ${node.color === 'purple' ? 'ring-2 ring-offset-2 ring-purple-500' : ''}`}
              title="紫色"
            />
          </div>

          {/* Highlight Buttons */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 mr-2">高亮</span>
            <button
              onClick={() => handleColorChange({ highlight: node.highlight === 'red' ? null : 'red' })}
              className={`w-6 h-6 rounded-full border border-gray-200 ${node.highlight === 'red' ? 'ring-2 ring-offset-2 ring-red-400' : ''}`}
              style={{ backgroundColor: '#FEEBE7' }}
              title="红色高亮"
            />
            <button
              onClick={() => handleColorChange({ highlight: node.highlight === 'yellow' ? null : 'yellow' })}
              className={`w-6 h-6 rounded-full border border-gray-200 ${node.highlight === 'yellow' ? 'ring-2 ring-offset-2 ring-yellow-400' : ''}`}
              style={{ backgroundColor: '#FEFDE7' }}
              title="黄色高亮"
            />
            <button
              onClick={() => handleColorChange({ highlight: node.highlight === 'green' ? null : 'green' })}
              className={`w-6 h-6 rounded-full border border-gray-200 ${node.highlight === 'green' ? 'ring-2 ring-offset-2 ring-green-400' : ''}`}
              style={{ backgroundColor: '#EBFAF7' }}
              title="绿色高亮"
            />
            <button
              onClick={() => handleColorChange({ highlight: node.highlight === 'purple' ? null : 'purple' })}
              className={`w-6 h-6 rounded-full border border-gray-200 ${node.highlight === 'purple' ? 'ring-2 ring-offset-2 ring-purple-400' : ''}`}
              style={{ backgroundColor: '#F4EBFA' }}
              title="紫色高亮"
            />
            <button
              onClick={() => handleColorChange({ highlight: node.highlight === 'mint' ? null : 'mint' })}
              className={`w-6 h-6 rounded-full border border-gray-200 ${node.highlight === 'mint' ? 'ring-2 ring-offset-2 ring-emerald-400' : ''}`}
              style={{ backgroundColor: '#EEFAEB' }}
              title="薄荷绿高亮"
            />
          </div>

          {/* Convert to Memo */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
            <button
              onClick={handleConvertToMemo}
              disabled={converting}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors disabled:opacity-50"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              {converting ? '转换中...' : '转换为随想笔记'}
            </button>
          </div>

          {/* Close Button */}
          <button
            onClick={() => setShowToolbar(false)}
            className="mt-1 w-full py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border-t border-gray-200 dark:border-gray-700"
          >
            关闭
          </button>
        </div>
      )}

      {/* Children Container (Recursive) - 折叠时不渲染子节点，彻底从 DOM 移除 */}
      {hasChildren && !localCollapsed && (
        <div>
          <div className={`ml-[7px] pl-[25px] border-l ${isDateNode ? 'mt-[10px]' : ''}`} style={{ borderColor: 'var(--outline-guide-color, #e5e7eb)' }}>
             {childrenNodes.map(child => (
               <NodeItem
                 key={child.id}
                 node={child}
                 childrenNodes={(child as any).children}
                 documents={documents}
                 onContentChange={onContentChange}
                 onNoteChange={onNoteChange}
                 onKeyDown={onKeyDown}
                 onCompleteToggle={onCompleteToggle}
                 onCollapseToggle={onCollapseToggle}
                 onStyleChange={onStyleChange}
                 focusedNodeId={focusedNodeId}
                 onFocus={onFocus}
                 onDelete={onDelete}
                 onZoom={onZoom}
                 onPaste={onPaste}
                 selectedNodeIds={selectedNodeIds}
                 onSelect={onSelect}
                 clearSelection={clearSelection}
                 isDragMoving={isDragMoving}
               />
             ))}
          </div>
        </div>
      )}

      {/* Image Viewer */}
      <ImageViewer
        src={imageViewer.src}
        alt={imageViewer.alt}
        isOpen={imageViewer.isOpen}
        onClose={() => setImageViewer(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Delete File Confirmation */}
      <DeleteConfirmDialog
        isOpen={deleteFileDialog.show}
        title={deleteFileDialog.type === 'image' ? '删除图片' : '删除附件'}
        message={deleteFileDialog.type === 'image' ? '确定要删除这张图片吗？' : '确定要删除这个附件吗？'}
        onConfirm={() => {
          onStyleChange?.(node.id, { content_type: 'text', file_path: undefined, file_name: undefined });
          setDeleteFileDialog({ show: false, type: 'image' });
        }}
        onCancel={() => setDeleteFileDialog({ show: false, type: 'image' })}
      />
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.node === nextProps.node &&
    prevProps.childrenNodes === nextProps.childrenNodes &&
    prevProps.selectedNodeIds === nextProps.selectedNodeIds &&
    prevProps.isDragMoving === nextProps.isDragMoving &&
    prevProps.focusedNodeId?.id === nextProps.focusedNodeId?.id &&
    prevProps.focusedNodeId?.field === nextProps.focusedNodeId?.field;
});

export default NodeItem;
