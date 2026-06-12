import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getSharedDocument } from '../api/data';
import type { Node } from '../api/data';
import { ChevronRight, ChevronDown } from 'lucide-react';

const buildTree = (nodes: Node[]): (Node & { children: Node[] })[] => {
  const nodeMap = new Map<string, Node & { children: Node[] }>();
  const roots: (Node & { children: Node[] })[] = [];
  nodes.forEach(n => nodeMap.set(n.id, { ...n, children: [] }));
  nodes.forEach(n => {
    const node = nodeMap.get(n.id)!;
    if (n.parent_node_id && nodeMap.has(n.parent_node_id)) {
      nodeMap.get(n.parent_node_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  roots.sort((a, b) => a.sort_order - b.sort_order);
  nodeMap.forEach(n => n.children.sort((a, b) => a.sort_order - b.sort_order));
  return roots;
};

const BULLET_MARGIN: Record<string, string> = {
  h1: 'mt-[12px]',
  h2: 'mt-[8px]',
  h3: 'mt-[6px]',
  h4: 'mt-[5px]',
};

const SharedNode = ({ node }: { node: Node & { children: Node[] } }) => {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div className="relative flex items-start group">
        {/* 折叠按钮 - 在小圆点左边 */}
        {hasChildren && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="absolute -left-5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center cursor-pointer hover:bg-gray-100 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {collapsed ? (
              <ChevronRight className="w-3 h-3 text-gray-500" />
            ) : (
              <ChevronDown className="w-3 h-3 text-gray-500" />
            )}
          </button>
        )}

        {/* 小圆点 - 所有层级都有，与文字首行居中对齐 */}
        <div className={`w-5 h-5 flex items-center justify-center shrink-0 ${BULLET_MARGIN[node.heading || ''] || 'mt-[4px]'} ${
          hasChildren && collapsed ? 'bg-gray-200 rounded-full' : ''
        }`}>
          <div className={`rounded-full bg-gray-600 ${
            hasChildren && collapsed ? 'w-2 h-2' : 'w-1.5 h-1.5'
          }`} />
        </div>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <div className={`text-sm text-gray-800 leading-relaxed ${
            node.heading === 'h1' ? 'text-xl font-bold' :
            node.heading === 'h2' ? 'text-lg font-semibold' :
            node.heading === 'h3' ? 'text-base font-medium' :
            node.is_bold ? 'font-semibold' : ''
          } ${node.is_italic ? 'italic' : ''}`}>
            {node.is_todo && (
              <span className={`inline-block w-3.5 h-3.5 border rounded-full mr-1.5 align-middle ${
                node.is_completed ? 'bg-blue-500 border-blue-500' : 'border-gray-400'
              }`}>
                {node.is_completed && (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
            )}
            <span className={node.is_completed && !node.is_todo ? 'line-through text-gray-400' : ''}>
              {node.content || ' '}
            </span>
          </div>
          {node.note && (
            <div className="text-xs text-gray-400 mt-0.5">{node.note}</div>
          )}
        </div>
      </div>
      {/* 子节点 + 辅助线（对齐小圆点中心） */}
      {!collapsed && hasChildren && (
        <div className="ml-[10px] pl-[25px] border-l" style={{ borderColor: '#e5e7eb' }}>
          {node.children.map(child => (
            <SharedNode key={child.id} node={child} />
          ))}
        </div>
      )}
    </div>
  );
};

export default function SharePage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [title, setTitle] = useState('');
  const [tree, setTree] = useState<(Node & { children: Node[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!shareToken) return;
    setLoading(true);
    getSharedDocument(shareToken)
      .then(data => {
        setTitle(data.title);
        setTree(buildTree(data.nodes));
      })
      .catch(() => setError('分享链接无效或已失效'))
      .finally(() => setLoading(false));
  }, [shareToken]);

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-gray-400">加载中...</div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <p className="text-gray-500">{error}</p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-8 pb-4 border-b border-gray-100">
              {title}
            </h1>
            <div className="space-y-0.5">
              {tree.map(node => (
                <SharedNode key={node.id} node={node} />
              ))}
            </div>
            <div className="mt-16 pt-6 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-300">由 Beaver 分享</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
