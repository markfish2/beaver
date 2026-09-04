import { startTransition, useEffect, useRef, useState } from 'react';
import { analyzeMarkdownNote, type MarkdownNoteAnalysis } from '../utils/markdownNoteAnalysis';

interface MarkdownAnalysisResponse {
  requestId: number;
  analysis: Omit<MarkdownNoteAnalysis, 'source'>;
}

const EMPTY_ANALYSIS = analyzeMarkdownNote('');

/**
 * Keep Markdown-derived data off the input/render path. The last completed
 * snapshot remains visible while a newer snapshot is analyzed in a worker.
 */
export function useMarkdownAnalysis(content: string) {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const [analysis, setAnalysis] = useState<MarkdownNoteAnalysis>(EMPTY_ANALYSIS);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    let cancelled = false;
    let worker = workerRef.current;

    const applyFallback = () => {
      if (cancelled || requestId !== requestIdRef.current) return;
      const nextAnalysis = analyzeMarkdownNote(content);
      startTransition(() => setAnalysis(nextAnalysis));
    };

    if (typeof Worker === 'undefined') {
      applyFallback();
      return;
    }

    if (!worker) {
      try {
        worker = new Worker(new URL('../workers/markdownNoteAnalysis.worker.ts', import.meta.url), { type: 'module' });
        workerRef.current = worker;
      } catch {
        applyFallback();
        return;
      }
    }

    const handleMessage = (event: MessageEvent<MarkdownAnalysisResponse>) => {
      if (cancelled || event.data.requestId !== requestId || requestId !== requestIdRef.current) return;
      startTransition(() => setAnalysis({ source: content, ...event.data.analysis }));
    };
    const handleError = () => {
      worker?.removeEventListener('message', handleMessage);
      worker?.removeEventListener('error', handleError);
      worker?.terminate();
      workerRef.current = null;
      applyFallback();
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    worker.postMessage({ requestId, content });

    return () => {
      cancelled = true;
      worker?.removeEventListener('message', handleMessage);
      worker?.removeEventListener('error', handleError);
    };
  }, [content]);

  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  return {
    sourceContent: analysis.source,
    processedContent: analysis.processedContent,
    renderedHeadings: analysis.renderedHeadings,
    tocItems: analysis.tocItems,
    blocks: analysis.blocks,
    allTags: analysis.tags,
    isPending: analysis.source !== content,
  };
}
