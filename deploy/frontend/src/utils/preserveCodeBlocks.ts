/**
 * rehype 插件：在 rehypeRaw 之前运行，将代码块中的 raw HTML 节点转为文本节点
 * 这样 rehypeRaw 就不会解析代码块里的 HTML
 */
import type { Root, Element } from 'hast';

export function preserveCodeBlocks() {
  return (tree: Root) => {
    function walk(node: any, inCodeBlock = false) {
      if (node.type === 'element' && (node.tagName === 'pre' || node.tagName === 'code')) {
        inCodeBlock = true;
      }
      
      if (inCodeBlock && node.type === 'raw') {
        // 将 raw HTML 转为文本节点
        node.type = 'text';
        node.value = node.value || '';
      }
      
      if (node.children) {
        for (const child of node.children) {
          walk(child, inCodeBlock);
        }
      }
    }
    walk(tree);
  };
}
