import type { ReactNode } from 'react';

export function highlightSidebarText(text: string, query: string): ReactNode {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.split(regex).map((part, index) => regex.test(part)
    ? <mark key={`${part}-${index}`} className="bg-yellow-200 dark:bg-yellow-600/50 px-0.5 rounded">{part}</mark>
    : part);
}

export function formatRelativeTime(dateStr: string | number): string {
  const date = new Date(dateStr);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}天前` : `${date.getMonth() + 1}/${date.getDate()}`;
}
