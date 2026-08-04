export function formatMemoTime(dateStr: string): string {
  const date = new Date(dateStr.endsWith('Z') ? dateStr : `${dateStr}Z`);
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const value = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${value('month')}月${value('day')}日 ${value('hour')}:${value('minute')}`;
}

export function extractMemoTags(content: string): string[] {
  const cleaned = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '');
  return [...new Set((cleaned.match(/#[a-zA-Z0-9_一-龥]+/g) || []).map(tag => tag.trim()))];
}

export function extractMemoImages(content: string): Array<{ alt: string; url: string }> {
  const images: Array<{ alt: string; url: string }> = [];
  for (const match of content.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
    if (!/\.(mp4|webm|ogg|wav|mp3|m4a)(\?|$)/i.test(match[2])) images.push({ alt: match[1], url: match[2] });
  }
  return images;
}

export function extractMemoFileLinks(content: string): Array<{ name: string; url: string }> {
  const imageUrls = new Set([...content.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)].map(match => match[2]));
  return [...content.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)]
    .filter(match => !imageUrls.has(match[2]) && !match[2].startsWith('/d/'))
    .map(match => ({ name: match[1], url: match[2] }));
}

export function extractMemoUrls(content: string): string[] {
  const urls = new Set<string>();
  for (const match of content.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) {
    if (/^https?:\/\//.test(match[2])) urls.add(match[2]);
  }
  const stripped = content.replace(/\[([^\]]*)\]\([^)]+\)/g, '');
  for (const match of stripped.matchAll(/(?<!\()(https?:\/\/[^\s<>)\]]+)/g)) urls.add(match[1].replace(/[.,;:!?]+$/, ''));
  return [...urls];
}
