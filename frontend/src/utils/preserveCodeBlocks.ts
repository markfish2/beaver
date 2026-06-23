/**
 * rehype 插件：在 rehypeRaw 之后运行，恢复被错误解析的代码块内容
 * rehypeRaw 会把代码块里的 HTML 也解析了，这个插件把它们恢复为文本
 */
import type { Root } from 'hast';

export function preserveCodeBlocks() {
  return (tree: Root) => {
    function walk(node: any) {
      if (node.type === 'element' && node.tagName === 'pre') {
        // 找到 <pre> 元素，提取纯文本内容
        const codeEl = node.children?.find((c: any) => c.type === 'element' && c.tagName === 'code');
        if (codeEl) {
          // 收集所有文本内容
          const text = collectText(codeEl);
          // 替换 code 元素的子节点为纯文本
          codeEl.children = [{ type: 'text', value: text }];
        }
      }
      if (node.children) {
        for (const child of node.children) {
          walk(child);
        }
      }
    }
    walk(tree);
  };
}

function collectText(node: any): string {
  if (node.type === 'text') return node.value || '';
  if (node.type === 'raw') return node.value || '';
  if (node.children) {
    return node.children.map((c: any) => collectText(c)).join('');
  }
  return '';
}
