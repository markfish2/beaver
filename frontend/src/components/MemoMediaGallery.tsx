import { useState, useEffect, useMemo } from 'react';
import { Image, Paperclip, Link, Download, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { getMemos, getThumbnailUrl, getFileUrl, fetchLinkPreview, retryLinkPreview, type Memo, type LinkPreview } from '../api/data';
import LinkPreviewCard from './LinkPreviewCard';

interface MediaItem {
  url: string;
  name: string;
  memoId: string;
  memoDate: string;
}

function extractImages(content: string, memoId: string, memoDate: string): MediaItem[] {
  const results: MediaItem[] = [];
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    results.push({ url: match[2], name: match[1] || '图片', memoId, memoDate });
  }
  return results;
}

function extractFileLinks(content: string, memoId: string, memoDate: string): MediaItem[] {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const imageUrls = new Set<string>();
  let m;
  while ((m = imageRegex.exec(content)) !== null) {
    imageUrls.add(m[2]);
  }
  const results: MediaItem[] = [];
  while ((m = linkRegex.exec(content)) !== null) {
    if (!imageUrls.has(m[2]) && !m[2].startsWith('/d/')) {
      results.push({ url: m[2], name: m[1], memoId, memoDate });
    }
  }
  return results;
}

function extractUrls(content: string): string[] {
  const urls = new Set<string>();
  // Markdown link URLs
  const mdLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  let m;
  while ((m = mdLinkRegex.exec(content)) !== null) {
    if (m[2].startsWith('http://') || m[2].startsWith('https://')) urls.add(m[2]);
  }
  // Bare URLs (outside markdown links)
  const stripped = content.replace(/\[([^\]]*)\]\([^)]+\)/g, '');
  const bareUrlRegex = /(?<!\()(https?:\/\/[^\s<>\)\]]+)/g;
  while ((m = bareUrlRegex.exec(stripped)) !== null) {
    urls.add(m[1].replace(/[.,;:!?]+$/, ''));
  }
  return [...urls];
}

export default function MemoMediaGallery() {
  const [allMemos, setAllMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      setLoading(true);
      const collected: Memo[] = [];
      let page = 1;
      while (true) {
        try {
          const res = await getMemos(page, 100, false);
          collected.push(...res.memos);
          if (collected.length >= res.total || res.memos.length === 0) break;
          page++;
        } catch {
          break;
        }
      }
      if (!cancelled) {
        setAllMemos(collected);
        setLoading(false);
      }
    }
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  const { images, files, urls } = useMemo(() => {
    const imgMap = new Map<string, MediaItem>();
    const fileMap = new Map<string, MediaItem>();
    const urlSet = new Set<string>();
    for (const memo of allMemos) {
      const date = new Date(memo.created_at).toLocaleDateString('zh-CN');
      for (const img of extractImages(memo.content, memo.id, date)) {
        if (!imgMap.has(img.url)) imgMap.set(img.url, img);
      }
      for (const f of extractFileLinks(memo.content, memo.id, date)) {
        if (!fileMap.has(f.url)) fileMap.set(f.url, f);
      }
      for (const url of extractUrls(memo.content)) {
        urlSet.add(url);
      }
    }
    return { images: [...imgMap.values()], files: [...fileMap.values()], urls: [...urlSet] };
  }, [allMemos]);

  // Fetch link previews
  const [linkPreviews, setLinkPreviews] = useState<Map<string, LinkPreview | null>>(new Map());
  useEffect(() => {
    if (urls.length === 0) return;
    let cancelled = false;
    Promise.allSettled(urls.map(url => fetchLinkPreview(url))).then(results => {
      if (cancelled) return;
      const failedUrls: string[] = [];
      setLinkPreviews(prev => {
        const next = new Map(prev);
        urls.forEach((url, i) => {
          const r = results[i];
          const val = r.status === 'fulfilled' ? r.value : null;
          next.set(url, val);
          if (val === null) failedUrls.push(url);
        });
        return next;
      });
      if (failedUrls.length > 0) {
        setTimeout(() => {
          if (cancelled) return;
          Promise.allSettled(failedUrls.map(url => retryLinkPreview(url))).then(retryResults => {
            if (cancelled) return;
            setLinkPreviews(prev2 => {
              const next2 = new Map(prev2);
              failedUrls.forEach((url, i) => {
                const r = retryResults[i];
                const val = r.status === 'fulfilled' ? r.value : null;
                if (val !== null) next2.set(url, val);
              });
              return next2;
            });
          });
        }, 2000);
      }
    });
    return () => { cancelled = true; };
  }, [urls]);

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);
  const prevImage = () => setLightboxIndex(i => i !== null ? (i - 1 + images.length) % images.length : null);
  const nextImage = () => setLightboxIndex(i => i !== null ? (i + 1) % images.length : null);

  return (
    <div className="flex flex-col h-full">
      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-1 space-y-6">
        {loading ? (
          <div className="text-center text-gray-400 text-sm py-12">加载中...</div>
        ) : (
          <>
            {/* Images Section */}
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <Image className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">图片 ({images.length})</span>
              </div>
              {images.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-8">暂无图片</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {images.map((img, i) => (
                    <button
                      key={img.url}
                      onClick={() => openLightbox(i)}
                      className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 group cursor-pointer"
                    >
                      <img
                        src={getThumbnailUrl(img.url)}
                        alt={img.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = getFileUrl(img.url);
                        }}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                      <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[11px] text-white truncate block">{img.memoDate}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Files Section */}
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <Paperclip className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">附件 ({files.length})</span>
              </div>
              {files.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-8">暂无附件</div>
              ) : (
                <div className="space-y-1">
                  {files.map((f) => (
                    <a
                      key={f.url}
                      href={getFileUrl(f.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                    >
                      <Paperclip className="w-4 h-4 text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate block">{f.name}</span>
                        <span className="text-[11px] text-gray-400">{f.memoDate}</span>
                      </div>
                      <Download className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Links Section */}
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <Link className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">链接 ({urls.length})</span>
              </div>
              {urls.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-8">暂无链接</div>
              ) : (
                <div className="space-y-2">
                  {urls.map((url) => (
                    <LinkPreviewCard
                      key={url}
                      preview={linkPreviews.get(url) ?? null}
                      isLoading={!linkPreviews.has(url)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && images.length > 0 && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80" onClick={closeLightbox}>
          <button
            onClick={(e) => { e.stopPropagation(); closeLightbox(); }}
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); prevImage(); }}
            className="absolute left-4 p-2 text-white/70 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>

          <img
            src={getFileUrl(images[lightboxIndex].url)}
            alt={images[lightboxIndex].name}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />

          <button
            onClick={(e) => { e.stopPropagation(); nextImage(); }}
            className="absolute right-4 p-2 text-white/70 hover:text-white transition-colors"
          >
            <ChevronRight className="w-8 h-8" />
          </button>

          <div className="absolute bottom-4 text-white/60 text-sm">
            {lightboxIndex + 1} / {images.length}
            <span className="ml-3 text-white/40">{images[lightboxIndex].name}</span>
          </div>
        </div>
      )}
    </div>
  );
}
