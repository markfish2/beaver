interface ExportNotePdfOptions {
  /** 已渲染的 Markdown 内容区（memo-content），导出时取其 HTML 注入打印上下文 */
  surface: HTMLElement;
  title: string;
}

const PRINT_READY_TIMEOUT_MS = 20000;
const IMAGE_READY_TIMEOUT_MS = 8000;
/** 打印内容区（A4 210×297mm、12mm 边距）换算为 CSS px */
const PRINT_CONTENT_WIDTH_PX = 702;
/** 给 Mermaid 外层容器（padding/border/外边距）留出余量，保证整块真正放得下一页 */
const PRINT_CONTENT_HEIGHT_PX = 930;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

function waitWithTimeout(promise: Promise<unknown>, ms: number): Promise<void> {
  return Promise.race([
    promise.then(() => undefined),
    new Promise<void>(resolve => setTimeout(resolve, ms)),
  ]);
}

/**
 * 普通笔记导出 PDF：使用独立的打印上下文（iframe + @media print 规范），
 * 由浏览器原生打印引擎排版，代码块/流程图等原子块通过 break-inside: avoid 保证不跨页。
 */
export function exportNotePdf(options: ExportNotePdfOptions): Promise<void> {
  const { surface, title } = options;

  return new Promise<void>((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:fixed;left:-99999px;top:0;width:820px;height:600px;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);

    let settled = false;
    let started = false;

    const cleanup = () => {
      setTimeout(() => iframe.remove(), 0);
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };
    const done = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    // 整体超时兜底：任何环节卡住都会结束“导出中”状态
    const overallTimeout = setTimeout(() => {
      fail(new Error('导出超时，请重试'));
    }, PRINT_READY_TIMEOUT_MS);

    const setup = () => {
      if (started || settled) return;
      const doc = iframe.contentDocument;
      const win = iframe.contentWindow;
      if (!doc || !win || !doc.body) {
        setTimeout(setup, 50);
        return;
      }
      started = true;

      try {
        // 复制根节点属性（data-markdown-style 等主题标记），但不带 .dark，保证浅色渲染
        for (const attr of Array.from(document.documentElement.attributes)) {
          if (attr.name === 'class') {
            const classes = attr.value.split(/\s+/).filter(c => c !== 'dark').join(' ');
            if (classes) doc.documentElement.setAttribute('class', classes);
          } else {
            doc.documentElement.setAttribute(attr.name, attr.value);
          }
        }

        // 复制应用样式（含各 Markdown 主题样式）
        const head = doc.head;
        document.querySelectorAll('style, link[rel="stylesheet"]').forEach(el => {
          head.appendChild(el.cloneNode(true));
        });

        // 打印专用规范
        const printStyle = doc.createElement('style');
        printStyle.textContent = `
          @page { size: A4; margin: 12mm; }
          @media print {
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              color: #1f2937 !important;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif;
              font-size: 16px;
            }
            .memo-content,
            .markdown-note-preview {
              width: auto !important;
              max-width: none !important;
              padding: 0 !important;
              margin: 0 !important;
              background: #ffffff !important;
              color: #1f2937 !important;
              line-height: 1.75;
            }
            .memo-content p,
            .memo-content li,
            .memo-content h1,
            .memo-content h2,
            .memo-content h3,
            .memo-content h4,
            .memo-content h5,
            .memo-content h6 {
              color: inherit;
            }
            .note-pdf-header {
              margin: 0 0 14px;
              padding-bottom: 10px;
              border-bottom: 2px solid #e5e7eb;
            }
            .note-pdf-header h1 {
              margin: 0 0 6px;
              font-size: 24px;
              line-height: 1.3;
            }
            .note-pdf-header .note-pdf-date {
              font-size: 12px;
              color: #6b7280;
            }
            pre,
            .markdown-code-block,
            .markdown-code-block-root,
            .mermaid-surface,
            table,
            blockquote,
            img,
            .markdown-image-block,
            .markdown-media-block,
            .memo-media-block {
              break-inside: avoid;
              page-break-inside: avoid;
            }
          }
        `;
        head.appendChild(printStyle);

        // 正文：标题头 + 已渲染的 Markdown HTML
        const body = doc.body;
        body.innerHTML = '';
        const container = doc.createElement('div');
        container.className = 'memo-content';

        const now = new Date();
        const header = doc.createElement('div');
        header.className = 'note-pdf-header';
        header.innerHTML = `
          <h1>${escapeHtml(title || '笔记')}</h1>
          <div class="note-pdf-date">${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日</div>
        `;
        container.appendChild(header);

        const content = doc.createElement('div');
        content.innerHTML = surface.innerHTML;
        container.appendChild(content);
        body.appendChild(container);

        // Mermaid 等 SVG：默认保持网页实际渲染尺寸；
        // 超过一页可容纳范围时，按比例缩放到适合一页（宽高都适配），避免硬塞导致溢出。
        const sourceSvgs = Array.from(surface.querySelectorAll('svg'));
        const targetSvgs = Array.from(doc.querySelectorAll('svg'));
        targetSvgs.forEach((svg, index) => {
          const sourceRect = sourceSvgs[index]?.getBoundingClientRect();
          if (sourceRect && sourceRect.width > 0 && sourceRect.height > 0) {
            const parentWidth = svg.parentElement?.getBoundingClientRect().width || PRINT_CONTENT_WIDTH_PX;
            const scale = Math.min(
              1,
              parentWidth / sourceRect.width,
              PRINT_CONTENT_HEIGHT_PX / sourceRect.height
            );
            svg.style.setProperty('width', `${sourceRect.width * scale}px`, 'important');
            svg.style.setProperty('height', `${sourceRect.height * scale}px`, 'important');
            svg.style.setProperty('max-width', 'none', 'important');
          }
        });

        // 图片强制 eager 并按应用地址绝对化，避免离屏懒加载导致等待挂死
        doc.querySelectorAll('img').forEach(img => {
          img.loading = 'eager';
          img.decoding = 'sync';
          const src = img.getAttribute('src');
          if (src) {
            try {
              img.src = new URL(src, window.location.href).href;
            } catch {
              img.src = src;
            }
          }
        });

        // 等待图片与字体就绪（带超时），再调起打印
        const images = Array.from(doc.images);
        const imagesReady = Promise.all(images.map(img => (
          img.complete && img.naturalWidth > 0
            ? Promise.resolve()
            : new Promise<void>(resolveImg => {
                img.addEventListener('load', () => resolveImg(), { once: true });
                img.addEventListener('error', () => resolveImg(), { once: true });
              })
        )));

        Promise.resolve()
          .then(() => waitWithTimeout(imagesReady, IMAGE_READY_TIMEOUT_MS))
          .then(() => waitWithTimeout(doc.fonts?.ready ?? Promise.resolve(), IMAGE_READY_TIMEOUT_MS))
          .then(() => {
            clearTimeout(overallTimeout);
            win.focus();
            win.print();
            done();
          })
          .catch(err => {
            clearTimeout(overallTimeout);
            fail(err instanceof Error ? err : new Error(String(err)));
          });
      } catch (err) {
        clearTimeout(overallTimeout);
        fail(err instanceof Error ? err : new Error(String(err)));
      }
    };

    iframe.onload = setup;
    // 兜底：onload 未触发时轮询等待文档就绪
    setTimeout(() => {
      if (!started && !settled) setup();
    }, 300);

    iframe.srcdoc =
      '<!doctype html><html><head><meta charset="utf-8"><title>导出 PDF</title></head><body></body></html>';
  });
}
