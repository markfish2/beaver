import { memo } from 'react';
import { Globe } from 'lucide-react';
import type { LinkPreview } from '../api/data';
import type { MemoCardPalette } from './memoCardTheme';

interface LinkPreviewCardProps {
  preview: LinkPreview | null;
  isLoading: boolean;
  error?: boolean;
  palette?: MemoCardPalette;
  compact?: boolean;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function LinkPreviewCardInner({ preview, isLoading, error, palette, compact = false }: LinkPreviewCardProps) {
  const themedStyle = palette ? { color: palette.text, background: palette.surface, borderColor: palette.surfaceBorder } : undefined;
  const mutedStyle = palette ? { color: palette.mutedText } : undefined;
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 p-3 animate-pulse" style={themedStyle}>
        <div className="w-10 h-10 rounded bg-black/10 dark:bg-white/10 shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-3/4" />
          <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-1/2" />
        </div>
      </div>
    );
  }

  const hasData = preview && (preview.title || preview.description);
  const domain = preview ? getDomain(preview.url) : '';
  const displayName = preview?.site_name || domain;

  if (!hasData || error) {
    return (
      <a
        href={preview?.url || '#'}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 p-3 transition-colors no-underline"
        style={themedStyle}
      >
        <div className="w-10 h-10 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
          <Globe className="w-5 h-5 text-gray-400 dark:text-gray-500" style={mutedStyle} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-gray-600 dark:text-gray-300 truncate" style={palette ? { color: palette.text } : undefined}>{domain}</div>
        </div>
      </a>
    );
  }

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 overflow-hidden transition-colors no-underline"
      style={themedStyle}
    >
      {preview.image && !compact && (
        <div className="w-24 sm:w-32 shrink-0 bg-gray-100 dark:bg-gray-700" style={palette ? { background: palette.surfaceStrong } : undefined}>
          <img
            src={preview.image}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}
      <div className="flex-1 min-w-0 p-3">
        <div className="flex items-center gap-1.5 mb-1">
          {preview.favicon ? (
            <img src={preview.favicon} alt="" className="w-4 h-4 rounded-sm shrink-0" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <Globe className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          )}
          <span className="text-xs text-gray-400 dark:text-gray-500 truncate" style={mutedStyle}>{displayName}</span>
        </div>
        {preview.title && (
          <div className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-1 mb-0.5" style={palette ? { color: palette.text } : undefined}>{preview.title}</div>
        )}
        {preview.description && (
          <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2" style={mutedStyle}>{preview.description}</div>
        )}
      </div>
    </a>
  );
}

const LinkPreviewCard = memo(LinkPreviewCardInner);
export default LinkPreviewCard;
