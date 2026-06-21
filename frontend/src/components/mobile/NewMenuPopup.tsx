import { useState, useRef, useEffect } from 'react';
import { ListTree, FileText, Square, Folder, X } from 'lucide-react';
import { createDocument, createTodo } from '../../api/data';
import { useDocuments } from '../../context/DocumentContext';

interface NewMenuPopupProps {
  onClose: () => void;
  onDocumentCreated: (id: string, type: string) => void;
}

export default function NewMenuPopup({ onClose, onDocumentCreated }: NewMenuPopupProps) {
  const { addDocument } = useDocuments();
  const [showInputDialog, setShowInputDialog] = useState(false);
  const [inputType, setInputType] = useState<string>('');
  const [inputText, setInputText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showInputDialog && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInputDialog]);

  const handleCreate = async (type: string) => {
    if (type === 'todo' || type === 'folder') {
      setInputType(type);
      setInputText('');
      setShowInputDialog(true);
      return;
    }

    try {
      const title = type === 'document' ? '新文章' : '新笔记';
      const doc = await createDocument(title, type);
      addDocument(doc);
      onDocumentCreated(doc.id, type);
    } catch (error) {
      console.error('Failed to create document:', error);
    }
  };

  const handleConfirmInput = async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;

    try {
      if (inputType === 'todo') {
        await createTodo(trimmed);
        setShowInputDialog(false);
        setInputText('');
        onClose();
      } else if (inputType === 'folder') {
        const doc = await createDocument(trimmed, 'folder');
        addDocument(doc);
        setShowInputDialog(false);
        setInputText('');
        onDocumentCreated(doc.id, 'folder');
      }
    } catch (error) {
      console.error('Failed to create:', error);
    }
  };

  const menuItems = [
    { type: 'document', label: '大纲笔记', icon: ListTree, color: 'text-emerald-600 dark:text-emerald-400' },
    { type: 'note', label: '普通笔记', icon: FileText, color: 'text-blue-600 dark:text-blue-400' },
    { type: 'todo', label: '待办', icon: Square, color: 'text-orange-600 dark:text-orange-400' },
    { type: 'folder', label: '文件夹', icon: Folder, color: 'text-yellow-600 dark:text-yellow-400' },
  ];

  if (showInputDialog) {
    return (
      <div className="fixed inset-0 z-50 flex items-end" onClick={() => { setShowInputDialog(false); setInputText(''); }}>
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
        <div
          className="relative w-full bg-white dark:bg-gray-900 shadow-xl border-t border-gray-200 dark:border-gray-700 p-4 pb-8"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 max-w-lg mx-auto">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmInput(); if (e.key === 'Escape') { setShowInputDialog(false); setInputText(''); } }}
              placeholder={inputType === 'todo' ? '新建待办...' : '文件夹名称...'}
              className="flex-1 px-4 py-2.5 text-base bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 placeholder-gray-400 text-gray-800 dark:text-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              autoFocus
            />
            <button
              onClick={handleConfirmInput}
              disabled={!inputText.trim()}
              className="w-10 h-10 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 rounded-lg"
            >
              <span className="text-xl leading-none">+</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-64 py-2 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 mb-1">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">新建</span>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {menuItems.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.type}
              onClick={() => handleCreate(item.type)}
              className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
            >
              <Icon className={`w-4.5 h-4.5 ${item.color}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
