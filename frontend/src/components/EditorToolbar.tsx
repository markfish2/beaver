import { Heading1, Heading2, Heading3, Bold, Italic, Code, List, ListOrdered, Quote, Link, Minus, Image, Paperclip, Mic, MicOff, Sparkles } from 'lucide-react';
import type { MarkdownEditorHandle } from './MarkdownEditor';

interface EditorToolbarProps {
  editorRef: React.RefObject<MarkdownEditorHandle | null>;
  onUploadImage?: () => void;
  onUploadFile?: () => void;
  onRecordAudio?: () => void;
  isRecording?: boolean;
  onOpenAI?: () => void;
}

function ToolbarBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors shrink-0"
    >
      {children}
    </button>
  );
}

export default function EditorToolbar({ editorRef, onUploadImage, onUploadFile, onRecordAudio, isRecording, onOpenAI }: EditorToolbarProps) {
  const wrap = (before: string, after: string, ph?: string) => editorRef.current?.wrapSelection(before, after, ph);
  const prefix = (p: string) => editorRef.current?.insertLinePrefix(p);
  const insert = (text: string) => editorRef.current?.insertText(text);

  return (
    <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-gray-100 dark:border-gray-800 shrink-0 overflow-x-auto">
      <ToolbarBtn onClick={() => prefix('# ')} title="一级标题"><Heading1 className="w-4 h-4" /></ToolbarBtn>
      <ToolbarBtn onClick={() => prefix('## ')} title="二级标题"><Heading2 className="w-4 h-4" /></ToolbarBtn>
      <ToolbarBtn onClick={() => prefix('### ')} title="三级标题"><Heading3 className="w-4 h-4" /></ToolbarBtn>
      <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
      <ToolbarBtn onClick={() => wrap('**', '**', '粗体')} title="粗体"><Bold className="w-4 h-4" /></ToolbarBtn>
      <ToolbarBtn onClick={() => wrap('*', '*', '斜体')} title="斜体"><Italic className="w-4 h-4" /></ToolbarBtn>
      <ToolbarBtn onClick={() => wrap('`', '`', '代码')} title="行内代码"><Code className="w-4 h-4" /></ToolbarBtn>
      <ToolbarBtn onClick={() => wrap('\n```\n', '\n```\n', '代码块')} title="代码块"><span className="text-xs font-mono font-bold">B</span></ToolbarBtn>
      <ToolbarBtn onClick={() => wrap('~~', '~~', '删除线')} title="删除线"><span className="text-xs line-through">S</span></ToolbarBtn>
      <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
      <ToolbarBtn onClick={() => prefix('- ')} title="无序列表"><List className="w-4 h-4" /></ToolbarBtn>
      <ToolbarBtn onClick={() => prefix('1. ')} title="有序列表"><ListOrdered className="w-4 h-4" /></ToolbarBtn>
      <ToolbarBtn onClick={() => prefix('> ')} title="引用"><Quote className="w-4 h-4" /></ToolbarBtn>
      <ToolbarBtn onClick={() => prefix('- [ ] ')} title="任务列表"><span className="text-xs">☑</span></ToolbarBtn>
      <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
      <ToolbarBtn onClick={() => wrap('[', '](url)', '链接文字')} title="链接"><Link className="w-4 h-4" /></ToolbarBtn>
      <ToolbarBtn onClick={() => insert('\n---\n')} title="分割线"><Minus className="w-4 h-4" /></ToolbarBtn>
      {onUploadImage && (
        <>
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
          <ToolbarBtn onClick={onUploadImage} title="上传图片"><Image className="w-4 h-4" /></ToolbarBtn>
        </>
      )}
      {onUploadFile && (
        <ToolbarBtn onClick={onUploadFile} title="上传附件"><Paperclip className="w-4 h-4" /></ToolbarBtn>
      )}
      {onRecordAudio && (
        <ToolbarBtn onClick={onRecordAudio} title={isRecording ? '停止录音' : '录音'}>
          {isRecording ? <MicOff className="w-4 h-4 text-red-500 animate-pulse" /> : <Mic className="w-4 h-4" />}
        </ToolbarBtn>
      )}
      {onOpenAI && (
        <>
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
          <ToolbarBtn onClick={onOpenAI} title="AI 整理"><Sparkles className="w-4 h-4" /></ToolbarBtn>
        </>
      )}
    </div>
  );
}
