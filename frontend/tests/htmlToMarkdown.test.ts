import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPasteMarkdown,
  getPasteMarkdownAsync,
  hasHtmlClipboardData,
  htmlToMarkdown,
} from '../src/utils/htmlToMarkdown.ts';

test('粘贴“文字=地址”的链接简化为纯 URL', () => {
  const url = 'https://blog.anionex.me/archives/deepseek-harness-agent-os';
  const html = `<p><a href="${url}">${url}</a></p>`;
  const md = htmlToMarkdown(html);
  assert.ok(md.includes(url));
  assert.ok(!md.includes(']('));
});

test('真实 URL 文字不被追踪短链包装', () => {
  const html = '<p><a href="https://t.co/nPusDfUxKp">https://github.com/zenghui-li/yuxi</a></p>';
  assert.equal(htmlToMarkdown(html), 'https://github.com/zenghui-li/yuxi');
});

test('文字与地址不同的链接保持标准 markdown 形式', () => {
  const html = '<p><a href="https://a.com/page">标题文字</a></p>';
  const md = htmlToMarkdown(html);
  assert.ok(md.includes('[标题文字](https://a.com/page)'));
});

test('网页结构转换为 Markdown 段落、标题和列表', () => {
  const html = [
    '<h2>网页标题</h2>',
    '<p>第一段内容</p>',
    '<p><strong>第二段内容</strong></p>',
    '<ul><li>条目一</li><li>条目二</li></ul>',
  ].join('');
  const md = htmlToMarkdown(html);

  assert.match(md, /^## 网页标题/m);
  assert.match(md, /第一段内容/);
  assert.match(md, /\*\*第二段内容\*\*/);
  assert.match(md, /-\s+条目一/);
  assert.match(md, /-\s+条目二/);
});

test('网页复制的样式标题不会输出字面量换行符', () => {
  const md = htmlToMarkdown('<div class="post-title" style="font-size: 24px; font-weight: 700">视觉标题</div>');
  assert.equal(md, '## 视觉标题');
  assert.ok(!md.includes('\\n'));
});

test('保留 X 文本节点中的 pre-wrap 段落换行', () => {
  const html = '<div data-testid="tweetText" class="r-bcqeeo"><span>第一段内容。\n\n第二段内容。\n第三行内容。</span></div>';
  const md = htmlToMarkdown(html);

  assert.equal(md, '第一段内容。  \n  \n第二段内容。  \n第三行内容。');
});

test('剪贴板 HTML 优先转换为 Markdown', () => {
  const html = '<p>网页段落</p><p><a href="https://example.com">网页链接</a></p>';
  const clipboardData = {
    getData(type: string) {
      return type === 'text/html' ? html : '';
    },
  } as unknown as DataTransfer;

  const md = getPasteMarkdown(clipboardData);
  assert.equal(md, '网页段落\n\n[网页链接](https://example.com)');
});

test('兼容 DataTransferItem 异步提供 HTML', async () => {
  const clipboardData = {
    getData(type: string) {
      return type === 'text/plain' ? '网页纯文本' : '';
    },
    items: [{
      kind: 'string',
      type: 'text/html',
      getAsString(callback: (value: string) => void) {
        callback('<p><strong>网页富文本</strong></p>');
      },
    }],
  } as unknown as DataTransfer;

  assert.equal(hasHtmlClipboardData(clipboardData), true);
  assert.equal(await getPasteMarkdownAsync(clipboardData), '**网页富文本**');
});
