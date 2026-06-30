/**
 * 预处理：转义代码块内的 HTML 标签，防止 rehypeRaw 解析
 */
export function escapeCodeBlockHtml(content: string): string {
  // 匹配 ``` 代码块，转义内部的 < > &
  return content.replace(
    /(```[\s\S]*?```)/g,
    (match) => {
      return match
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
  );
}
