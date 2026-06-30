// Content extraction script
// Injected with readability.js + turndown.js in the same content script world

/**
 * Preprocess HTML before turndown conversion
 * - Clean table cells (strip div/p/section/span wrappers)
 * - Handle code blocks with SVG icons
 * - Fix heading tags with font-weight:bold
 */
function preprocessHtml(html) {
  // Remove style/script tags
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');

  // Clean tables using DOMParser
  try {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    var tables = doc.querySelectorAll('table');
    tables.forEach(function(table) {
      var cells = table.querySelectorAll('td, th');
      cells.forEach(function(cell) {
        cell.innerHTML = cleanCellContent(cell.innerHTML);
      });
      // Remove table attributes
      while (table.attributes.length > 0) {
        table.removeAttribute(table.attributes[0].name);
      }
    });
    // Fix heading tags: remove font-weight:bold from style to prevent boldStyle rule matching
    var headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach(function(h) {
      var style = h.getAttribute('style') || '';
      style = style.replace(/font-weight\s*:\s*bold\s*;?/gi, '');
      style = style.replace(/font-weight\s*:\s*[7-9]\d{2}\s*;?/gi, '');
      h.setAttribute('style', style);
    });

    // Clean list items: remove div/p inside li to prevent double bullet points
    var listItems = doc.querySelectorAll('li');
    listItems.forEach(function(li) {
      li.innerHTML = cleanListItemContent(li.innerHTML);
    });

    return doc.body.innerHTML;
  } catch (e) {
    return html;
  }
}

function cleanListItemContent(html) {
  // Protect nested lists
  var nestedLists = [];
  var result = html.replace(/<ul[\s\S]*?<\/ul>/gi, function(match) {
    nestedLists.push(match);
    return '__NESTED_LIST_' + (nestedLists.length - 1) + '__';
  });
  result = result.replace(/<ol[\s\S]*?<\/ol>/gi, function(match) {
    nestedLists.push(match);
    return '__NESTED_LIST_' + (nestedLists.length - 1) + '__';
  });

  // Remove block elements
  result = result
    .replace(/<div[^>]*>/gi, '')
    .replace(/<\/div>/gi, '')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '')
    .replace(/<section[^>]*>/gi, '')
    .replace(/<\/section>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ');
  result = result.replace(/\s+/g, ' ').trim();

  // Restore nested lists
  nestedLists.forEach(function(list, i) {
    result = result.replace('__NESTED_LIST_' + i + '__', list);
  });

  return result;
}

function cleanCellContent(html) {
  var result = html
    .replace(/<div[^>]*>/gi, '')
    .replace(/<\/div>/gi, '')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '')
    .replace(/<section[^>]*>/gi, '')
    .replace(/<\/section>/gi, '')
    .replace(/<span[^>]*>/gi, '')
    .replace(/<\/span>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ');
  result = result.replace(/\s+/g, ' ').trim();
  return result || ' ';
}

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

    // Preprocess HTML: clean tables, code blocks, headings
    htmlContent = preprocessHtml(htmlContent);

    var td = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });

    // Handle tables → GFM markdown
    td.addRule('tableToGfm', {
      filter: 'table',
      replacement: function(_, node) {
        var rows = [];
        var trs = node.querySelectorAll('tr');
        trs.forEach(function(tr) {
          var cells = [];
          tr.querySelectorAll('th, td').forEach(function(cell) {
            cells.push(cell.textContent.replace(/\n/g, ' ').replace(/\|/g, '\\|').trim() || ' ');
          });
          rows.push(cells);
        });
        if (rows.length === 0) return '';
        // First row as header
        var header = '| ' + rows[0].join(' | ') + ' |';
        var separator = '| ' + rows[0].map(function() { return '---'; }).join(' | ') + ' |';
        var body = rows.slice(1).map(function(r) { return '| ' + r.join(' | ') + ' |'; }).join('\n');
        return '\n\n' + header + '\n' + separator + (body ? '\n' + body : '') + '\n\n';
      }
    });

    // Handle pre>code blocks with SVG icons (e.g. GitHub-style code blocks)
    td.addRule('preCodeBlock', {
      filter: function(node) {
        if (node.nodeName !== 'PRE') return false;
        return !!(node.querySelector('code') || node.querySelector('svg'));
      },
      replacement: function(_, node) {
        var codeEl = node.querySelector('code');
        var target = codeEl || node;
        var cloned = target.cloneNode(true);
        cloned.querySelectorAll('br').forEach(function(br) { br.replaceWith('\n'); });
        cloned.querySelectorAll('svg').forEach(function(svg) { svg.remove(); });
        var text = cloned.textContent || '';
        var cls = (codeEl && codeEl.getAttribute('class') || node.getAttribute('class') || '').toLowerCase();
        var langMatch = cls.match(/(?:language|lang|highlight-source)-(\w+)/);
        var lang = langMatch ? langMatch[1] : '';
        return '\n\n```' + lang + '\n' + text.replace(/\n+$/, '') + '\n```\n\n';
      }
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
