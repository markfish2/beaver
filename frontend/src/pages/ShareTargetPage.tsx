import { useEffect, useState } from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { shareContent } from '../api/data';

// X/Twitter URL 匹配
const X_URL_RE = /^https?:\/\/(x\.com|twitter\.com|mobile\.twitter\.com)\/\w+\/status\/\d+/i;

/**
 * 客户端提取 X/Twitter 推文内容
 * 手机 Chrome 有 VPN 可以访问 x.com，直接从浏览器端抓取
 */
async function extractXContent(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!resp.ok) return null;
    const html = await resp.text();

    // 从 meta 标签提取（X 在 HTML 中嵌入了 og 标签用于 SEO/预览）
    const ogTitle = extractMeta(html, 'og:title');
    const ogDesc = extractMeta(html, 'og:description');
    const ogImage = extractMeta(html, 'og:image');
    const authorName = extractMeta(html, 'twitter:title'); // 通常是 "Author on X"

    const parts: string[] = [];

    // 作者信息
    if (authorName && authorName !== ogTitle) {
      parts.push(`**${authorName}**`);
    }

    // 推文正文（og:description 通常是推文内容）
    if (ogDesc) {
      parts.push(ogDesc);
    }

    // 图片
    if (ogImage && !ogImage.includes('pbs.twimg.com/profile_images')) {
      parts.push(`![图片](${ogImage})`);
    }

    // 原文链接
    parts.push(`[原文链接](${url})`);

    return parts.length > 1 ? parts.join('\n\n') : null;
  } catch {
    return null;
  }
}

function extractMeta(html: string, name: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]*property=["']${escapeRegex(name)}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${escapeRegex(name)}["']`, 'i'),
    new RegExp(`<meta[^>]*name=["']${escapeRegex(name)}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${escapeRegex(name)}["']`, 'i'),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function ShareTargetPage() {
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isLoading } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'login'>('loading');
  const [message, setMessage] = useState('正在保存...');

  const title = searchParams.get('title') || '';
  const text = searchParams.get('text') || '';
  const url = searchParams.get('url') || '';

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      setStatus('login');
      return;
    }

    if (!title && !text && !url) {
      setStatus('success');
      return;
    }

    const isXUrl = url && X_URL_RE.test(url);

    if (isXUrl) {
      // X 链接：客户端提取（手机有 VPN 可访问 x.com）
      setMessage('正在提取推文内容...');
      extractXContent(url).then(extracted => {
        setMessage('正在保存...');
        return shareContent({
          url,
          title: title || undefined,
          text: text || undefined,
          extracted_content: extracted || undefined,
        });
      }).then(() => {
        setStatus('success');
      }).catch(() => {
        // 客户端提取失败，降级为只保存 URL
        shareContent({ url, title: title || undefined, text: text || undefined })
          .then(() => setStatus('success'))
          .catch(() => setStatus('error'));
      });
    } else {
      // 普通 URL：后端抓取
      setMessage('正在抓取文章内容...');
      shareContent({
        url: url || undefined,
        title: title || undefined,
        text: text || undefined,
      }).then(() => {
        setStatus('success');
      }).catch(() => {
        setStatus('error');
      });
    }
  }, [isLoading, isAuthenticated, title, text, url]);

  if (status === 'login') {
    const shareData = JSON.stringify({ title, text, url });
    sessionStorage.setItem('pendingShare', shareData);
    return <Navigate to="/login" replace />;
  }

  if (status === 'success') {
    return <Navigate to="/" replace />;
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-gray-600 mb-4">保存失败</p>
          <button
            onClick={() => window.location.href = '/'}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 mx-auto mb-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">{message}</p>
      </div>
    </div>
  );
}
