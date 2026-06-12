// Beaver Floating Action Button
// Injected into pages - provides quick save without needing popup window
(function() {
  if (location.protocol === 'chrome-extension:' || location.protocol === 'chrome:' || location.protocol === 'about:') return;
  if (document.getElementById('beaver-fab')) return;

  var style = document.createElement('style');
  style.textContent = '#beaver-fab{position:fixed;bottom:80px;right:16px;z-index:2147483647;width:44px;height:44px;border-radius:50%;background:#111827;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 12px rgba(0,0,0,0.3);touch-action:manipulation;-webkit-tap-highlight-color:transparent;opacity:0.85;transition:transform 0.15s}#beaver-fab:active{transform:scale(0.9)}#beaver-fab svg{pointer-events:none}#beaver-menu{position:fixed;bottom:132px;right:16px;z-index:2147483647;background:white;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.15);padding:6px;display:none;font-family:system-ui,-apple-system,sans-serif;min-width:160px}#beaver-menu.show{display:block;animation:beaver-in 0.15s ease}#beaver-menu button{display:flex;align-items:center;gap:8px;width:100%;padding:10px 14px;border:none;background:none;font-size:14px;color:#1f2937;cursor:pointer;border-radius:8px;touch-action:manipulation;-webkit-tap-highlight-color:transparent}#beaver-menu button:active{background:#f3f4f6}#beaver-menu button svg{flex-shrink:0}#beaver-toast{position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:12px 20px;color:white;font-size:14px;font-family:system-ui,-apple-system,sans-serif;text-align:center;transform:translateY(-100%);transition:transform 0.3s ease;pointer-events:none}@keyframes beaver-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}';
  document.head.appendChild(style);

  // Toast
  var toast = document.createElement('div');
  toast.id = 'beaver-toast';

  function showToast(msg, color) {
    toast.textContent = msg;
    toast.style.background = color || '#059669';
    toast.style.transform = 'translateY(0)';
    setTimeout(function() { toast.style.transform = 'translateY(-100%)'; }, 2500);
  }

  // Menu
  var menu = document.createElement('div');
  menu.id = 'beaver-menu';
  menu.innerHTML = '<button id="beaver-memo"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>保存选中文字</button><button id="beaver-doc"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>提取整页正文</button>';

  // FAB Button
  var btn = document.createElement('div');
  btn.id = 'beaver-fab';
  btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';

  var menuOpen = false;
  btn.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    menuOpen = !menuOpen;
    menu.classList.toggle('show', menuOpen);
  });

  // Close menu on outside click
  document.addEventListener('click', function(e) {
    if (menuOpen && !menu.contains(e.target) && e.target !== btn) {
      menuOpen = false;
      menu.classList.remove('show');
    }
  });

  // Long press to hide
  var pressTimer;
  btn.addEventListener('touchstart', function() {
    pressTimer = setTimeout(function() {
      btn.style.transform = 'scale(0)';
      menu.classList.remove('show');
      setTimeout(function() { btn.style.display = 'none'; menu.style.display = 'none'; }, 200);
    }, 1000);
  });
  btn.addEventListener('touchend', function() { clearTimeout(pressTimer); });
  btn.addEventListener('touchmove', function() { clearTimeout(pressTimer); });

  // ---- Save selected text as memo ----
  document.getElementById('beaver-memo');
  menu.addEventListener('click', function(e) {
    var target = e.target.closest('button');
    if (!target) return;
    var id = target.id;

    if (id === 'beaver-memo') {
      menuOpen = false;
      menu.classList.remove('show');
      var sel = window.getSelection();
      var text = sel ? sel.toString().trim() : '';
      if (!text) {
        showToast('请先选中要保存的文字', '#d97706');
        return;
      }
      showToast('正在保存到 Memo...', '#2563eb');
      chrome.runtime.sendMessage({ type: 'saveMemo', content: text }, function(res) {
        if (res && res.ok) showToast('已保存到 Memo ✓', '#059669');
        else showToast('保存失败: ' + (res && res.error || ''), '#dc2626');
      });
    }

    if (id === 'beaver-doc') {
      menuOpen = false;
      menu.classList.remove('show');
      extractAndSave();
    }
  });

  // ---- Extract full article and save as document ----
  function extractAndSave() {
    showToast('正在提取正文...', '#2563eb');

    try {
      var rawHtml = document.documentElement.outerHTML;
      var liveDoc = new DOMParser().parseFromString(rawHtml, 'text/html');
      var article = null;
      try { article = new Readability(liveDoc).parse(); } catch(err) {}

      var htmlContent = '';
      var title = '';
      var selectors = [
        '.post__body__extend__item__content',
        '.article-body', '.article-content',
        '[itemprop="articleBody"]', '.article', 'article',
        '.post-content', '.post-body', '.entry-content',
        '.content-body', '.story-body', '.rich-text',
        'main .content', '#article-content', '#post-content',
        '.article__main__content',
      ];

      if (article && article.content && article.content.length > 200) {
        htmlContent = article.content;
        title = article.title || document.title || '';
      } else {
        for (var i = 0; i < selectors.length; i++) {
          var all = document.querySelectorAll(selectors[i]);
          if (all.length > 1) {
            var parts = [];
            all.forEach(function(el) { if (el.textContent.trim().length > 20) parts.push(el.innerHTML); });
            if (parts.length > 0) { htmlContent = parts.join('\n\n'); break; }
          } else if (all.length === 1) {
            var c = all[0];
            if (c && c.textContent.trim().length > 100) { htmlContent = c.innerHTML; break; }
          }
        }
        if (!htmlContent) {
          var mc = document.querySelector('main') || document.body;
          htmlContent = mc ? mc.innerHTML : '';
        }
        title = article ? article.title : (document.title || '');
      }

      if (!htmlContent) {
        showToast('无法提取正文', '#dc2626');
        return;
      }

      var markdown = '';
      try {
        var td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
        td.addRule('linkedImages', {
          filter: function(node) { return node.nodeName === 'A' && node.querySelector('img'); },
          replacement: function(_, node) {
            var href = node.getAttribute('href') || '';
            var img = node.querySelector('img');
            var src = img.getAttribute('src') || img.getAttribute('data-src') || '';
            var alt = img.getAttribute('alt') || '图片';
            return src ? '[![' + alt + '](' + src + ')](' + href + ')' : '';
          }
        });
        td.addRule('lazyImages', {
          filter: 'img',
          replacement: function(_, node) {
            var src = node.getAttribute('src') || node.getAttribute('data-src') || node.getAttribute('data-original') || '';
            var alt = node.getAttribute('alt') || '图片';
            if (!src || src.indexOf('data:image') === 0) return '';
            return '![' + alt + '](' + src + ')';
          }
        });
        markdown = td.turndown(htmlContent).trim();

        var endMarkers = ['你可能错过的好文章', '下载少数派', '推荐阅读', '相关推荐', '猜你喜欢', '相关文章', '阅读原文', 'Recommended for you', 'Related articles'];
        for (var m = 0; m < endMarkers.length; m++) {
          var idx = markdown.indexOf(endMarkers[m]);
          if (idx > 200) { markdown = markdown.substring(0, idx).trim(); break; }
        }
      } catch(err) {
        markdown = htmlContent;
      }

      var meta = [];
      if (article && article.siteName) meta.push('> 来源: ' + article.siteName);
      if (article && article.byline) meta.push('> 作者: ' + article.byline);
      meta.push('> 原文: ' + location.href);
      markdown = meta.join('\n') + '\n\n' + markdown;

      chrome.runtime.sendMessage({
        type: 'saveDocument',
        title: title || document.title || '未命名笔记',
        markdown: markdown,
        pageUrl: location.href,
      }, function(res) {
        if (res && res.ok) showToast('已保存: ' + (title || '笔记') + ' ✓', '#059669');
        else showToast('保存失败: ' + (res && res.error || '未知错误'), '#dc2626');
      });
    } catch(err) {
      showToast('提取失败: ' + err.message, '#dc2626');
    }
  }

  // Inject into page
  document.body.appendChild(btn);
  document.body.appendChild(menu);
  document.body.appendChild(toast);
})();
