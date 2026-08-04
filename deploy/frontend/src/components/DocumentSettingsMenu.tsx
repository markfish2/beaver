import { useState } from 'react';
import { Download, Share2 } from 'lucide-react';
import type { Node } from '../api/data';
import ShareDialog from './ShareDialog';

interface DocumentSettingsMenuProps {
  nodes: Node[];
  currentDoc: { id: string; title: string } | null;
  generateMarkdownPreview: (nodes: Node[]) => string;
}

// 文档级动作固定展示在标题栏；主题属于账号外观设置，不再混入文档菜单。
export default function DocumentSettingsMenu({
  nodes,
  currentDoc,
  generateMarkdownPreview,
}: DocumentSettingsMenuProps) {
  const [showShareDialog, setShowShareDialog] = useState(false);

  const handleDownload = () => {
    if (!currentDoc) return;
    const markdown = generateMarkdownPreview(nodes);
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${currentDoc.title || 'document'}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <button
        onClick={handleDownload}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
        title="导出 Markdown"
      >
        <Download className="h-4 w-4" />
        <span className="hidden lg:inline">导出</span>
      </button>
      <button
        onClick={() => setShowShareDialog(true)}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
        title="分享文档"
      >
        <Share2 className="h-4 w-4" />
        <span className="hidden lg:inline">分享</span>
      </button>
      {currentDoc && (
        <ShareDialog
          key={`${currentDoc.id}-${showShareDialog}`}
          isOpen={showShareDialog}
          documentId={currentDoc.id}
          onCancel={() => setShowShareDialog(false)}
        />
      )}
    </>
  );
}
