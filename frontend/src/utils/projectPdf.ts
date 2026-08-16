import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { Task } from '../api/projects';

interface ExportProjectPdfOptions {
  projectName: string;
  tasks: Task[];
  ganttCanvas?: HTMLCanvasElement | null;
}

const UI_FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '--';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[1]}/${parts[2]}`;
}

function formatFullDate(dateStr: string): string {
  if (!dateStr) return '--';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[0]}年${Number(parts[1])}月${Number(parts[2])}日`;
}

function getProjectSpan(tasks: Task[]): { start: string; end: string } | null {
  let start: string | null = null;
  let end: string | null = null;
  const walk = (list: Task[]) => {
    for (const task of list) {
      if (start === null || task.start_date < start) start = task.start_date;
      if (end === null || task.end_date > end) end = task.end_date;
      walk(task.children);
    }
  };
  walk(tasks);
  return start !== null && end !== null ? { start, end } : null;
}

function buildTaskRows(tasks: Task[]): string {
  const rows: string[] = [];
  const walk = (list: Task[], depth: number) => {
    for (const task of list) {
      const indent = depth * 18;
      const doneMark = task.is_done ? '&#10003;' : '';
      const titleClass = task.is_done ? 'color:#9ca3af;text-decoration:line-through;' : 'color:#111827;';
      const summaryClass = task.children.length > 0 ? 'font-weight:600;' : '';
      rows.push(`
        <tr>
          <td style="width:34px;text-align:center;color:#4d9383;font-size:13px;">${doneMark}</td>
          <td style="padding:5px 8px;padding-left:${8 + indent}px;font-size:13px;${titleClass}${summaryClass}">${escapeHtml(task.title)}</td>
          <td style="width:110px;text-align:right;padding:5px 8px;font-size:12px;color:#6b7280;white-space:nowrap;">${formatDate(task.start_date)} — ${formatDate(task.end_date)}</td>
        </tr>`);
      walk(task.children, depth + 1);
    }
  };
  walk(tasks, 0);
  return rows.join('');
}

function buildTaskPageHtml(projectName: string, tasks: Task[]): string {
  const now = new Date();
  const dateLabel = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
  const span = getProjectSpan(tasks);
  const spanLabel = span ? `${formatFullDate(span.start)} ~ ${formatFullDate(span.end)}` : '--';
  const taskSection = tasks.length > 0
    ? `
      <table style="width:100%;border-collapse:collapse;font-family:${UI_FONT_STACK};">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="width:34px;padding:6px 8px;"></th>
            <th style="text-align:left;padding:6px 8px;font-size:12px;color:#374151;">任务</th>
            <th style="width:110px;text-align:right;padding:6px 8px;font-size:12px;color:#374151;">时间</th>
          </tr>
        </thead>
        <tbody>
          ${buildTaskRows(tasks)}
        </tbody>
      </table>`
    : `<div style="padding:16px 8px;font-size:13px;color:#9ca3af;font-family:${UI_FONT_STACK};">暂无任务</div>`;

  return `
    <div style="width:1400px;padding:24px;background:#ffffff;color:#111827;font-family:${UI_FONT_STACK};">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #e5e7eb;padding-bottom:14px;">
        <div style="font-size:24px;font-weight:700;">${escapeHtml(projectName || '项目')}</div>
        <div style="font-size:12px;color:#6b7280;text-align:right;">生成时间：${dateLabel}<br/>任务周期：${spanLabel}</div>
      </div>
      <div style="margin-top:14px;">${taskSection}</div>
    </div>`;
}

function waitForImages(host: HTMLElement): Promise<void> {
  const images = Array.from(host.querySelectorAll('img'));
  return Promise.all(images.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise<void>(resolve => {
      img.addEventListener('load', () => resolve(), { once: true });
      img.addEventListener('error', () => resolve(), { once: true });
    });
  })).then(() => undefined);
}

async function captureHtml(html: string): Promise<HTMLCanvasElement> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;z-index:-1;background:#ffffff;';
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    await waitForImages(host);
    await document.fonts?.ready;
    return await html2canvas(host, {
      backgroundColor: '#ffffff',
      scale: 1.5,
      logging: false,
      useCORS: true,
    });
  } finally {
    host.remove();
  }
}

export async function exportProjectPdf(options: ExportProjectPdfOptions): Promise<void> {
  const { projectName, tasks, ganttCanvas } = options;

  let ganttDataUrl: string | null = null;
  let ganttWidth = 0;
  let ganttHeight = 0;
  if (ganttCanvas) {
    const maxWidth = 2400;
    if (ganttCanvas.width > maxWidth) {
      const ratio = maxWidth / ganttCanvas.width;
      const resized = document.createElement('canvas');
      resized.width = maxWidth;
      resized.height = Math.max(1, Math.round(ganttCanvas.height * ratio));
      const ctx = resized.getContext('2d');
      if (ctx) ctx.drawImage(ganttCanvas, 0, 0, resized.width, resized.height);
      ganttDataUrl = resized.toDataURL('image/png');
      ganttWidth = resized.width;
      ganttHeight = resized.height;
    } else {
      ganttDataUrl = ganttCanvas.toDataURL('image/png');
      ganttWidth = ganttCanvas.width;
      ganttHeight = ganttCanvas.height;
    }
  }

  const taskCanvas = await captureHtml(buildTaskPageHtml(projectName, tasks));
  const taskImgData = taskCanvas.toDataURL('image/png');

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;
  const contentHeight = pageHeight - margin * 2;

  // 第一页起：任务清单，长列表跨页续排
  const taskFullHeightMm = taskCanvas.height * (contentWidth / taskCanvas.width);
  let offsetY = 0;
  let isFirstPage = true;
  while (offsetY < taskFullHeightMm - 0.01) {
    if (!isFirstPage) pdf.addPage();
    isFirstPage = false;
    pdf.addImage(taskImgData, 'PNG', margin, margin - offsetY, contentWidth, taskFullHeightMm);
    offsetY += contentHeight;
  }

  // 甘特图独占下一页，整图等比缩放放入内容区，不被分页切断
  if (ganttDataUrl && ganttWidth > 0 && ganttHeight > 0) {
    pdf.addPage();
    const aspect = ganttWidth / ganttHeight;
    let drawWidth = contentWidth;
    let drawHeight = drawWidth / aspect;
    if (drawHeight > contentHeight) {
      drawHeight = contentHeight;
      drawWidth = drawHeight * aspect;
    }
    const drawX = margin + (contentWidth - drawWidth) / 2;
    const drawY = margin + (contentHeight - drawHeight) / 2;
    pdf.addImage(ganttDataUrl, 'PNG', drawX, drawY, drawWidth, drawHeight);
  }

  pdf.save(`${projectName || '项目'}.pdf`);
}
