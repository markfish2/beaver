/**
 * 安全版 rehypeRaw：跳过 <pre> 和 <code> 标签内的 HTML 解析
 */
import type { Root } from 'hast';

interface MutableHastNode {
  type: string;
  tagName?: string;
  value?: string;
  children?: MutableHastNode[];
}

export function safeRehypeRaw() {
  return (tree: Root) => {
    // 递归处理，跳过 pre/code 节点内的 raw HTML
    function walk(node: MutableHastNode, inPre = false) {
      if (node.type === 'raw' && inPre) {
        // 在 pre/code 内的 raw HTML 转为文本节点
        node.type = 'text';
        return;
      }
      if (node.tagName === 'pre' || node.tagName === 'code') {
        inPre = true;
      }
      if (node.children) {
        for (const child of node.children) {
          walk(child, inPre);
        }
      }
    }
    walk(tree as unknown as MutableHastNode);
  };
}
