export function formatMemoTime(dateStr: string): string {
  const date = new Date(dateStr.endsWith('Z') ? dateStr : `${dateStr}Z`);
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const value = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${value('month')}月${value('day')}日 ${value('hour')}:${value('minute')}`;
}

/** 剔除围栏代码块与行内代码，避免把代码示例里的标记误当成正文内容 */
function stripCodeBlocks(content: string): string {
  return content.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '');
}

export function extractMemoTags(content: string): string[] {
  const cleaned = stripCodeBlocks(content);
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
  // 排除图片语法 ![alt](url)，图片已在卡片中展示，不应再作为附件重复出现
  return [...stripCodeBlocks(content).matchAll(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g)]
    .filter(match => match[2].startsWith('/uploads/'))
    .map(match => ({ name: match[1], url: match[2] }));
}

export function extractMemoUrls(content: string): string[] {
  const cleaned = stripCodeBlocks(content);
  const urls = new Set<string>();
  for (const match of cleaned.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) {
    if (/^https?:\/\//.test(match[2])) urls.add(match[2]);
  }
  const stripped = cleaned.replace(/\[([^\]]*)\]\([^)]+\)/g, '');
  for (const match of stripped.matchAll(/(?<!\()(https?:\/\/[^\s<>)\]]+)/g)) urls.add(match[1].replace(/[.,;:!?]+$/, ''));
  return [...urls];
}
