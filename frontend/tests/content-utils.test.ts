import assert from 'node:assert/strict';
import test from 'node:test';

import { flattenParsedNodes, parseMarkdown } from '../src/components/mainAreaClipboard.ts';
import { extractMemoFileLinks, extractMemoImages, extractMemoTags, extractMemoUrls } from '../src/components/memoCardContent.ts';

test('解析 Markdown 层级、任务和备注', () => {
  const tree = parseMarkdown('- [ ] 父任务\n  > 备注\n  - [x] 子任务\n# 标题');
  assert.equal(tree.length, 2);
  assert.deepEqual(tree[0], {
    content: '父任务', note: '备注', is_todo: true, is_completed: false,
    children: [{ content: '子任务', is_todo: true, is_completed: true, children: [] }],
  });
  assert.equal(tree[1].content, '标题');
});

test('展平节点时保留父子关系并递增排序', () => {
  const flat = flattenParsedNodes(parseMarkdown('- 父级\n  - 子级'), 'doc-1', null, 5000);
  assert.equal(flat.length, 2);
  assert.equal(flat[0].sort_order, 5000);
  assert.equal(flat[1].sort_order, 15000);
  assert.equal(flat[1].parent_node_id, flat[0].id);
});

test('Memo 内容提取排除代码标签、图片链接和内部文档链接', () => {
  const content = '#标签 `#代码` ![图](https://cdn.test/a.png) [附件](https://cdn.test/a.pdf) [文档](/d/1) https://site.test/a.';
  assert.deepEqual(extractMemoTags(content), ['#标签']);
  assert.deepEqual(extractMemoImages(content), [{ alt: '图', url: 'https://cdn.test/a.png' }]);
  assert.deepEqual(extractMemoFileLinks(content), [{ name: '附件', url: 'https://cdn.test/a.pdf' }]);
  assert.deepEqual(new Set(extractMemoUrls(content)), new Set(['https://cdn.test/a.png', 'https://cdn.test/a.pdf', 'https://site.test/a']));
});
