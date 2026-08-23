import type { Document } from '../api/data';

/** @ 提及可引用普通笔记、大纲笔记和画布，不能引用文件夹等容器。 */
export const isMentionableDocument = (document: Document): boolean =>
  document.type === 'document' || document.type === 'note' || document.type === 'excalidraw';
