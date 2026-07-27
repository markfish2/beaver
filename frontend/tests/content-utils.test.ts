import assert from 'node:assert/strict';
import test from 'node:test';

import { flattenParsedNodes, parseMarkdown } from '../src/components/mainAreaClipboard.ts';
import { extractMemoFileLinks, extractMemoImages, extractMemoTags, extractMemoUrls } from '../src/components/memoCardContent.ts';
import { normalizeCallouts, preprocessMarkdown } from '../src/utils/markdownPreprocess.ts';

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

test('缩进 callout 不会影响后续正文和列表解析', () => {
  const content = [
    '> 测试',
    '- 测试',
    '> [!info] 注意  ',
    '> 这是感叹号',
    '**坚持**',
    '  - 测定时',
    '  - 测试',
    '',
    ' > [!info] 注意',
    '  > 这是感叹号',
    '',
    '这个会影响到后面',
    '  **坚持**',
    '    - 测定时',
    '    - 测试',
  ].join('\n');

  const normalized = normalizeCallouts(content);
  assert.equal((normalized.match(/class="callout callout-info"/g) || []).length, 2);
  assert.ok(normalized.includes('</div>\n\n**坚持**'));
  const twoSpaces = ' '.repeat(2);
  const fourSpaces = ' '.repeat(4);
  assert.ok(normalized.endsWith(`\n这个会影响到后面\n${twoSpaces}**坚持**\n${fourSpaces}- 测定时\n${fourSpaces}- 测试`));
  const processed = preprocessMarkdown(content);
  assert.ok(processed.includes(`</div>\n\n**坚持**\n\n${twoSpaces}- 测定时\n${twoSpaces}- 测试`));
  assert.ok(processed.endsWith(`\n这个会影响到后面\n${twoSpaces}**坚持**\n\n${fourSpaces}- 测定时\n${fourSpaces}- 测试`));
});
