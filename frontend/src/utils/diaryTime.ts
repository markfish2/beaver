export interface DiaryTimePrefix {
  value: string;
  start: number;
  end: number;
}

/** 匹配日记节点开头的 8:30、8：30-9：30 等时间范围。 */
export function getDiaryTimePrefix(value: string): DiaryTimePrefix | null {
  const match = value.match(/^\s*(\d{1,2})\s*[:：]\s*([0-5]\d)(?:\s*[-－—–~～]\s*\d{1,2}\s*[:：]\s*[0-5]\d)?/);
  if (!match) return null;
  const startHour = Number(match[1]);
  const endHourMatch = match[0].match(/[-－—–~～]\s*(\d{1,2})\s*[:：]/);
  const endHour = endHourMatch ? Number(endHourMatch[1]) : startHour;
  if (startHour > 23 || endHour > 23) return null;
  const start = match[0].search(/\d/);
  const end = match[0].length;
  return { value: match[0].slice(start).trim(), start, end };
}
