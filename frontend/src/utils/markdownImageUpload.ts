import { uploadFile, uploadFromUrl } from '../api/data';

interface MarkdownImageUploadResult {
  markdown: string;
  uploadedCount: number;
  failedUrls: string[];
}

const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

function extensionForMimeType(mimeType: string): string {
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/avif': 'avif',
  };
  return extensions[mimeType.toLowerCase()] || 'png';
}

function normalizeMarkdownUrl(rawUrl: string): string {
  return rawUrl.startsWith('<') && rawUrl.endsWith('>')
    ? rawUrl.slice(1, -1)
    : rawUrl;
}

export function extractMarkdownImageUrls(markdown: string): string[] {
  const urls: string[] = [];
  let match: RegExpExecArray | null;
  MARKDOWN_IMAGE_RE.lastIndex = 0;
  while ((match = MARKDOWN_IMAGE_RE.exec(markdown)) !== null) {
    const url = normalizeMarkdownUrl(match[1]);
    if (url && !url.startsWith('/uploads/')) urls.push(url);
  }
  return [...new Set(urls)];
}

async function uploadBrowserImageUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`图片读取失败: HTTP ${response.status}`);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('剪贴板内容不是图片');
  const extension = extensionForMimeType(blob.type);
  const file = new File([blob], `pasted-image-${Date.now()}.${extension}`, { type: blob.type });
  const uploaded = await uploadFile(file);
  return uploaded.file_path.replace(/^\/api/, '');
}

async function uploadMarkdownImage(url: string, sourceUrl?: string): Promise<string> {
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return uploadBrowserImageUrl(url);
  }

  let resolvedUrl = url;
  if (!/^https?:\/\//i.test(resolvedUrl)) {
    if (!sourceUrl) throw new Error('缺少相对图片地址的来源页面');
    resolvedUrl = new URL(resolvedUrl, sourceUrl).href;
  }

  const uploaded = await uploadFromUrl(resolvedUrl);
  return uploaded.file_path.replace(/^\/api/, '');
}

export async function localizeMarkdownImages(
  markdown: string,
  sourceUrl?: string,
): Promise<MarkdownImageUploadResult> {
  const urls = extractMarkdownImageUrls(markdown);
  if (urls.length === 0) {
    return { markdown, uploadedCount: 0, failedUrls: [] };
  }

  const results = await Promise.allSettled(
    urls.map(async (url) => ({ url, localUrl: await uploadMarkdownImage(url, sourceUrl) })),
  );

  let localized = markdown;
  let uploadedCount = 0;
  const failedUrls: string[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      localized = localized.split(result.value.url).join(result.value.localUrl);
      uploadedCount += 1;
    } else {
      failedUrls.push(urls[index]);
    }
  });

  return { markdown: localized, uploadedCount, failedUrls };
}
