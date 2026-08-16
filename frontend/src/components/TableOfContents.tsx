import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

const LEVEL_INDENT: Record<TocItem['level'], number> = {
  h1: 0,
  h2: 12,
  h3: 24,
  h4: 36,
  top: 0,
};

export default function TableOfContents({ nodes, documentId }: TableOfContentsProps) {
  const [, setActiveId] = useState<string | null>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });
  const [visibleRail, setVisibleRail] = useState({ top: 0, height: 0 });
  const [closedDocumentId, setClosedDocumentId] = useState<string | null>(null);
  const rafRef = useRef<number>(0);
  const tocListRef = useRef<HTMLDivElement>(null);
  const tocItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const documentKey = documentId ?? '__default__';
  const closed = closedDocumentId === documentKey;

  const tocItemsSignature = nodes.map(n => `${n.id}\u001f${n.heading ?? ''}\u001f${n.content}\u001f${n.parent_node_id ?? ''}`).join('\u001e');
  // The signature captures every node field used below while keeping the array stable
  // when MainArea creates a new sorted array with unchanged content.
  const tocItems = useMemo<TocItem[]>(() => {
    const headingNodes = nodes.filter(n => n.heading && n.content.trim());
    return headingNodes.length > 0
      ? headingNodes.map(n => ({
          id: n.id,
          content: n.content,
          level: n.heading as TocItem['level'],
        }))
      : nodes
          .filter(n => !n.parent_node_id && n.content.trim())
          .map(n => ({ id: n.id, content: n.content, level: 'top' }));
  // tocItemsSignature contains all node fields read by the builder.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocItemsSignature]);

  useEffect(() => {
    const list = tocListRef.current;
    const first = tocItemRefs.current[tocItems[visibleRange.start]?.id];
    const last = tocItemRefs.current[tocItems[visibleRange.end]?.id];
    if (!list || !first || !last) return;
    const next = {
      top: first.offsetTop,
      height: Math.max(1, last.offsetTop + last.offsetHeight - first.offsetTop),
    };
    setVisibleRail(previous => previous.top === next.top && previous.height === next.height ? previous : next);
  }, [tocItems, visibleRange]);

  useEffect(() => {
    const list = tocListRef.current;
    const first = tocItemRefs.current[tocItems[visibleRange.start]?.id];
    const last = tocItemRefs.current[tocItems[visibleRange.end]?.id];
    if (!list || !first || !last) return;
    const viewportTop = list.scrollTop;
    const viewportBottom = viewportTop + list.clientHeight;
    const rangeTop = first.offsetTop;
    const rangeBottom = last.offsetTop + last.offsetHeight;
    if (rangeTop < viewportTop) {
      first.scrollIntoView({ block: 'nearest' });
    } else if (rangeBottom > viewportBottom) {
      last.scrollIntoView({ block: 'nearest' });
    }
  }, [tocItems, visibleRange]);

  // Scroll-based tracking
  useEffect(() => {
    if (tocItems.length === 0) return;

    const scrollContainer = document.querySelector('.outline-content-scroll-area');
    if (!scrollContainer) return;

    const update = () => {
      const containerRect = scrollContainer.getBoundingClientRect();
      const threshold = containerRect.top + containerRect.height * 0.2;

      let bestId: string | null = null;
      let bestTop = -Infinity;
      let firstVisible = -1;
      let lastVisible = -1;

      for (const [index, item] of tocItems.entries()) {
        const el = document.querySelector(`[data-node-id="${item.id}"]`);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
          if (firstVisible === -1) firstVisible = index;
          lastVisible = index;
        }
        if (rect.top <= threshold && rect.top > bestTop) {
          bestTop = rect.top;
          bestId = item.id;
        }
      }

      if (!bestId && tocItems.length > 0) {
        bestId = tocItems[0].id;
      }

      if (bestId) {
        setActiveId(previous => previous === bestId ? previous : bestId);
      }
      if (firstVisible !== -1) {
        setVisibleRange(previous => (
          previous.start === firstVisible && previous.end === lastVisible
            ? previous
            : { start: firstVisible, end: lastVisible }
        ));
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

    const scrollContainer = document.querySelector('.outline-content-scroll-area');
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
      className="toc-responsive w-[240px] shrink-0 px-3 py-4"
    >
      <div className="sticky top-4 max-h-[calc(100vh-7rem)] overflow-hidden flex flex-col text-gray-600 dark:text-gray-300">
        {/* Header */}
        <div className="flex items-center justify-between px-2 py-1.5 shrink-0">
          <span className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <svg className="h-4 w-4 text-gray-500 dark:text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M5 6h14M5 12h14M5 18h14" />
            </svg>
            目录
          </span>
          <button
            onClick={() => setClosedDocumentId(documentKey)}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200/60 dark:hover:bg-gray-600/40 transition-colors"
            title="关闭目录"
          >
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Items */}
        <div ref={tocListRef} className="relative flex-1 overflow-y-auto custom-scrollbar py-0.5 pl-2">
          <div className="absolute left-[10px] top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
          {visibleRange.end >= visibleRange.start && (
            <div
              className="pointer-events-none absolute left-[10px] z-20 w-px bg-[#46745b] dark:bg-[#8fc5a5]"
              style={{ top: visibleRail.top, height: visibleRail.height }}
              aria-hidden="true"
            >
              <span className="absolute left-1/2 bottom-[-2px] h-1 w-1 -translate-x-1/2 rounded-full bg-[#46745b] dark:bg-[#8fc5a5]" />
            </div>
          )}
          {tocItems.map((item, index) => {
            return (
              <button
                key={item.id}
                ref={(element) => { tocItemRefs.current[item.id] = element; }}
                onClick={() => scrollToHeading(item.id)}
                className={`relative z-10 w-full text-left leading-tight py-1 pr-2 pl-5 transition-all duration-150 truncate ${
                  index >= visibleRange.start && index <= visibleRange.end
                    ? 'text-[#46745b] dark:text-[#8fc5a5] font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
                style={{ paddingLeft: `${20 + LEVEL_INDENT[item.level]}px`, fontSize: '13px' }}
                title={item.content}
              >
                {item.content}
              </button>
            );
          })}
        </div>
      </div>

      <style>{`
      `}</style>
    </nav>
  );
}
