import { useState, useRef, useEffect } from 'react';
import { createDocument, createTodo } from '../../api/data';
import { useDocuments } from '../../context/DocumentContext';
import DocumentTypeIcon, { type DocumentIconType } from '../DocumentTypeIcon';
import NavigationIcon from '../NavigationIcon';

interface NewMenuPopupProps {
  onClose: () => void;
  onDocumentCreated: (id: string, type: string) => void;
}

export default function NewMenuPopup({ onClose, onDocumentCreated }: NewMenuPopupProps) {
  const { addDocument } = useDocuments();
  const [showInputDialog, setShowInputDialog] = useState(false);
  const [inputType, setInputType] = useState<string>('');
  const [inputText, setInputText] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const closeMenu = () => {
    if (isClosing) return;
    setIsClosing(true);
    window.setTimeout(onClose, 180);
  };

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
    { type: 'document', label: '大纲笔记', iconType: 'document' as DocumentIconType },
    { type: 'note', label: '普通笔记', iconType: 'note' as DocumentIconType },
    { type: 'todo', label: '待办', navigationIcon: 'todo' as const },
    { type: 'folder', label: '文件夹', iconType: 'folder' as DocumentIconType },
  ];

  if (showInputDialog) {
    return (
      <div className="fixed inset-0 z-[10000] flex items-end" onClick={() => { setShowInputDialog(false); setInputText(''); }}>
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
    <div className={`fixed inset-0 z-[10000] transition-opacity duration-200 ${isClosing ? 'opacity-0' : 'opacity-100'}`} onClick={closeMenu}>
      <div
        className={`absolute bottom-[calc(16px+env(safe-area-inset-bottom,0px)+64px)] left-[max(4vw,calc(50%_-_215px))] flex flex-col-reverse items-start gap-2 transition-[transform,opacity] duration-200 ease-out ${isClosing ? 'translate-y-3 scale-95 opacity-0' : 'translate-y-0 scale-100 opacity-100'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {menuItems.map((item, index) => (
          <button
            key={item.type}
            onClick={() => handleCreate(item.type)}
            style={{ animationDelay: `${index * 45}ms` }}
            className={`flex h-10 min-w-[132px] animate-in slide-in-from-bottom-2 fade-in items-center justify-center gap-2 rounded-full border border-white/60 bg-white/75 px-4 text-sm text-gray-700 shadow-[0_4px_16px_-6px_rgba(15,23,42,0.35)] backdrop-blur-xl backdrop-saturate-150 transition-colors duration-150 hover:bg-white/90 dark:border-white/10 dark:bg-gray-800/75 dark:text-gray-200 dark:hover:bg-gray-800/90 ${isClosing ? 'animate-out fade-out slide-out-to-bottom-2' : ''}`}
          >
            {'iconType' in item
              ? <DocumentTypeIcon type={item.iconType} className="h-5 w-5" />
              : <NavigationIcon type={item.navigationIcon} className="h-5 w-5" />}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
