/**
 * 待办截止日期解析工具
 * 从 todo content 中提取 !M.D 或 ！M.D 格式的截止日期
 */

export interface ParsedTodo {
  /** 去掉日期标记后的显示文本 */
  displayContent: string;
  /** 解析出的日期对象，无效或无标记时为 null */
  dueDate: Date | null;
  /** "M/D" 格式字符串，无日期时为空 */
  dueDateLabel: string;
  /** 紧急度：today=今天，soon=3天内，normal=其他，null=无日期 */
  urgency: 'today' | 'soon' | 'normal' | null;
}

// 匹配中英文感叹号后跟 月.日 格式
const DUE_DATE_REGEX = /[!！](\d{1,2})\.(\d{1,2})/;

/**
 * 解析待办内容中的截止日期标记
 * @param content 待办原始文本
 * @returns 解析结果（显示文本、日期、标签、紧急度）
 */
export function parseTodoDueDate(content: string): ParsedTodo {
  const noDate: ParsedTodo = {
    displayContent: content,
    dueDate: null,
    dueDateLabel: '',
    urgency: null,
  };

  const match = content.match(DUE_DATE_REGEX);
  if (!match) return noDate;

  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);

  // 校验范围
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return noDate;
  }

  const now = new Date();
  const currentYear = now.getFullYear();

  // 先用当前年构造日期
  let dueDate = new Date(currentYear, month - 1, day);

  // 检查 Date 是否发生了溢出回滚（如 2月30 → 3月2）
  // JavaScript Date 构造时 day 超出会自动进位到下月
  if (dueDate.getMonth() !== month - 1) {
    // 日期无效（如 2.29 非闰年会变成 3.1），仍然接受进位后的结果
    // 但严格来说，用户输入 !2.29 应该解析为 2 月最后一天
    // 这里简单处理：取该月最后一天
    const lastDay = new Date(currentYear, month, 0).getDate();
    dueDate = new Date(currentYear, month - 1, Math.min(day, lastDay));
  }

  // 若日期已过（今天之前），推到明年
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (dueDate < todayStart) {
    dueDate = new Date(currentYear + 1, month - 1, day);
    // 同样检查明年的溢出
    if (dueDate.getMonth() !== month - 1) {
      const lastDay = new Date(currentYear + 1, month, 0).getDate();
      dueDate = new Date(currentYear + 1, month - 1, Math.min(day, lastDay));
    }
  }

  // 从 content 中剥离日期标记，清理多余空格
  const displayContent = content
    .replace(DUE_DATE_REGEX, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // 紧急度判断
  const dueDateStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const diffDays = Math.ceil((dueDateStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));

  let urgency: 'today' | 'soon' | 'normal';
  if (diffDays <= 0) {
    urgency = 'today';
  } else if (diffDays <= 3) {
    urgency = 'soon';
  } else {
    urgency = 'normal';
  }

  return {
    displayContent,
    dueDate,
    dueDateLabel: `${month}/${day}`,
    urgency,
  };
}
