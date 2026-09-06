import assert from 'node:assert/strict';
import test from 'node:test';

import type { NoteHighlight } from '../src/api/data.ts';
import { buildRenderedTextIndex, formatNoteHighlightsAsMemo, normalizeHighlightSource, normalizeHighlightText, resolveNoteHighlight, sortNoteHighlightsByDocumentOrder, sourceMayContainNoteHighlight } from '../src/utils/noteHighlights.ts';

type RenderedTextIndex = Parameters<typeof resolveNoteHighlight>[0];

function makeIndex(text: string): RenderedTextIndex {
  const node = { data: text, parentElement: null } as unknown as Text;
  return {
    text,
    entries: Array.from(text, (_, index) => ({ node, rawStart: index, rawEnd: index + 1 })),
  };
}

function makeHighlight(overrides: Partial<NoteHighlight>): NoteHighlight {
  return {
    id: 'highlight-1',
    document_id: 'document-1',
    quote: '',
    prefix: '',
    suffix: '',
    block_line: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function makeRenderedRoot(chunks: string[]): HTMLElement {
  let nodes: Text[] = [];
  const root: {
    contains: () => boolean;
    ownerDocument: { createTreeWalker: () => { nextNode: () => Text | null } };
  } = {
    contains: () => true,
    ownerDocument: {
      createTreeWalker: () => {
        let index = 0;
        return { nextNode: () => nodes[index++] ?? null };
      },
    },
  };
  nodes = chunks.map(data => {
    const parent = {
      tagName: 'P',
      parentElement: root,
      closest: () => null,
    };
    return { nodeType: 3, data, parentElement: parent } as unknown as Text;
  });
  return root as unknown as HTMLElement;
}

test('划线文本归一化连续空白，但保留中文和标点', () => {
  assert.equal(normalizeHighlightText('  第一\n\n段\t内容  '), '第一 段 内容');
});

test('阅读区索引把连续空白和段落边界归一化为一个空格', () => {
  const index = buildRenderedTextIndex(makeRenderedRoot(['第一  段 ', '第二\t段']));
  assert.equal(index.text, '第一 段 第二 段');
});

test('相同引用优先按前后文定位', () => {
  const index = makeIndex('第一处：目标。中间内容。第二处：目标。');
  const match = resolveNoteHighlight(index, makeHighlight({
    quote: '目标',
    prefix: '第一处：',
    suffix: '。中间',
  }));

  assert.equal(match?.text, '目标');
  assert.equal(match?.start, 4);
});

test('引用少量改字时重新定位，整段删除时返回空', () => {
  const changed = resolveNoteHighlight(
    makeIndex('前文 保留的内容 后文'),
    makeHighlight({ quote: '保留内容', prefix: '前文 ', suffix: ' 后文' }),
  );
  assert.equal(changed?.text, '保留的内容');

  const deleted = resolveNoteHighlight(
    makeIndex('前文 后文'),
    makeHighlight({ quote: '保留内容', prefix: '前文 ', suffix: ' 后文' }),
  );
  assert.equal(deleted, null);
});

test('虚拟化块未挂载时，按源文本区分改字和整段删除', () => {
  const highlight = makeHighlight({ quote: '保留内容', prefix: '前文 ', suffix: ' 后文' });
  assert.equal(sourceMayContainNoteHighlight(normalizeHighlightSource('前文 保留的内容 后文'), highlight), true);
  assert.equal(sourceMayContainNoteHighlight(normalizeHighlightSource('前文 后文'), highlight), false);
});

test('划线按顺序转换成 Memo 引用块并追加原笔记链接', () => {
  const content = formatNoteHighlightsAsMemo('数据库笔记', 'document-1', [
    makeHighlight({ id: 'first', quote: '第一条划线' }),
    makeHighlight({ id: 'second', quote: '第二条\n补充内容' }),
  ]);

  assert.equal(content, [
    '## 数据库笔记',
    '> 第一条划线',
    '> 第二条\n> 补充内容',
    '[@数据库笔记](/d/document-1)',
  ].join('\n\n'));
});

test('划线按正文位置排序，而不是按创建顺序', () => {
  const source = '前文 第一处 后文 第二处 结尾';
  const ordered = sortNoteHighlightsByDocumentOrder([
    makeHighlight({ id: 'second', quote: '第二处', prefix: '后文 ', suffix: ' 结尾', block_line: 2 }),
    makeHighlight({ id: 'first', quote: '第一处', prefix: '前文 ', suffix: ' 后文', block_line: 20 }),
  ], source);

  assert.deepEqual(ordered.map(highlight => highlight.id), ['first', 'second']);
});
