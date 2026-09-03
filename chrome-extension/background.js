// Beaver — background service worker
// Handles context menus (text + image) and API calls

// ---- Helpers ----
function getBase(apiUrl) {
  return apiUrl.replace(/\/+$/, '').replace(/\/api$/i, '');
}

async function getAuth() {
  const { apiUrl, apiToken } = await chrome.storage.local.get(['apiUrl', 'apiToken']);
  if (!apiUrl || !apiToken) return null;
  return { apiUrl, apiToken, base: getBase(apiUrl) };
}

function notify(title, message) {
  // 通知弹窗
  chrome.notifications.create('beaver-' + Date.now(), {
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title,
    message
  }, () => {
    // 清除 chrome 错误（某些环境不支持通知）
    if (chrome.runtime.lastError) {}
  });
  // 同时在插件图标上显示标记
  chrome.action.setBadgeText({ text: '✓' });
  chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
  setTimeout(() => { chrome.action.setBadgeText({ text: '' }); }, 3000);
}

function imageExtension(contentType) {
  const extensions = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/avif': 'avif'
  };
  return extensions[(contentType || '').toLowerCase()] || 'png';
}

// Upload image from URL to attachment API, returns its local path.
async function uploadImageFromUrl(imageUrl, base, token) {
  const resp = await fetch(imageUrl, { credentials: 'include' });
  if (!resp.ok) throw new Error(`下载图片失败 HTTP ${resp.status}`);
  const blob = await resp.blob();
  if (!blob.type.startsWith('image/')) throw new Error('远程地址返回的不是图片');

  // Use the response MIME type instead of an unreliable URL suffix.
  const ext = imageExtension(blob.type);
  const filename = `image.${ext}`;

  const form = new FormData();
  form.append('file', blob, filename);

  const uploadRes = await fetch(`${base}/api/attachments/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: form
  });
  if (!uploadRes.ok) throw new Error(`上传失败 HTTP ${uploadRes.status}`);
  const data = await uploadRes.json();
  return data.file_path || data.url || data.path;
}

async function localizeMarkdownImages(markdown, pageUrl, base, token) {
  const imageRegex = /!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  const images = [];
  const seen = new Set();
  let match;
  while ((match = imageRegex.exec(markdown)) !== null) {
    const originalUrl = match[1].replace(/^<|>$/g, '');
    if (!originalUrl || originalUrl.startsWith('/uploads/') || seen.has(originalUrl)) continue;
    let resolvedUrl = originalUrl;
    if (!/^(https?:|data:|blob:)/i.test(resolvedUrl)) {
      try {
        resolvedUrl = new URL(resolvedUrl, pageUrl).href;
      } catch {
        continue;
      }
    }
    seen.add(originalUrl);
    images.push({ originalUrl, resolvedUrl });
  }

  const results = await Promise.allSettled(
    images.map(image => uploadImageFromUrl(image.resolvedUrl, base, token))
  );
  let localized = markdown;
  let uploadedCount = 0;
  const failedUrls = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      localized = localized.split(images[index].originalUrl).join(result.value);
      uploadedCount += 1;
    } else {
      failedUrls.push(images[index].originalUrl);
    }
  });
  return { markdown: localized, uploadedCount, failedUrls };
}

async function createMemo(content, base, token) {
  const res = await fetch(`${base}/api/memos/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ content })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Create a document (普通笔记)
async function createDocument(title, base, token) {
  const res = await fetch(`${base}/api/documents/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ title, type: 'note', sort_order: 0 })
  });
  if (!res.ok) throw new Error(`创建文档失败 HTTP ${res.status}`);
  return res.json();
}

// Batch create nodes in a document
async function batchCreateNodes(nodes, base, token) {
  const res = await fetch(`${base}/api/nodes/batch/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(nodes)
  });
  if (!res.ok) throw new Error(`创建节点失败 HTTP ${res.status}`);
  return res.json();
}

// Split markdown into node blocks (by headings and double newlines)
function markdownToNodes(markdown, documentId) {
  const lines = markdown.split('\n');
  const nodes = [];
  let currentBlock = [];
  let sortOrder = 0;

  function flushBlock() {
    const content = currentBlock.join('\n').trim();
    if (content) {
      const heading = detectHeading(content);
      const cleanContent = stripHeading(content);
      nodes.push({
        document_id: documentId,
        content: cleanContent,
        heading: heading || '',
        sort_order: sortOrder++,
      });
    }
    currentBlock = [];
  }

  for (const line of lines) {
    // Heading lines split into their own node
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      flushBlock();
      const level = headingMatch[1].length;
      nodes.push({
        document_id: documentId,
        content: headingMatch[2].trim(),
        heading: `h${level}`,
        sort_order: sortOrder++,
      });
      continue;
    }

    // Horizontal rule = split
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushBlock();
      continue;
    }

    // Empty line = potential block boundary
    if (line.trim() === '') {
      if (currentBlock.length > 0 && currentBlock[currentBlock.length - 1].trim() === '') {
        flushBlock();
      } else {
        currentBlock.push(line);
      }
      continue;
    }

    currentBlock.push(line);
  }
  flushBlock();

  return nodes;
}

function detectHeading(text) {
  const match = text.match(/^(#{1,4})\s+/);
  if (match) return `h${match[1].length}`;
  return '';
}

function stripHeading(text) {
  return text.replace(/^#{1,4}\s+/, '');
}

// ---- 点击插件图标 → 注入浮动按钮（Kiwi Browser 兼容） ----
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  const url = tab.url || '';
  if (!url.startsWith('http://') && !url.startsWith('https://')) return;

  try {
    // Check if button already exists
    const [{ result: exists }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => !!document.getElementById('beaver-fab')
    });
    if (exists) return; // Button already injected

    // Inject the three scripts
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['readability.js', 'turndown.js', 'articleToMarkdown.js', 'content-fab.js']
    });
  } catch (err) {
    console.error('Failed to inject FAB:', err);
  }
});

// ---- Context Menus ----
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'beaver-save-text',
    title: '保存文字到 Beaver Memo',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'beaver-save-image',
    title: '保存图片到 Beaver',
    contexts: ['image']
  });
  chrome.contextMenus.create({
    id: 'beaver-extract-article',
    title: '保存到 Beaver 普通笔记',
    contexts: ['page', 'link']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const auth = await getAuth();
  if (!auth) {
    notify('Beaver', '请先配置 API 地址和 Token');
    return;
  }
  const { base, apiToken } = auth;

  // ---- Save text ----
  if (info.menuItemId === 'beaver-save-text') {
    let content = (info.selectionText || '').trim();
    if (tab?.id) {
      try {
        // contextMenus only exposes selectionText, so read the live selection
        // from the page to preserve headings, paragraphs and emphasis.
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['turndown.js', 'articleToMarkdown.js']
        });
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return null;
            const wrapper = document.createElement('div');
            for (let i = 0; i < selection.rangeCount; i++) {
              wrapper.appendChild(selection.getRangeAt(i).cloneContents());
            }
            const html = wrapper.innerHTML;
            const markdown = window.BeaverArticleMarkdown?.convert(html, location.href) || '';
            return { markdown, text: selection.toString().trim() };
          }
        });
        content = result?.markdown?.trim() || result?.text?.trim() || content;
      } catch {
        // Fall back to the text supplied by Chrome for restricted pages.
      }
    }
    if (!content) return;
    try {
      await createMemo(content, base, apiToken);
      notify('Beaver', '文字已保存 ✓');
    } catch (err) {
      notify('Beaver', `保存失败: ${err.message}`);
    }
  }

  // ---- Save image ----
  if (info.menuItemId === 'beaver-save-image') {
    const imageUrl = info.srcUrl;
    if (!imageUrl) return;
    try {
      const filePath = await uploadImageFromUrl(imageUrl, base, apiToken);
      await createMemo(`![图片](${filePath})`, base, apiToken);
      notify('Beaver', '图片已保存 ✓');
    } catch (err) {
      notify('Beaver', `保存失败: ${err.message}`);
    }
  }

  // ---- Extract article and save as document ----
  if (info.menuItemId === 'beaver-extract-article') {
    const tabId = tab?.id;
    if (!tabId) { notify('Beaver', '无法获取当前页面'); return; }

    try {
      notify('Beaver', '正在提取正文...');

      // Listen for extraction result from content-extract.js
      const extractPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          chrome.runtime.onMessage.removeListener(listener);
          reject(new Error('提取超时'));
        }, 20000);
        function listener(msg) {
          if (msg && msg.type === '_extractResult') {
            clearTimeout(timeout);
            chrome.runtime.onMessage.removeListener(listener);
            if (msg.error) reject(new Error(msg.error));
            else resolve(msg);
          }
        }
        chrome.runtime.onMessage.addListener(listener);
      });

      // Inject all three scripts (same content script world)
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['readability.js', 'turndown.js', 'articleToMarkdown.js', 'content-extract.js']
      });

      const extracted = await extractPromise;

      const title = extracted.title || '未命名笔记';
      let markdown = extracted.markdown || '';
      markdown = markdown.trim();
      if (!markdown || /<(?:!doctype|html|body|head)\b/i.test(markdown)) {
        throw new Error('提取结果不是有效的 Markdown');
      }

      const imageResult = await localizeMarkdownImages(
        markdown,
        tab.url || info.pageUrl || '',
        base,
        apiToken
      );
      markdown = imageResult.markdown;

      const doc = await createDocument(title, base, apiToken);
      // 普通笔记只读取第一个根节点，所有内容放在一个节点里
      await batchCreateNodes([{
        document_id: doc.id,
        content: markdown,
        sort_order: 0,
      }], base, apiToken);

      const imageMessage = imageResult.failedUrls.length > 0
        ? `，${imageResult.failedUrls.length} 张图片上传失败`
        : imageResult.uploadedCount > 0 ? `，${imageResult.uploadedCount} 张图片已本地化` : '';
      notify('Beaver', `已保存: ${title}${imageMessage} ✓`);
    } catch (err) {
      notify('Beaver', `保存失败: ${err.message}`);
    }
  }
});

// ---- Message handler for popup.js ----
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // Save text memo
  if (msg.type === 'saveMemo') {
    (async () => {
      const auth = await getAuth();
      if (!auth) { sendResponse({ ok: false, error: '请先配置 API 地址和 Token' }); return; }
      try {
        await createMemo(msg.content, auth.base, auth.apiToken);
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  // Save image memo (from popup)
  if (msg.type === 'saveImage') {
    (async () => {
      const auth = await getAuth();
      if (!auth) { sendResponse({ ok: false, error: '请先配置 API 地址和 Token' }); return; }
      try {
        const filePath = await uploadImageFromUrl(msg.imageUrl, auth.base, auth.apiToken);
        await createMemo(`![图片](${filePath})`, auth.base, auth.apiToken);
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  // Save text + images combined (from popup)
  if (msg.type === 'saveRichMemo') {
    (async () => {
      const auth = await getAuth();
      if (!auth) { sendResponse({ ok: false, error: '请先配置 API 地址和 Token' }); return; }
      try {
        let content = msg.text || '';
        // Upload each image and append as markdown
        let uploadedCount = 0;
        let failedCount = 0;
        for (const imageUrl of (msg.images || [])) {
          try {
            const filePath = await uploadImageFromUrl(imageUrl, auth.base, auth.apiToken);
            // Rich selection content may already contain this image as Markdown.
            // Replace its remote URL instead of appending a duplicate image.
            if (content.includes(imageUrl)) {
              content = content.split(imageUrl).join(filePath);
            } else {
              content += (content ? '\n\n' : '') + `![图片](${filePath})`;
            }
            uploadedCount += 1;
          } catch {
            failedCount += 1;
          }
        }
        if (!content.trim()) { sendResponse({ ok: false, error: '没有可保存的内容' }); return; }
        await createMemo(content, auth.base, auth.apiToken);
        sendResponse({ ok: true, uploadedCount, failedCount });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  // Save as document (普通笔记) - extract article content
  if (msg.type === 'saveDocument') {
    (async () => {
      const auth = await getAuth();
      if (!auth) { sendResponse({ ok: false, error: '请先配置 API 地址和 Token' }); return; }
      try {
        const { base, apiToken } = auth;
        let markdown = msg.markdown || '';
        const title = msg.title || '未命名笔记';
        const pageUrl = msg.pageUrl || '';
        markdown = markdown.trim();
        if (!markdown) throw new Error('提取结果为空');
        // A conversion failure must never persist the source HTML as note
        // content. It makes the ordinary-note renderer display raw markup.
        if (/<(?:!doctype|html|body|head)\b/i.test(markdown)) {
          throw new Error('提取结果不是有效的 Markdown');
        }

        const imageResult = await localizeMarkdownImages(markdown, pageUrl, base, apiToken);
        markdown = imageResult.markdown;

        // Create document
        const doc = await createDocument(title, base, apiToken);

        // 普通笔记只读取第一个根节点，所有内容放在一个节点里
        await batchCreateNodes([{
          document_id: doc.id,
          content: markdown,
          sort_order: 0,
        }], base, apiToken);

        sendResponse({
          ok: true,
          documentId: doc.id,
          uploadedCount: imageResult.uploadedCount,
          failedCount: imageResult.failedUrls.length
        });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  // Test connection
  if (msg.type === 'testConnection') {
    (async () => {
      const auth = await getAuth();
      if (!auth) { sendResponse({ ok: false, error: '请先配置 API 地址和 Token' }); return; }
      try {
        const res = await fetch(`${auth.base}/api/memos/?page_size=1`, {
          headers: { 'Authorization': `Bearer ${auth.apiToken}` }
        });
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) throw new Error('Token 无效或已过期');
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        sendResponse({ ok: true, username: `共 ${data.total} 条 Memo` });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  return false;
});
