// Beaver — popup logic

const $ = (sel) => document.querySelector(sel);

// State: detected content from the page
let detectedText = '';
let detectedMarkdown = '';
let detectedImages = []; // array of image URLs
let detectedPageUrl = '';
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

function extensionErrorMessage(error, fallback) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/extension context invalidated|context invalidated/i.test(message)) {
    return '插件刚刚更新，请关闭此窗口后重新打开插件再试';
  }
  if (/cannot access|not allowed|permission/i.test(message)) {
    return '当前页面禁止插件读取内容，请换到普通网页后重试';
  }
  return message || fallback;
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
    detectedPageUrl = tab.url || '';

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

        const wrapper = document.createElement('div');
        for (let i = 0; i < sel.rangeCount; i++) {
          wrapper.appendChild(sel.getRangeAt(i).cloneContents());
        }
        return { text, html: wrapper.innerHTML, images };
      }
    });

    const result = results?.[0]?.result || { text: '', images: [] };
    detectedText = result.text || '';
    detectedMarkdown = result.html
      ? (BeaverArticleMarkdown.convert(result.html, detectedPageUrl) || detectedText)
      : detectedText;
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

  } catch (error) {
    // e.g. chrome:// pages where scripting is not allowed
    $('#selection-preview').textContent = extensionErrorMessage(error, '无法获取选中内容');
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
    msg = { type: 'saveRichMemo', text: detectedMarkdown || detectedText, images: detectedImages, pageUrl: detectedPageUrl };
  } else {
    msg = { type: 'saveMemo', content: detectedMarkdown || detectedText };
  }

  chrome.runtime.sendMessage(msg, (res) => {
    btn.textContent = '保存到 Memo';
    if (res?.ok) {
      const uploadedCount = res.uploadedCount || 0;
      const failedCount = res.failedCount || 0;
      const label = failedCount > 0
        ? `已保存，${uploadedCount} 张图片成功，${failedCount} 张失败`
        : uploadedCount > 0 ? `已保存，${uploadedCount} 张图片 ✓` : '已保存 ✓';
      showToast($('#save-toast'), label, 'success');
      setTimeout(() => {
        detectedText = '';
        detectedMarkdown = '';
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
          html: (() => {
            const snapshot = document.documentElement.cloneNode(true);
            const sourceElements = document.querySelectorAll('div, p, span, section, header');
            const snapshotElements = snapshot.querySelectorAll('div, p, span, section, header');
            sourceElements.forEach((element, index) => {
              const clone = snapshotElements[index];
              if (!clone) return;
              const computed = getComputedStyle(element);
              if (computed.fontSize) clone.setAttribute('data-beaver-font-size', computed.fontSize.replace('px', ''));
              if (computed.fontWeight) clone.setAttribute('data-beaver-font-weight', computed.fontWeight);
            });
            return snapshot.outerHTML;
          })(),
          title: document.title || '',
          url: location.href,
        };
      }
    });

    const pageData = results?.[0]?.result;
    if (!pageData?.html) {
      throw new Error('无法获取页面内容');
    }

    // All popup saves use the same extractor as the page button and content
    // script. This prevents title/strong/paragraph handling from diverging.
    const extracted = BeaverArticleMarkdown.extractArticle(pageData.html, pageData.url, pageData.title);
    if (!extracted) throw new Error('无法提取正文内容');
    title = extracted.title;
    markdown = extracted.markdown;

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
        const uploadedCount = res.uploadedCount || 0;
        const failedCount = res.failedCount || 0;
        const message = failedCount > 0
          ? `笔记已保存，${uploadedCount} 张图片成功，${failedCount} 张失败`
          : uploadedCount > 0
            ? `已保存为普通笔记，${uploadedCount} 张图片已本地化 ✓`
            : '已保存为普通笔记 ✓';
        showToast(toast, message, failedCount > 0 ? 'error' : 'success');
      } else {
        showToast(toast, res?.error || '保存失败', 'error');
      }
    });

  } catch (err) {
    btn.textContent = '提取正文并保存';
    btn.disabled = false;
    showToast(toast, extensionErrorMessage(err, '提取失败'), 'error');
  }
});

// ---- Inject FAB into current page ----
$('#btn-inject-fab').addEventListener('click', async () => {
  const btn = $('#btn-inject-fab');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('无法获取当前标签页');

    // Replace a possibly stale FAB from a previous extension version. Content
    // scripts remain in the page until navigation, so merely detecting the old
    // element would keep the old Markdown converter alive.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        ['beaver-fab', 'beaver-menu', 'beaver-toast'].forEach((id) => {
          document.getElementById(id)?.remove();
        });
      },
    });

    // Inject the FAB scripts
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['readability.js', 'turndown.js', 'articleToMarkdown.js', 'content-fab.js'],
    });

    showToast($('#save-toast'), '浮动按钮已注入 ✓', 'success');
  } catch (err) {
    showToast($('#save-toast'), extensionErrorMessage(err, '注入失败'), 'error');
  }
});

// Init
loadSettings();
loadSelection();
