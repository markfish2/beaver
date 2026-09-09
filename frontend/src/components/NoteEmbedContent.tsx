import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { FileText, StickyNote, ListTree, ArrowUpRight } from 'lucide-react';
import { getDocument, getNodes } from '../api/data';
import type { Node, Memo } from '../api/data';
import api from '../api/client';

interface NoteEmbedContentProps {
  noteId: string;
  noteType: string;
  title?: string;
}

type EmbedTreeNode = Node & { children: EmbedTreeNode[] };

// 树形节点渲染（大纲笔记）
function OutlinePreview({ nodes, maxDepth = 2 }: { nodes: Node[]; maxDepth?: number }) {
  const renderNode = (node: EmbedTreeNode, depth: number): React.ReactNode => {
    if (depth > maxDepth) return null;
    return (
      <div key={node.id} style={{ paddingLeft: depth * 12 }}>
        <div className="flex items-start gap-1 py-0.5">
          <span className="text-gray-400 text-[10px] mt-0.5">•</span>
          <span className="text-[11px] text-gray-700 dark:text-gray-300 leading-tight">
            {node.is_todo && (
              <span className="mr-1">{node.is_completed ? '☑' : '☐'}</span>
            )}
            {node.content || '(空)'}
          </span>
        </div>
        {node.children?.map(child => renderNode(child, depth + 1))}
      </div>
    );
  };

  const tree = buildTree(nodes);
  return <div className="py-1">{tree.map(n => renderNode(n, 0))}</div>;
}

function buildTree(nodes: Node[]): EmbedTreeNode[] {
  const map = new Map<string, EmbedTreeNode>();
  const roots: EmbedTreeNode[] = [];
  for (const n of nodes) {
    map.set(n.id, { ...n, children: [] });
  }
  for (const n of nodes) {
    const node = map.get(n.id)!;
    if (n.parent_node_id && map.has(n.parent_node_id)) {
      map.get(n.parent_node_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

// Markdown 预览（memo / note）— 使用 memo-content 样式 + zoom 缩放（不失真）
function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="memo-content text-gray-700 dark:text-gray-300"
         style={{ fontSize: '12px', lineHeight: '1.6', zoom: 0.85 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default function NoteEmbedContent({ noteId, noteType, title: propTitle }: NoteEmbedContentProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(propTitle || '');
  const [content, setContent] = useState('');
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError('');

        if (noteType === 'memo') {
          // memo: 通过 API 获取单条 memo
          const res = await api.get<Memo>(`/memos/${noteId}`);
          if (cancelled) return;
          setTitle('随想');
          setContent(res.data.content || '');
        } else if (noteType === 'note') {
          // 普通笔记
          const doc = await getDocument(noteId);
          if (cancelled) return;
          setTitle(doc.title || '笔记');
          // 获取节点内容作为预览
          const allNodes = await getNodes(noteId);
          if (cancelled) return;
          const text = allNodes.map(n => n.content).filter(Boolean).join('\n');
          setContent(text);
        } else {
          // 大纲笔记
          const doc = await getDocument(noteId);
          if (cancelled) return;
          setTitle(doc.title || '文档');
          const allNodes = await getNodes(noteId);
          if (cancelled) return;
          setNodes(allNodes);
        }
      } catch {
        if (!cancelled) setError('加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [noteId, noteType]);

  const icon = noteType === 'memo'
    ? <StickyNote className="w-3 h-3" />
    : noteType === 'note'
      ? <FileText className="w-3 h-3" />
      : <ListTree className="w-3 h-3" />;

  const typeLabel = noteType === 'memo' ? '随想' : noteType === 'note' ? '笔记' : '大纲';

  // 标题栏颜色：memo=琥珀, note=蓝, document=绿
  const headerBg = noteType === 'memo'
    ? 'bg-amber-50 dark:bg-amber-900/30'
    : noteType === 'note'
      ? 'bg-blue-50 dark:bg-blue-900/30'
      : 'bg-emerald-50 dark:bg-emerald-900/30';
  const headerBorder = noteType === 'memo'
    ? 'border-amber-200 dark:border-amber-800'
    : noteType === 'note'
      ? 'border-blue-200 dark:border-blue-800'
      : 'border-emerald-200 dark:border-emerald-800';
  const tagBg = noteType === 'memo'
    ? 'bg-amber-200 dark:bg-amber-800 text-amber-700 dark:text-amber-300'
    : noteType === 'note'
      ? 'bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300'
      : 'bg-emerald-200 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-300';

  return (
    <div className="w-full h-full bg-white dark:bg-gray-900 overflow-hidden flex flex-col
                    border border-gray-200 dark:border-gray-700 shadow-sm pointer-events-none select-none"
         style={{ contain: 'strict', willChange: 'transform', borderRadius: '5px' }}>
      {/* 标题栏 */}
      <div className={`flex items-center gap-1.5 px-2 py-1.5 ${headerBg} ${headerBorder} border-b shrink-0`}>
        <span className="text-gray-600 dark:text-gray-300">{icon}</span>
        <span className="text-[11px] font-medium text-gray-800 dark:text-gray-200 truncate flex-1">
          {title}
        </span>
        <span className={`text-[9px] px-1 py-0.5 rounded-sm ${tagBg}`}>
          {typeLabel}
        </span>
        <button
          className="pointer-events-auto p-0.5 rounded-sm hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            if (noteType === 'memo') {
              navigate(`/?highlight=${noteId}`);
            } else {
              navigate(`/d/${noteId}`);
            }
          }}
          title="打开笔记"
        >
          <ArrowUpRight size={12} className="text-gray-500 dark:text-gray-400" />
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-hidden px-2 py-1.5">
        {loading ? (
          <div className="text-[10px] text-gray-400">加载中...</div>
        ) : error ? (
          <div className="text-[10px] text-red-400">{error}</div>
        ) : noteType === 'document' ? (
          <OutlinePreview nodes={nodes} />
        ) : (
          <MarkdownPreview content={content} />
        )}
      </div>
    </div>
  );
}
