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
  const [showTodoDialog, setShowTodoDialog] = useState(false);
  const [todoText, setTodoText] = useState('');
  const todoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showTodoDialog && todoInputRef.current) {
      todoInputRef.current.focus();
    }
  }, [showTodoDialog]);

  const handleCreate = async (type: string) => {
    try {
      if (type === 'todo') {
        setShowTodoDialog(true);
        return;
      }

      let doc;
      switch (type) {
        case 'document':
          doc = await createDocument('新文章', 'document');
          break;
        case 'note':
          doc = await createDocument('新笔记', 'note');
          break;
        case 'folder':
          doc = await createDocument('新文件夹', 'folder');
          break;
        default:
          return;
      }
      addDocument(doc);
      onDocumentCreated(doc.id, type);
    } catch (error) {
      console.error('Failed to create document:', error);
    }
  };

  const handleCreateTodo = async () => {
    const trimmed = todoText.trim();
    if (!trimmed) return;
    try {
      await createTodo(trimmed);
      setShowTodoDialog(false);
      setTodoText('');
      onClose();
    } catch (error) {
      console.error('Failed to create todo:', error);
    }
  };

  const menuItems = [
    { type: 'document', label: '大纲笔记', icon: ListTree, color: 'text-emerald-600 dark:text-emerald-400' },
    { type: 'note', label: '普通笔记', icon: FileText, color: 'text-blue-600 dark:text-blue-400' },
    { type: 'todo', label: '待办', icon: Square, color: 'text-orange-600 dark:text-orange-400' },
    { type: 'folder', label: '文件夹', icon: Folder, color: 'text-yellow-600 dark:text-yellow-400' },
  ];

  // 待办弹窗 — 全屏蒙版 + 宽输入框
  if (showTodoDialog) {
    return (
      <div className="fixed inset-0 z-50 flex items-end" onClick={() => { setShowTodoDialog(false); setTodoText(''); }}>
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
        <div
          className="relative w-full bg-white dark:bg-gray-900 shadow-xl border-t border-gray-200 dark:border-gray-700 p-4 pb-8"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 max-w-lg mx-auto">
            <input
              ref={todoInputRef}
              type="text"
              value={todoText}
              onChange={(e) => setTodoText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTodo(); if (e.key === 'Escape') { setShowTodoDialog(false); setTodoText(''); } }}
              placeholder="新建待办..."
              className="flex-1 px-4 py-2.5 text-base bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 placeholder-gray-400 text-gray-800 dark:text-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              autoFocus
            />
            <button
              onClick={handleCreateTodo}
              disabled={!todoText.trim()}
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
