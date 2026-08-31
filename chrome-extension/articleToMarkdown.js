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

  root.BeaverArticleMarkdown = { convert: convert, cleanTitle: cleanTitle };
}(typeof window !== 'undefined' ? window : self));
