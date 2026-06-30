import { useEffect } from 'react';
import { getFailedPreviewUrls, retryLinkPreview, getCachedPreviewUrls, getCachedPreview } from '../api/data';

/**
 * On app startup, retry link previews that previously failed
 * (e.g., due to network issues with foreign websites).
 * Also retries cached previews that have all-null fields (from old failed fetches).
 */
export function useRetryFailedPreviews() {
  useEffect(() => {
    const failedUrls = getFailedPreviewUrls();

    // Also find cached entries with all-null fields (old format failures)
    const cachedUrls = getCachedPreviewUrls();
    const emptyCached = cachedUrls.filter(url => {
      const p = getCachedPreview(url);
      return p && !p.title && !p.description && !p.image;
    });

    // Merge and deduplicate
    const allRetryUrls = [...new Set([...failedUrls, ...emptyCached])];
    if (allRetryUrls.length === 0) return;

    // Retry with staggered delays to avoid burst requests
    allRetryUrls.forEach((url, i) => {
      setTimeout(() => {
        retryLinkPreview(url);
      }, i * 500);
    });
  }, []);
}
