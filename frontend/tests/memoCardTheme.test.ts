import assert from 'node:assert/strict';
import test from 'node:test';
import { MEMO_COLOR_OPTIONS, MEMO_TAG_COLORS } from '../src/components/memoCardTheme.ts';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map(channel => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('每套 MemoCard 配色的正文和辅助文字均满足 WCAG AA', () => {
  for (const option of MEMO_COLOR_OPTIONS) {
    for (const [mode, palette] of [['亮色', option.light], ['暗色', option.dark]] as const) {
      assert.ok(
        contrast(palette.text, palette.background) >= 4.5,
        `${option.name}（${mode}）正文对比度不足`,
      );
      assert.ok(
        contrast(palette.mutedText, palette.background) >= 4.5,
        `${option.name}（${mode}）辅助文字对比度不足`,
      );
      assert.ok(
        contrast(palette.link, palette.background) >= 4.5,
        `${option.name}（${mode}）链接对比度不足`,
      );
      assert.ok(
        contrast(palette.quoteText, palette.background) >= 4.5,
        `${option.name}（${mode}）引用对比度不足`,
      );
      assert.ok(
        contrast(palette.inlineCodeText, palette.inlineCodeBackground) >= 4.5,
        `${option.name}（${mode}）行内代码对比度不足`,
      );
    }
  }
});

test('MemoCard 标签在亮色和暗色模式下均满足小字号对比度', () => {
  for (const [index, color] of MEMO_TAG_COLORS.entries()) {
    assert.ok(contrast(color.text, color.bg) >= 4.5, `第 ${index + 1} 套亮色标签对比度不足`);
    assert.ok(contrast(color.darkText, color.darkBg) >= 4.5, `第 ${index + 1} 套暗色标签对比度不足`);
  }
});

test('默认 MemoCard 夜间背景与 Memo 输入框保持一致', () => {
  const defaultDark = MEMO_COLOR_OPTIONS[0].dark;
  assert.equal(defaultDark.background, '#2e2e2b');
  assert.equal(defaultDark.border, '#343431');
});
