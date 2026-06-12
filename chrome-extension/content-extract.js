// Content extraction script
// Injected with readability.js + turndown.js in the same content script world
(async function() {
  try {
    // KEY FIX: Get full rendered HTML from LIVE DOM (not cloneNode which misses JS-rendered content)
    var rawHtml = document.documentElement.outerHTML;
    var liveDoc = new DOMParser().parseFromString(rawHtml, 'text/html');

    // Try Readability on the full parsed document
    var article = new Readability(liveDoc).parse();

    var htmlContent = '';
    var title = '';
    var selectors = [
      '.post__body__extend__item__content',
      '.article-body .post__body__extend__item__content',
      '.article-body', '.article-content',
      '[itemprop="articleBody"]',
      '.article', 'article',
      '.post-content', '.post-body', '.entry-content',
      '.content-body', '.story-body', '.rich-text',
      'main .content',
      '#article-content', '#post-content',
      '.article__main__content',
    ];

    if (article && article.content && article.content.length > 200) {
      htmlContent = article.content;
      title = article.title || document.title || '';
    } else {
      // Fallback: directly extract from live DOM containers
      var container = null;
      for (var i = 0; i < selectors.length; i++) {
        var all = document.querySelectorAll(selectors[i]);
        if (all.length > 1) {
          // Multiple matching elements - concatenate all
          var parts = [];
          all.forEach(function(el) {
            if (el.textContent.trim().length > 20) parts.push(el.innerHTML);
          });
          if (parts.length > 0) {
            htmlContent = parts.join('\n\n');
            break;
          }
        } else if (all.length === 1) {
          container = all[0];
          if (container && container.textContent.trim().length > 100) {
            htmlContent = container.innerHTML;
            break;
          }
          container = null;
        }
      }
      if (!htmlContent) {
        container = document.querySelector('main') || document.body;
        htmlContent = container ? container.innerHTML : '';
      }
      title = article ? article.title : (document.title || '');
    }

    if (!htmlContent) {
      chrome.runtime.sendMessage({ type: '_extractResult', error: '无法提取正文' });
      return;
    }

    var td = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });

    // Handle links wrapping images: output as [![alt](img)](link) on one line
    td.addRule('linkedImages', {
      filter: function(node) {
        return node.nodeName === 'A' && node.querySelector('img');
      },
      replacement: function(_, node) {
        var href = node.getAttribute('href') || '';
        var img = node.querySelector('img');
        var src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original') || '';
        var alt = img.getAttribute('alt') || '图片';
        if (!src || src.indexOf('data:image/gif') === 0) return '';
        return '[' + '![' + alt + '](' + src + ')' + '](' + href + ')';
      }
    });

    // Handle standalone images
    td.addRule('lazyImages', {
      filter: 'img',
      replacement: function(_, node) {
        var src = node.getAttribute('src')
          || node.getAttribute('data-src')
          || node.getAttribute('data-original')
          || node.getAttribute('data-lazy-src')
          || node.getAttribute('data-actualsrc')
          || '';
        var alt = node.getAttribute('alt') || '图片';
        if (!src || src.indexOf('data:image/gif') === 0 || src.indexOf('data:image/svg') === 0) return '';
        return src ? '![' + alt + '](' + src + ')' : '';
      }
    });

    // Handle figures with captions
    td.addRule('figures', {
      filter: 'figure',
      replacement: function(_, node) {
        var img = node.querySelector('img');
        var caption = node.querySelector('figcaption');
        if (!img) return '';
        var src = img.getAttribute('src') || img.getAttribute('data-src') || '';
        var alt = caption ? caption.textContent.trim() : (img.getAttribute('alt') || '图片');
        return src ? '\n\n![' + alt + '](' + src + ')\n\n' : '';
      }
    });

    var markdown = td.turndown(htmlContent).trim();

    // Trim content at known "end of article" markers
    var endMarkers = [
      // 中文
      '你可能错过的好文章', '下载少数派', '关注少数派公众号',
      '推荐阅读', '相关推荐', '猜你喜欢', '你可能感兴趣',
      '相关文章', '延伸阅读', '相关阅读', '热门推荐',
      '阅读原文', '分享文章', '喜欢这篇文章',
      '条评论', '条评论', '登录后你可以',
      '展开阅读全文', '点击展开', '查看更多',
      // 英文
      'Recommended for you', 'You might also like',
      'Related articles', 'Read more', 'More from',
      'Sign up', 'Subscribe to', 'Newsletter',
      'Advertisement', 'Sponsored', 'Promoted',
    ];
    for (var m = 0; m < endMarkers.length; m++) {
      var idx = markdown.indexOf(endMarkers[m]);
      if (idx > 200) {  // Only trim if we have enough content before the marker
        markdown = markdown.substring(0, idx).trim();
        break;
      }
    }

    // Quality check: if markdown has very few lines but source has much more text,
    // Turndown likely lost line breaks. Fall back to innerText.
    var lineCount = markdown.split('\n').filter(function(l) { return l.trim(); }).length;
    var textLength = markdown.replace(/[#*\->\[\]()!`~]/g, '').trim().length;
    if (lineCount < 5 && textLength > 500) {
      // Use innerText from live DOM as fallback (preserves visual line breaks)
      var fallbackContainer = document.querySelector(selectors ? selectors[0] : '') || document.querySelector('article') || document.querySelector('main') || document.body;
      if (fallbackContainer) {
        var fallbackText = fallbackContainer.innerText.trim();
        if (fallbackText.length > markdown.length * 0.8) {
          markdown = fallbackText;
        }
      }
    }

    // Collect extra images from live DOM
    var extraImages = [];
    document.querySelectorAll('article img, .article img, .article-body img, .article__main__content img, .post img, .content img, main img').forEach(function(img) {
      var src = img.currentSrc || img.src || img.dataset.src || img.dataset.original || img.dataset.lazySrc || '';
      if (src && src.indexOf('http') !== 0 && src.indexOf('data:') !== 0) {
        try { src = new URL(src, location.href).href; } catch(e) {}
      }
      if (src && src.indexOf('data:') !== 0 && markdown.indexOf(src) === -1) {
        extraImages.push(src);
      }
    });
    if (extraImages.length > 0) {
      markdown += '\n\n' + extraImages.map(function(s) { return '![图片](' + s + ')'; }).join('\n\n');
    }

    // Metadata
    var meta = [];
    if (article && article.siteName) meta.push('> 来源: ' + article.siteName);
    if (article && article.byline) meta.push('> 作者: ' + article.byline);
    meta.push('> 原文: ' + location.href);
    markdown = meta.join('\n') + '\n\n' + markdown;

    chrome.runtime.sendMessage({
      type: '_extractResult',
      title: title || document.title || '未命名笔记',
      markdown: markdown,
    });

  } catch(e) {
    chrome.runtime.sendMessage({ type: '_extractResult', error: e.message });
  }
})();
