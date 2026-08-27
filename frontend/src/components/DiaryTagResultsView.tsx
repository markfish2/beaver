import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CalendarDays } from 'lucide-react';
import { getDiaryTagResults } from '../api/data';
import { updateNode } from '../api/data';
import type { DiaryTagResult, Node } from '../api/data';

interface DiaryTagResultsViewProps {
  tag: string;
  onClear: () => void;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function renderDiaryText(value: string): string {
  return escapeHtml(value).replace(
    /(#[a-zA-Z0-9_\u4e00-\u9fa5]+)/g,
    '<span class="text-[var(--app-link)] bg-[var(--app-link-pale)] rounded px-1" data-diary-tag="$1">$1</span>'
  );
}

function DiaryEditableNode({ node, depth }: { node: Node; depth: number }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const editingRef = useRef(false);

  useEffect(() => {
    if (contentRef.current && !editingRef.current) contentRef.current.innerHTML = renderDiaryText(node.content || '');
    if (noteRef.current && !editingRef.current) noteRef.current.innerHTML = renderDiaryText(node.note || '');
  }, [node.content, node.note]);

  const save = async (field: 'content' | 'note', element: HTMLDivElement) => {
    editingRef.current = false;
    const value = element.innerText.replace(/\u00a0/g, ' ');
    const currentValue = field === 'content' ? node.content : node.note;
    if (value === (currentValue || '')) return;
    try {
      await updateNode(node.id, field === 'content' ? { content: value } : { note: value });
    } catch {
      element.innerHTML = renderDiaryText(currentValue || '');
    }
  };

  return (
    <div className="relative" style={{ marginLeft: `${depth * 28}px` }}>
      <div className="flex items-start py-0">
        <div className="relative mt-[4px] flex shrink-0 items-center justify-center">
          <span className="flex h-5 w-5 items-center justify-center"><span className="h-1.5 w-1.5 rounded-full bg-gray-600 dark:bg-gray-400" /></span>
        </div>
        <div className="relative min-w-0 flex-1">
          {node.is_todo && (
            <span className={`absolute left-0 top-[5px] z-10 inline-flex h-4 w-4 items-center justify-center rounded-full border ${node.is_completed ? 'border-[var(--app-link)] bg-[var(--app-link)] text-white' : 'border-gray-300 dark:border-gray-600'}`}>
              {node.is_completed && <span className="text-[10px] leading-none">✓</span>}
            </span>
          )}
          <div className={`min-w-0 ${node.is_todo ? 'pl-[22px]' : ''}`}>
            <div
              ref={contentRef}
              contentEditable
              suppressContentEditableWarning
              onFocus={() => { editingRef.current = true; }}
              onBlur={(event) => { void save('content', event.currentTarget); }}
              className="min-h-[1.75em] whitespace-pre-wrap break-words leading-relaxed text-gray-700 outline-none dark:text-gray-200"
            />
            {node.note && (
              <div
                ref={noteRef}
                contentEditable
                suppressContentEditableWarning
                onFocus={() => { editingRef.current = true; }}
                onBlur={(event) => { void save('note', event.currentTarget); }}
                className="text-xs text-gray-400 outline-none"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DiaryTagResultsView({ tag, onClear }: DiaryTagResultsViewProps) {
  const [items, setItems] = useState<DiaryTagResult[]>([]);
  const [loadedTag, setLoadedTag] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getDiaryTagResults(tag).then((data) => {
      if (!cancelled) {
        setItems(data);
        setLoadedTag(tag);
      }
    }).catch(() => {
      if (!cancelled) {
        setItems([]);
        setLoadedTag(tag);
      }
    });
    return () => { cancelled = true; };
  }, [tag]);

  const loading = loadedTag !== tag;

  return (
    <div className="mx-auto max-w-[900px] px-8 py-8 md:ml-16 md:mr-auto">
      <div className="mb-6 flex items-center gap-2 text-lg font-medium text-gray-700 dark:text-gray-200">
        <CalendarDays className="h-5 w-5 text-[var(--app-link)]" />
        {tag} · 跨月份日记
        <button
          type="button"
          onClick={onClear}
          className="ml-1 rounded-full px-2 py-0.5 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          aria-label="清除标签筛选"
        >
          ×
        </button>
      </div>
      {loading && <div className="text-sm text-gray-400">加载中...</div>}
      {!loading && items.length === 0 && <div className="text-sm text-gray-400">没有找到匹配的日记节点</div>}
      <div className="space-y-6">
        {!loading && items.map((item) => (
          <section key={item.document_id}>
            {item.date_nodes.map((dateNode) => {
              const children = item.nodes.filter(node => node.parent_node_id === dateNode.id);
              const renderNode = (node: typeof item.nodes[number], depth: number): ReactNode => (
                <div key={node.id}>
                  <DiaryEditableNode node={node} depth={depth} />
                  {item.nodes.filter(child => child.parent_node_id === node.id).map(child => renderNode(child, depth + 1))}
                </div>
              );
              return (
                <div key={dateNode.id} className="mb-5">
                  <div className="flex items-start py-0">
                    <div className="mt-[4px] flex h-5 w-5 shrink-0 items-center justify-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-600 dark:bg-gray-400"> </span>
                    </div>
                    <div className="inline-flex min-h-[1.75em] items-center rounded-full bg-gray-100 px-3 py-0.5 text-sm font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                      {dateNode.content}
                    </div>
                  </div>
                  <div className="ml-[10px] border-l border-gray-200 pl-3 dark:border-gray-700">
                    {children.map(node => renderNode(node, 0))}
                    {children.length === 0 && item.nodes.filter(node => !node.parent_node_id).map(node => renderNode(node, 0))}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
