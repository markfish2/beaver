// Beaver — popup logic

const $ = (sel) => document.querySelector(sel);

// State: detected content from the page
let detectedText = '';
let detectedImages = []; // array of image URLs
let currentMode = 'memo'; // 'memo' or 'doc'

// Normalize API URL: strip trailing slashes and trailing /api
function normalizeApiUrl(raw) {
  return raw.trim().replace(/\/+$/, '').replace(/\/api$/i, '');
}

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    $('#save-view').classList.toggle('hidden', target !== 'save');
    $('#settings-view').classList.toggle('hidden', target !== 'settings');
  });
});

// Mode toggle: memo / document
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    $('#memo-mode').classList.toggle('hidden', currentMode !== 'memo');
    $('#doc-mode').classList.toggle('hidden', currentMode !== 'doc');
  });
});

// Toast helper
function showToast(el, message, type) {
  el.textContent = message;
  el.className = `toast ${type}`;
  if (type !== 'loading') {
    setTimeout(() => { el.className = 'toast hidden'; }, 2500);
  }
}

// ---- Settings ----
async function loadSettings() {
  const { apiUrl, apiToken } = await chrome.storage.local.get(['apiUrl', 'apiToken']);
  if (apiUrl) $('#input-url').value = apiUrl;
  if (apiToken) $('#input-token').value = apiToken;
}

$('#btn-save-settings').addEventListener('click', async () => {
  const apiUrl = normalizeApiUrl($('#input-url').value);
  const apiToken = $('#input-token').value.trim();
  if (!apiUrl || !apiToken) {
    showToast($('#settings-toast'), '请填写完整', 'error');
    return;
  }
  $('#input-url').value = apiUrl;
  await chrome.storage.local.set({ apiUrl, apiToken });
  showToast($('#settings-toast'), '已保存', 'success');
});

// ---- Test Connection ----
$('#btn-test').addEventListener('click', async () => {
  const apiUrl = normalizeApiUrl($('#input-url').value);
  const apiToken = $('#input-token').value.trim();
  if (!apiUrl || !apiToken) {
    showToast($('#settings-toast'), '请先填写 API 地址和 Token', 'error');
    return;
  }

  const btn = $('#btn-test');
  btn.disabled = true;
  btn.textContent = '测试中...';
  showToast($('#settings-toast'), '正在连接...', 'loading');

  await chrome.storage.local.set({ apiUrl, apiToken });
  $('#input-url').value = apiUrl;

  chrome.runtime.sendMessage({ type: 'testConnection' }, (res) => {
    btn.disabled = false;
    btn.textContent = '测试连接';
    if (res?.ok) {
      showToast($('#settings-toast'), `连接成功，用户: ${res.username}`, 'success');
    } else {
      showToast($('#settings-toast'), `连接失败: ${res?.error || '未知错误'}`, 'error');
    }
  });
});

// ---- Load selection (text + images) ----
async function loadSelection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    // Inject script to get selection text + images within selection
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return { text: '', images: [] };

        const text = sel.toString().trim();

        // Collect image srcs from selected range
        const images = [];
        for (let i = 0; i < sel.rangeCount; i++) {
          const range = sel.getRangeAt(i);
          const container = range.commonAncestorContainer;
          const root = container.nodeType === 3 ? container.parentElement : container;
          if (!root) continue;
          root.querySelectorAll('img').forEach(img => {
            const src = img.src || img.dataset.src || '';
            if (src && !images.includes(src)) {
              try {
                if (range.intersectsNode(img)) images.push(src);
              } catch { /* ignore */ }
            }
          });
        }

        return { text, images };
      }
    });

    const result = results?.[0]?.result || { text: '', images: [] };
    detectedText = result.text || '';
    detectedImages = result.images || [];

    const preview = $('#selection-preview');
    const imageGrid = $('#image-preview');

    // Text preview
    if (detectedText) {
      preview.textContent = detectedText;
      preview.classList.remove('empty');
    } else {
      preview.textContent = detectedImages.length > 0 ? '' : '未检测到选中内容';
      preview.classList.toggle('empty', detectedImages.length === 0);
    }

    // Image preview
    if (detectedImages.length > 0) {
      imageGrid.classList.remove('hidden');
      imageGrid.innerHTML = '';
      detectedImages.forEach(url => {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'image-thumb';
        img.onerror = () => { img.style.display = 'none'; };
        imageGrid.appendChild(img);
      });
    } else {
      imageGrid.classList.add('hidden');
      imageGrid.innerHTML = '';
    }

    // Enable/disable save button
    $('#btn-save').disabled = !detectedText && detectedImages.length === 0;

  } catch {
    // e.g. chrome:// pages where scripting is not allowed
    $('#selection-preview').textContent = '无法获取选中内容';
    $('#selection-preview').classList.add('empty');
    detectedText = '';
    detectedImages = [];
  }
}

// ---- Save memo (existing) ----
$('#btn-save').addEventListener('click', () => {
  if (!detectedText && detectedImages.length === 0) return;

  const btn = $('#btn-save');
  btn.disabled = true;
  btn.textContent = '保存中...';

  let msg;
  if (detectedImages.length > 0) {
    msg = { type: 'saveRichMemo', text: detectedText, images: detectedImages };
  } else {
    msg = { type: 'saveMemo', content: detectedText };
  }

  chrome.runtime.sendMessage(msg, (res) => {
    btn.textContent = '保存到 Memo';
    if (res?.ok) {
      const count = detectedImages.length;
      const label = count > 0
        ? `已保存，${count} 张图片 ✓`
        : '已保存 ✓';
      showToast($('#save-toast'), label, 'success');
      setTimeout(() => {
        detectedText = '';
        detectedImages = [];
        $('#selection-preview').textContent = '未检测到选中内容';
        $('#selection-preview').classList.add('empty');
        $('#image-preview').classList.add('hidden');
        $('#image-preview').innerHTML = '';
        btn.disabled = true;
      }, 1000);
    } else {
      showToast($('#save-toast'), res?.error || '保存失败', 'error');
      btn.disabled = false;
    }
  });
});

// ---- Extract article and save as document ----
$('#btn-extract').addEventListener('click', async () => {
  const btn = $('#btn-extract');
  const toast = $('#save-toast');
  btn.disabled = true;
  btn.textContent = '提取中...';
  showToast(toast, '正在提取页面正文...', 'loading');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('无法获取当前标签页');

    let title = '';
    let markdown = '';

    // Extract raw HTML from the page (in page context)
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        return {
          html: document.documentElement.outerHTML,
          title: document.title || '',
          url: location.href,
        };
      }
    });

    const pageData = results?.[0]?.result;
    if (!pageData?.html) {
      throw new Error('无法获取页面内容');
    }

    // Parse with Readability (in popup context - no CORS issues)
    const doc = new DOMParser().parseFromString(pageData.html, 'text/html');
    const article = new Readability(doc).parse();

    let htmlContent = '';

    if (article?.content && article.content.length > 200) {
      htmlContent = article.content;
      title = article.title || pageData.title || '';
    } else {
      // Fallback: extract from page DOM directly
      const selectors = [
        '.post__body__extend__item__content',
        '.article-body .post__body__extend__item__content',
        '.article-body', '.article-content',
        '[itemprop="articleBody"]',
        '.article', 'article',
        '.post-content', '.post-body', '.entry-content',
        '.content-body', '.story-body', '.rich-text',
        'main .content', '.article__main__content',
      ];
      for (const sel of selectors) {
        const all = doc.querySelectorAll(sel);
        if (all.length > 1) {
          const parts = [];
          all.forEach(el => { if (el.textContent.trim().length > 20) parts.push(el.innerHTML); });
          if (parts.length > 0) { htmlContent = parts.join('\n\n'); break; }
        } else if (all.length === 1) {
          const c = all[0];
          if (c && c.textContent.trim().length > 100) { htmlContent = c.innerHTML; break; }
        }
      }
      if (!htmlContent) {
        const c = doc.querySelector('main') || doc.body;
        htmlContent = c?.innerHTML || '';
      }
      title = article?.title || pageData.title || '';
    }

    if (!htmlContent) throw new Error('无法提取正文内容');

    // Convert HTML to Markdown with Turndown
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });

    // Handle links wrapping images: output as [![alt](img)](link) on one line
    turndownService.addRule('linkedImages', {
      filter: (node) => node.nodeName === 'A' && node.querySelector('img'),
      replacement: (content, node) => {
        const href = node.getAttribute('href') || '';
        const img = node.querySelector('img');
        const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original') || '';
        const alt = img.getAttribute('alt') || '图片';
        if (!src || src.startsWith('data:image/gif')) return '';
        return `[![${alt}](${src})](${href})`;
      }
    });

    // Handle standalone images
    turndownService.addRule('lazyImages', {
      filter: 'img',
      replacement: (content, node) => {
        const src = node.getAttribute('src')
          || node.getAttribute('data-src')
          || node.getAttribute('data-original')
          || node.getAttribute('data-lazy-src')
          || node.getAttribute('data-actualsrc')
          || '';
        const alt = node.getAttribute('alt') || '图片';
        if (!src || src.startsWith('data:image/gif') || src.startsWith('data:image/svg')) return '';
        return src ? `![${alt}](${src})` : '';
      }
    });

    markdown = turndownService.turndown(htmlContent).trim();

    // Trim content at known "end of article" markers
    const endMarkers = [
      '你可能错过的好文章', '下载少数派', '关注少数派公众号',
      '推荐阅读', '相关推荐', '猜你喜欢', '你可能感兴趣',
      '相关文章', '延伸阅读', '相关阅读', '热门推荐',
      '阅读原文', '分享文章', '喜欢这篇文章',
      '条评论', '登录后你可以', '展开阅读全文',
      'Recommended for you', 'You might also like',
      'Related articles', 'Read more', 'More from',
    ];
    for (const marker of endMarkers) {
      const idx = markdown.indexOf(marker);
      if (idx > 200) {
        markdown = markdown.substring(0, idx).trim();
        break;
      }
    }

    // Add metadata header
    const meta = [];
    if (article?.siteName) meta.push(`> 来源: ${article.siteName}`);
    if (article?.byline) meta.push(`> 作者: ${article.byline}`);
    if (pageData.url) meta.push(`> 原文: ${pageData.url}`);
    if (meta.length > 0) {
      markdown = meta.join('\n') + '\n\n' + markdown;
    }

    title = title || '未命名笔记';

    // Show preview
    const preview = $('#article-preview');
    preview.textContent = `[${title}]\n\n${markdown.substring(0, 200)}...`;
    preview.classList.remove('empty');

    // Send to background for saving as document
    showToast(toast, '正在上传图片并保存...', 'loading');

    chrome.runtime.sendMessage({
      type: 'saveDocument',
      title: title,
      markdown: markdown,
      pageUrl: pageData.url || '',
    }, (res) => {
      btn.textContent = '提取正文并保存';
      btn.disabled = false;
      if (res?.ok) {
        showToast(toast, `已保存为普通笔记 ✓`, 'success');
      } else {
        showToast(toast, res?.error || '保存失败', 'error');
      }
    });

  } catch (err) {
    btn.textContent = '提取正文并保存';
    btn.disabled = false;
    showToast(toast, err.message || '提取失败', 'error');
  }
});

// ---- Inject FAB into current page ----
$('#btn-inject-fab').addEventListener('click', async () => {
  const btn = $('#btn-inject-fab');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('无法获取当前标签页');

    // Check if FAB already exists
    const check = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => !!document.getElementById('beaver-fab'),
    });

    if (check?.[0]?.result) {
      showToast($('#save-toast'), '浮动按钮已存在', 'success');
      return;
    }

    // Inject the FAB scripts
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['readability.js', 'turndown.js', 'content-fab.js'],
    });

    showToast($('#save-toast'), '浮动按钮已注入 ✓', 'success');
  } catch (err) {
    showToast($('#save-toast'), err.message || '注入失败', 'error');
  }
});

// Init
loadSettings();
loadSelection();
