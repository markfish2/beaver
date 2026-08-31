// Beaver article conversion shared by the popup and the page floating button.
// This file is intentionally a classic script so it can run in both contexts.
(function (root) {
  function absoluteUrl(value, baseUrl) {
    if (!value || value.indexOf('data:') === 0) return value || '';
    try { return new URL(value, baseUrl || location.href).href; } catch (_) { return value; }
  }

  function prepareHtml(html, baseUrl) {
    var doc = new DOMParser().parseFromString(html || '', 'text/html');
    doc.querySelectorAll('style, script, noscript').forEach(function (el) { el.remove(); });

    doc.querySelectorAll('img').forEach(function (img) {
      var source = img.getAttribute('src') || img.getAttribute('data-src') ||
        img.getAttribute('data-original') || img.getAttribute('data-lazy-src') ||
        img.getAttribute('data-actualsrc') || '';
      if (source) img.setAttribute('src', absoluteUrl(source, baseUrl));
      ['data-src', 'data-original', 'data-lazy-src', 'data-actualsrc', 'srcset'].forEach(function (name) {
        img.removeAttribute(name);
      });
    });

    // An article commonly wraps an image in a link to the article page.
    // Unwrap it so the note's image viewer owns the click interaction.
    doc.querySelectorAll('a').forEach(function (anchor) {
      if (!anchor.querySelector('img')) return;
      var image = anchor.querySelector('img');
      anchor.replaceWith(image);
    });

    // Keep semantic spacing while removing layout-only wrappers.
    doc.querySelectorAll('li > div, li > p').forEach(function (el) {
      while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
      el.remove();
    });
    return doc.body.innerHTML;
  }

  function convert(html, baseUrl) {
    var service = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '*',
      strongDelimiter: '**'
    });

    service.addRule('tableToGfm', {
      filter: 'table',
      replacement: function (_, node) {
        var rows = [];
        node.querySelectorAll('tr').forEach(function (row) {
          var cells = [];
          row.querySelectorAll('th, td').forEach(function (cell) {
            cells.push(cell.textContent.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim() || ' ');
          });
          if (cells.length) rows.push(cells);
        });
        if (!rows.length) return '';
        var header = '| ' + rows[0].join(' | ') + ' |';
        var separator = '| ' + rows[0].map(function () { return '---'; }).join(' | ') + ' |';
        var body = rows.slice(1).map(function (row) { return '| ' + row.join(' | ') + ' |'; }).join('\n');
        return '\n\n' + header + '\n' + separator + (body ? '\n' + body : '') + '\n\n';
      }
    });

    service.addRule('articleCodeBlock', {
      filter: function (node) { return node.nodeName === 'PRE'; },
      replacement: function (_, node) {
        var code = node.querySelector('code') || node;
        var text = code.textContent || '';
        var cls = (code.getAttribute('class') || node.getAttribute('class') || '').toLowerCase();
        var match = cls.match(/(?:language|lang|highlight-source)-([\w-]+)/);
        return '\n\n```' + (match ? match[1] : '') + '\n' + text.replace(/\n+$/, '') + '\n```\n\n';
      }
    });

    service.addRule('articleImage', {
      filter: 'img',
      replacement: function (_, node) {
        var source = node.getAttribute('src') || '';
        var alt = node.getAttribute('alt') || '图片';
        return source ? '![' + alt.replace(/\]/g, '\\]') + '](' + source + ')' : '';
      }
    });

    var markdown = service.turndown(prepareHtml(html, baseUrl));
    return markdown.replace(/\n{3,}/g, '\n\n').trim();
  }

  function cleanTitle(title, fallback) {
    var value = (title || '').replace(/\s*[|｜•·—-]\s*(知乎|简书|掘金|少数派|微信公众号|Medium|GitHub).*$/i, '').trim();
    return value || fallback || '未命名笔记';
  }

  function extractXTextLines(tweet) {
    // X's regular posts are rendered as many inline spans. Turndown sees those
    // spans as one continuous text node, while innerText still contains the
    // visual paragraph breaks shown to the user.
    var text = tweet.innerText || tweet.textContent || '';
    return text
      .replace(/\u00a0/g, ' ')
      .split(/\r?\n+/)
      .map(function (line) { return line.replace(/[ \t]+/g, ' ').trim(); })
      .filter(Boolean);
  }

  function xPostTitle(lines) {
    var first = lines[0] || 'X 帖子';
    if (first.length <= 80) return first;
    var sentence = first.match(/^(.{8,80}?[。！？!?])/);
    if (sentence) return sentence[1];
    return first.slice(0, 77).replace(/[，、；：,;: ]+$/, '') + '…';
  }

  // X is a timeline application rather than a conventional article. Readability
  // often merges navigation, replies and the tweet into one giant "title".
  // Extract the first visible tweet directly from its stable test-id instead.
  function extractXArticle(html, pageUrl) {
    if (!/https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)(?:\/|$)/i.test(pageUrl || '')) return null;
    var doc = new DOMParser().parseFromString(html || '', 'text/html');
    var tweet = doc.querySelector('article[data-testid="tweet"] [data-testid="tweetText"]') ||
      doc.querySelector('[data-testid="tweetText"]');
    if (!tweet || !(tweet.textContent || '').trim()) return null;

    var lines = extractXTextLines(tweet);
    var title = xPostTitle(lines);
    var markdown = lines.join('\n\n');
    if (title && markdown.indexOf(title) === 0) {
      markdown = markdown.slice(title.length).replace(/^\s*\n?/, '').trim();
    }
    // Keep the original HTML for callers that need media, but use the
    // line-preserving markdown above for regular X posts. This avoids X's
    // inline span structure collapsing all paragraphs into one line.
    return { title: cleanTitle(title, 'X 帖子'), html: tweet.outerHTML, markdown: markdown };
  }

  root.BeaverArticleMarkdown = {
    convert: convert,
    cleanTitle: cleanTitle,
    extractXArticle: extractXArticle
  };
}(typeof window !== 'undefined' ? window : self));
