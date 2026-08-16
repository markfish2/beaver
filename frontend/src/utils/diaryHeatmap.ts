import type { Node } from '../api/data';

export interface DiaryDayStats {
  total: number;
  incomplete: number;
}

/** Count non-empty todo children and their incomplete portion for each diary day. */
export function getDiaryDayStats(nodes: Node[]): Record<number, DiaryDayStats> {
  const dayNodeIds = new Map<string, number>();
  const stats: Record<number, DiaryDayStats> = {};

  nodes.forEach(node => {
    if (node.parent_node_id !== null) return;
    const match = node.content.match(/^\d{4}年\d{1,2}月(\d{1,2})日(?:\s|$)/);
    if (match) dayNodeIds.set(node.id, Number(match[1]));
  });

  nodes.forEach(node => {
    if (!node.parent_node_id || !node.is_todo || !node.content.trim()) return;
    const day = dayNodeIds.get(node.parent_node_id);
    if (day === undefined) return;
    const current = stats[day] || { total: 0, incomplete: 0 };
    current.total += 1;
    if (!node.is_completed) current.incomplete += 1;
    stats[day] = current;
  });

  return stats;
}
