import { analyzeMarkdownNote, type MarkdownNoteAnalysis } from '../utils/markdownNoteAnalysis';

interface MarkdownAnalysisRequest {
  requestId: number;
  content: string;
}

interface MarkdownAnalysisResponse {
  requestId: number;
  analysis: Omit<MarkdownNoteAnalysis, 'source'>;
}

interface MarkdownAnalysisWorkerScope {
  onmessage: ((event: MessageEvent<MarkdownAnalysisRequest>) => void) | null;
  postMessage: (message: MarkdownAnalysisResponse) => void;
}

const workerScope = self as unknown as MarkdownAnalysisWorkerScope;

workerScope.onmessage = (event) => {
  const { requestId, content } = event.data;
  const analysis = analyzeMarkdownNote(content);
  workerScope.postMessage({
    requestId,
    analysis: {
      processedContent: analysis.processedContent,
      renderedHeadings: analysis.renderedHeadings,
      tocItems: analysis.tocItems,
      blocks: analysis.blocks,
      tags: analysis.tags,
    },
  });
};

export {};
