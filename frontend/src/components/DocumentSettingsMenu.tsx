import { useState, useRef, useEffect } from 'react';
import { Settings2, Download, Share2, Palette, X } from 'lucide-react';
import type { Node } from '../api/data';
import { FontSettingsPanel, useFontSettings } from './FontSettings';
import ShareDialog from './ShareDialog';

interface DocumentSettingsMenuProps {
  nodes: Node[];
  currentDoc: { id: string; title: string } | null;
  generateMarkdownPreview: (nodes: Node[]) => string;
  fontSettings: ReturnType<typeof useFontSettings>;
}

export default function DocumentSettingsMenu({
  nodes,
  currentDoc,
  generateMarkdownPreview,
  fontSettings,
}: DocumentSettingsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [activeSection, setActiveSection] = useState<'main' | 'theme'>('main');
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close menu on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setActiveSection('main');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleDownload = () => {
    if (currentDoc) {
      const markdown = generateMarkdownPreview(nodes);
      // Trigger download
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentDoc.title || 'document'}.md`;
      a.click();
      URL.revokeObjectURL(url);
      setIsOpen(false);
    }
  };

  const handleShare = () => {
    setShowShareDialog(true);
    setIsOpen(false);
  };

  const handleThemeClick = () => {
    setActiveSection('theme');
  };

  return (
    <>
      <div className="relative">
        <button
          ref={buttonRef}
          onClick={() => {
            setIsOpen(!isOpen);
            setActiveSection('main');
          }}
          className="p-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
          title="文档设置"
        >
          <Settings2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>

        {isOpen && (
          <div
            ref={menuRef}
            className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-[9999] overflow-hidden"
          >
            {activeSection === 'main' ? (
              /* Main menu */
              <div className="py-2">
                <button
                  onClick={handleDownload}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Download className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <span>导出 Markdown</span>
                </button>
                <button
                  onClick={handleShare}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Share2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <span>分享文档</span>
                </button>
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                <button
                  onClick={handleThemeClick}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Palette className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <span>主题风格</span>
                  <svg className="w-4 h-4 ml-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            ) : (
              /* Theme settings submenu */
              <div className="p-4 max-h-[70vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={() => setActiveSection('main')}
                    className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    返回
                  </button>
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      setActiveSection('main');
                    }}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
                <FontSettingsPanel {...fontSettings} isOpen={true} setIsOpen={() => {}} hideButton={true} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Share Dialog */}
      {currentDoc && (
        <ShareDialog
          isOpen={showShareDialog}
          documentId={currentDoc.id}
          onCancel={() => setShowShareDialog(false)}
        />
      )}
    </>
  );
}
