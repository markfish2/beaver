const TAG_PATTERN = /#[a-zA-Z0-9_一-龥]+/g;

/** 从当前文档内容中提取标签候选，保持 # 前缀并去重。 */
export function extractTagCandidates(contents: readonly string[]): string[] {
  return [...new Set(contents.flatMap(content => content.match(TAG_PATTERN) ?? []))];
}
