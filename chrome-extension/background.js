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

// Upload image from URL to attachment API, returns markdown image string
async function uploadImageFromUrl(imageUrl, base, token) {
  const resp = await fetch(imageUrl);
  if (!resp.ok) throw new Error(`下载图片失败 HTTP ${resp.status}`);
  const blob = await resp.blob();

  // Derive filename from URL
  const urlPath = new URL(imageUrl, base).pathname;
  const ext = urlPath.split('.').pop()?.split('?')[0] || 'jpg';
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
      files: ['readability.js', 'turndown.js', 'content-fab.js']
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
    const text = (info.selectionText || '').trim();
    if (!text) return;
    try {
      await createMemo(text, base, apiToken);
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
        files: ['readability.js', 'turndown.js', 'content-extract.js']
      });

      const extracted = await extractPromise;

      const title = extracted.title || '未命名笔记';
      let markdown = extracted.markdown || '';

      // Upload images
      const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
      let match;
      const imageUploads = [];
      while ((match = imgRegex.exec(markdown)) !== null) {
        let imgUrl = match[2];
        // Skip already-uploaded or data URIs
        if (imgUrl.startsWith('/uploads/') || imgUrl.startsWith('data:')) continue;
        // Resolve relative URLs to absolute
        if (!imgUrl.startsWith('http')) {
          try {
            imgUrl = new URL(imgUrl, tab.url || info.pageUrl || 'https://example.com').href;
          } catch { continue; }
        }
        imageUploads.push({ full: match[0], url: imgUrl });
      }

      for (let i = 0; i < imageUploads.length; i += 5) {
        const batch = imageUploads.slice(i, i + 5);
        const imgResults = await Promise.allSettled(
          batch.map(img => uploadImageFromUrl(img.url, base, apiToken))
        );
        for (let j = 0; j < batch.length; j++) {
          if (imgResults[j].status === 'fulfilled') {
            // Only replace the URL part, preserve surrounding markdown/link structure
            markdown = markdown.split(batch[j].url).join(imgResults[j].value);
          }
        }
      }

      const doc = await createDocument(title, base, apiToken);
      // 普通笔记只读取第一个根节点，所有内容放在一个节点里
      await batchCreateNodes([{
        document_id: doc.id,
        content: markdown,
        sort_order: 0,
      }], base, apiToken);

      notify('Beaver', `已保存: ${title} ✓`);
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
        for (const imageUrl of (msg.images || [])) {
          try {
            const filePath = await uploadImageFromUrl(imageUrl, auth.base, auth.apiToken);
            content += (content ? '\n\n' : '') + `![图片](${filePath})`;
          } catch {
            // Skip failed images, still save the rest
          }
        }
        if (!content.trim()) { sendResponse({ ok: false, error: '没有可保存的内容' }); return; }
        await createMemo(content, auth.base, auth.apiToken);
        sendResponse({ ok: true });
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

        // Extract image URLs from markdown and upload them
        const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        let match;
        const imageUploads = [];
        while ((match = imgRegex.exec(markdown)) !== null) {
          let imgUrl = match[2];
          if (imgUrl.startsWith('/uploads/') || imgUrl.startsWith('data:')) continue;
          // Resolve relative URLs
          if (!imgUrl.startsWith('http') && pageUrl) {
            try { imgUrl = new URL(imgUrl, pageUrl).href; } catch { continue; }
          }
          imageUploads.push({ full: match[0], url: imgUrl });
        }

        // Upload images in parallel (max 5 concurrent)
        for (let i = 0; i < imageUploads.length; i += 5) {
          const batch = imageUploads.slice(i, i + 5);
          const results = await Promise.allSettled(
            batch.map(img => uploadImageFromUrl(img.url, base, apiToken))
          );
          for (let j = 0; j < batch.length; j++) {
            if (results[j].status === 'fulfilled') {
              // Only replace the URL part, preserve surrounding markdown/link structure
              markdown = markdown.split(batch[j].url).join(results[j].value);
            }
          }
        }

        // Create document
        const doc = await createDocument(title, base, apiToken);

        // 普通笔记只读取第一个根节点，所有内容放在一个节点里
        await batchCreateNodes([{
          document_id: doc.id,
          content: markdown,
          sort_order: 0,
        }], base, apiToken);

        sendResponse({ ok: true, documentId: doc.id });
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
