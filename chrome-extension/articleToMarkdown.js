// Beaver extension extraction pipeline.
// Public API: convert(html, baseUrl), extractArticle(html, url, pageTitle).
// Every entry point (popup, FAB and context menu) uses this same module.
(function (root) {
  'use strict';

  function absoluteUrl(value, baseUrl) {
    if (!value || /^(?:data:|blob:)/i.test(value)) return value || '';
    try { return new URL(value, baseUrl || location.href).href; } catch (_) { return value; }
  }

  function plainText(value) { return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }

  function promoteHeadings(doc) {
    doc.querySelectorAll('[role="heading"], [aria-level]').forEach(function (node) {
      if (/^H[1-6]$/.test(node.tagName)) return;
      var level = Number(node.getAttribute('aria-level')) || 0;
      var classes = (node.className || '').toString().toLowerCase();
      var match = classes.match(/(?:heading|headline|title|h)[-_ ]?([1-6])(?:$|[-_ ])/);
      level = level >= 1 && level <= 6 ? level : (match ? Number(match[1]) : 0);
      if (!level) return;
      var heading = doc.createElement('h' + Math.min(6, level));
      while (node.firstChild) heading.appendChild(node.firstChild);
      node.replaceWith(heading);
    });

    // X renders article headings as styled divs instead of semantic h1/h2.
    // The popup/content snapshot stores computed size and weight so this
    // heuristic can recover that meaning without guessing from text alone.
    doc.querySelectorAll('div, p, section, header').forEach(function (node) {
      if (/^H[1-6]$/.test(node.tagName) || node.querySelector('div, p, section, ul, ol, table, pre, blockquote')) return;
      var text = plainText(node.textContent);
      if (!text || text.length > 140) return;
      var classes = (node.className || '').toString().toLowerCase();
      var size = Number(node.getAttribute('data-beaver-font-size')) || 0;
      var weight = Number(node.getAttribute('data-beaver-font-weight')) || 0;
      var explicit = /(?:^|[-_ ])(?:heading|headline|article-title|section-title|post-title|h[1-6])(?:$|[-_ ])/i.test(classes);
      var levelMatch = classes.match(/(?:^|[-_ ])h([1-6])(?:$|[-_ ])/i);
      var level = levelMatch ? Number(levelMatch[1]) : 0;
      if (!level && explicit) level = size >= 28 ? 2 : 3;
      if (!level && size >= 28 && weight >= 600) level = 2;
      if (!level && size >= 23 && weight >= 700) level = 3;
      if (!level) return;
      var heading = doc.createElement('h' + Math.min(6, Math.max(1, level)));
      while (node.firstChild) heading.appendChild(node.firstChild);
      heading.setAttribute('data-beaver-heading-source', 'visual');
      node.replaceWith(heading);
    });

    // Recover inline bold used by X's rich-text renderer. Keep block
    // wrappers intact so paragraphs do not collapse into one line.
    doc.querySelectorAll('span, b, strong').forEach(function (node) {
      if (node.tagName === 'STRONG') return;
      var style = (node.getAttribute('style') || '').toLowerCase();
      var weight = Number(node.getAttribute('data-beaver-font-weight')) || 0;
      var isBold = weight >= 600 || /font-weight\s*:\s*(?:bold|[6-9]00)/i.test(style) ||
        /(?:^|[-_ ])(?:bold|font-bold)(?:$|[-_ ])/i.test(node.className || '');
      if (!isBold || !plainText(node.textContent)) return;
      var strong = doc.createElement('strong');
      while (node.firstChild) strong.appendChild(node.firstChild);
      node.replaceWith(strong);
    });
  }

  function normalizeDocument(html, baseUrl) {
    var doc = new DOMParser().parseFromString(html || '', 'text/html');
    doc.querySelectorAll('script, style, noscript, template').forEach(function (node) { node.remove(); });
    promoteHeadings(doc);
    doc.querySelectorAll('img').forEach(function (img) {
      var src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original') ||
        img.getAttribute('data-lazy-src') || img.getAttribute('data-actualsrc') || '';
      // X may keep the real media URL only on the image's surrounding link
      // while leaving the preview image without a usable src.
      if (!src) {
        var parentLink = img.closest('a[href]');
        src = parentLink && parentLink.getAttribute('href') || img.getAttribute('data-image-url') || '';
      }
      if (src) img.setAttribute('src', absoluteUrl(src, baseUrl));
      ['data-src', 'data-original', 'data-lazy-src', 'data-actualsrc', 'srcset'].forEach(function (name) { img.removeAttribute(name); });
    });
    // An image link is navigation chrome, not the image's intended action in Beaver.
    doc.querySelectorAll('a').forEach(function (anchor) {
      if (!anchor.querySelector('img')) return;
      var image = anchor.querySelector('img');
      anchor.replaceWith(image);
    });
    return doc;
  }

  function makeConverter() {
    if (!root.TurndownService) throw new Error('Markdown 转换器未加载');
    var service = new root.TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced', emDelimiter: '*' });
    service.addRule('preserveBreaks', { filter: ['br'], replacement: function () { return '\n'; } });
    return service;
  }

  function convert(html, baseUrl) {
    if (!html) return '';
    var doc = normalizeDocument(html, baseUrl);
    return makeConverter().turndown(doc.body.innerHTML).replace(/\n{3,}/g, '\n\n').trim();
  }

  function removeXChrome(rootNode) {
    rootNode.querySelectorAll(
      '[data-testid="User-Name"], [data-testid="User-Avatar"], [data-testid="User-Description"], ' +
      '[data-testid="reply"], [data-testid="retweet"], [data-testid="like"], [data-testid="bookmark"], ' +
      '[data-testid="share"], [data-testid="card.wrapper"], [role="group"], button, ' +
      '[aria-label="More"], [aria-label="Reply"], [aria-label="Like"], [aria-label="Repost"], [aria-label="Share"]'
    ).forEach(function (node) { node.remove(); });
  }

  function xCandidates(doc) {
    var selectors = [
      '[data-testid="longformArticle"]', '[data-testid="articleBody"]',
      'article[data-testid="tweet"]', 'main article[role="article"]', 'main article',
      '[data-testid="tweetText"]'
    ];
    var result = [];
    selectors.forEach(function (selector) {
      doc.querySelectorAll(selector).forEach(function (node, index) {
        var length = plainText(node.innerText || node.textContent).length;
        if (length < 20) return;
        var body = node.querySelector('[data-testid="articleBody"], [data-testid="longformArticle"]');
        var bodyLength = body ? plainText(body.innerText || body.textContent).length : 0;
        var score = length;
        if (/longformArticle|articleBody/.test(selector)) score += length >= 200 ? 5000 : -2000;
        if (selector === 'article[data-testid="tweet"]') score += 1500 - index;
        // A short teaser nested in a long article must not hide the outer body.
        if (bodyLength && bodyLength > length * 0.9) score -= 3000;
        result.push({ node: node, score: score, length: length });
      });
    });
    return result.sort(function (a, b) { return b.score - a.score || b.length - a.length; });
  }

  function xTitle(doc, lines) {
    var meta = doc.querySelector('meta[property="og:title"], meta[name="twitter:title"]');
    var title = plainText(meta && meta.getAttribute('content') || doc.title);
    title = title.replace(/^X\s*上的[^:：]+[:：]\s*/i, '').replace(/^Post\s*\/\s*X\s*[:：]?\s*/i, '');
    var quoted = title.match(/[“「"](.+?)[”」"]/);
    if (quoted) title = quoted[1];
    if (!title || /^X\s*上的/i.test(title)) title = lines[0] || 'X 帖子';
    return title.trim() || 'X 帖子';
  }

  function removeLeadingTitle(markdown, title) {
    var source = String(markdown || '').trim();
    var expected = plainText(title).replace(/[*_~`]/g, '');
    if (!source || !expected) return source;
    var heading = source.match(/^#{1,6}\s+([^\n]+)\s*(?:\n|$)/);
    if (heading && plainText(heading[1]).replace(/[*_~`]/g, '') === expected) {
      return source.slice(heading[0].length).replace(/^\s+/, '');
    }
    var firstLine = source.split('\n')[0];
    if (plainText(firstLine).replace(/[*_~`]/g, '') === expected) {
      return source.slice(firstLine.length).replace(/^\s+/, '');
    }
    return source;
  }

  function extractXArticle(html, pageUrl) {
    if (!/(?:^|\/)(?:x\.com|twitter\.com)(?:\/|$)/i.test(pageUrl || '')) return null;
    var doc = new DOMParser().parseFromString(html || '', 'text/html');
    var candidates = xCandidates(doc);
    var selected = candidates.length ? candidates[0].node : null;
    if (!selected) return null;
    var clone = selected.cloneNode(true);
    removeXChrome(clone);
    var lines = plainText(clone.innerText || clone.textContent).split(/\n+/).map(plainText).filter(Boolean);
    var title = xTitle(doc, lines);
    var markdown = convert(clone.innerHTML, pageUrl);
    markdown = removeLeadingTitle(markdown, title);
    return {
      title: title,
      html: clone.innerHTML,
      markdown: (markdown.trim() + '\n\n> 原文：[打开 X 原文](' +
        String(pageUrl).replace(/[()]/g, '\\$&') + ')').trim()
    };
  }

  function articleTitle(doc, parsed, fallback) {
    var title = parsed && parsed.title || doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || doc.title || fallback;
    return plainText(title).replace(/\s*[|｜•·—-]\s*(知乎|简书|掘金|少数派|Medium|GitHub).*$/i, '') || '未命名笔记';
  }

  function extractArticle(html, pageUrl, pageTitle) {
    var x = extractXArticle(html, pageUrl);
    if (x) return x;
    var doc = normalizeDocument(html, pageUrl);
    var parsed = null;
    try { if (root.Readability) parsed = new root.Readability(doc.cloneNode(true)).parse(); } catch (_) { parsed = null; }
    var content = parsed && parsed.content && parsed.content.length > 160 ? parsed.content : '';
    if (!content) {
      var selectors = ['[itemprop="articleBody"]', '.article-body', '.article-content', '.post-content', '.entry-content', 'article', 'main'];
      var best = null;
      selectors.forEach(function (selector) {
        doc.querySelectorAll(selector).forEach(function (node) {
          var length = plainText(node.innerText || node.textContent).length;
          if (length > (best ? best.length : 160)) best = { node: node, length: length };
        });
      });
      content = best ? best.node.innerHTML : doc.body.innerHTML;
    }
    var markdown = convert(content, pageUrl);
    if (!markdown || markdown.length < 20) return null;
    var title = articleTitle(doc, parsed, pageTitle);
    return { title: title, html: content, markdown: removeLeadingTitle(markdown, title).trim() };
  }

  root.BeaverArticleMarkdown = { convert: convert, extractArticle: extractArticle, extractXArticle: extractXArticle };
})(globalThis);
