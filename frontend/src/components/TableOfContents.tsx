import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Node } from '../api/data';

interface TocItem {
  id: string;
  content: string;
  level: 'h1' | 'h2' | 'h3' | 'h4' | 'top';
}

interface TableOfContentsProps {
  nodes: Node[];
  documentId?: string;
}

const LEVEL_INDENT: Record<string, number> = {
  h1: 0,
  h2: 12,
  h3: 24,
  h4: 36,
  top: 0,
};

const LEVEL_DASH: Record<string, string> = {
  h1: '—',
  h2: '—',
  h3: '—',
  h4: '—',
  top: '—',
};

export default function TableOfContents({ nodes, documentId }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const rafRef = useRef<number>(0);

  // Reset closed state when switching documents
  const prevDocRef = useRef(documentId);
  if (prevDocRef.current !== documentId) {
    prevDocRef.current = documentId;
    if (closed) setClosed(false);
  }

  const tocItems = useMemo(() => {
    const headingNodes = nodes.filter(n => n.heading && n.content.trim());
    if (headingNodes.length > 0) {
      return headingNodes.map(n => ({
        id: n.id,
        content: n.content,
        level: n.heading as 'h1' | 'h2' | 'h3' | 'h4',
      }));
    }
    return nodes
      .filter(n => !n.parent_node_id && n.content.trim())
      .map(n => ({ id: n.id, content: n.content, level: 'top' as const }));
  }, [nodes]);

  // Scroll-based tracking
  useEffect(() => {
    if (tocItems.length === 0) return;

    const scrollContainer = document.querySelector('.main-content-area');
    if (!scrollContainer) return;

    const update = () => {
      const containerRect = scrollContainer.getBoundingClientRect();
      const threshold = containerRect.top + containerRect.height * 0.2;

      let bestId: string | null = null;
      let bestTop = -Infinity;

      for (const item of tocItems) {
        const el = document.querySelector(`[data-node-id="${item.id}"]`);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= threshold && rect.top > bestTop) {
          bestTop = rect.top;
          bestId = item.id;
        }
      }

      if (!bestId && tocItems.length > 0) {
        bestId = tocItems[0].id;
      }

      if (bestId) {
        setActiveId(bestId);
      }
    };

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };

    scrollContainer.addEventListener('scroll', onScroll, { passive: true });
    update();

    return () => {
      scrollContainer.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [tocItems]);

  const scrollToHeading = useCallback((id: string) => {
    const el = document.getElementById(`node-${id}`);
    if (!el) return;

    const scrollContainer = document.querySelector('.main-content-area');
    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const scrollTop = scrollContainer.scrollTop;
      const targetTop = scrollTop + elRect.top - containerRect.top - 80;
      scrollContainer.scrollTo({ top: targetTop, behavior: 'smooth' });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  if (tocItems.length === 0 || closed) return null;

  return (
    <nav
      className="fixed top-14 right-4 z-30 w-[180px] max-h-[70vh] hidden lg:block"
    >
      <div
        className="toc-glass overflow-hidden flex flex-col"
        style={{
          background: 'rgba(255,255,255,0.5)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100/60 dark:border-gray-700/40 shrink-0">
          <span className="text-xs text-gray-400 dark:text-gray-500">目录</span>
          <button
            onClick={() => setClosed(true)}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200/60 dark:hover:bg-gray-600/40 transition-colors"
            title="关闭目录"
          >
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Items */}
        <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
          {tocItems.map((item) => {
            const isActive = activeId === item.id;
            return (
              <button
                key={item.id}
                onClick={() => scrollToHeading(item.id)}
                className={`w-full text-left text-[13px] leading-snug py-1 px-2 transition-all duration-150 truncate border-l-2 ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400 border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 font-medium'
                    : 'text-gray-400 dark:text-gray-500 border-transparent hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50/60 dark:hover:bg-gray-800/40'
                }`}
                style={{ paddingLeft: `${8 + LEVEL_INDENT[item.level]}px` }}
                title={item.content}
              >
                <span className="text-gray-300 dark:text-gray-600 mr-0.5 inline-block scale-x-[0.33]">{LEVEL_DASH[item.level]}</span>
                {item.content.length > 12 ? item.content.slice(0, 12) + '...' : item.content}
              </button>
            );
          })}
        </div>
      </div>

      <style>{`
        .dark .toc-glass { background: rgba(30,32,38,0.5) !important; }
      `}</style>
    </nav>
  );
}
