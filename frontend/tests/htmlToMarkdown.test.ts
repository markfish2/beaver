import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToMarkdown } from '../src/utils/htmlToMarkdown.ts';

test('粘贴“文字=地址”的链接简化为纯 URL', () => {
  const url = 'https://blog.anionex.me/archives/deepseek-harness-agent-os';
  const html = `<p><a href="${url}">${url}</a></p>`;
  const md = htmlToMarkdown(html);
  assert.ok(md.includes(url));
  assert.ok(!md.includes(']('));
});

test('文字与地址不同的链接保持标准 markdown 形式', () => {
  const html = '<p><a href="https://a.com/page">标题文字</a></p>';
  const md = htmlToMarkdown(html);
  assert.ok(md.includes('[标题文字](https://a.com/page)'));
});
