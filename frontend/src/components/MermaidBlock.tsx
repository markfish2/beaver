import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import elkLayouts from '@mermaid-js/layout-elk';

let initializedTheme: 'dark' | 'default' | null = null;

async function initMermaid(dark?: boolean) {
  const theme = (dark ?? document.documentElement.classList.contains('dark')) ? 'dark' : 'default';
  if (initializedTheme === theme) return;
  // 注册 ELK 布局插件
  await mermaid.registerExternalDiagrams([elkLayouts]);
  mermaid.initialize({
    startOnLoad: false,
    theme,
    securityLevel: 'loose',
    fontFamily: 'inherit',
    flowchart: {
      curve: 'linear',
      nodeSpacing: 50,
      rankSpacing: 80,
      padding: 15,
    },
  });
  initializedTheme = theme;
}

interface MermaidBlockProps {
  code: string;
  dark?: boolean;
}

export default function MermaidBlock({ code, dark }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      await initMermaid(dark);
      if (!containerRef.current) return;
      try {
        // 预处理：修复常见语法问题，自动注入 ELK 渲染器
        let processedCode = code.trim()
          .replace(/<br\s*\/?>/gi, '<br/>')  // 统一 <br> 格式
          .replace(/&(?!amp;|lt;|gt;|quot;|apos;|#)/g, '&amp;');  // 转义未转义的 &

        // 如果是 flowchart 且未指定渲染器，自动注入 ELK
        if (/^(flowchart|graph)\s/i.test(processedCode) && !processedCode.includes('defaultRenderer')) {
          processedCode = `%%{init: {"flowchart": {"defaultRenderer": "elk"}}}%%\n${processedCode}`;
        }

        const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
        const { svg } = await mermaid.render(id, processedCode);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '渲染失败');
        }
      }
    };

    render();
    return () => { cancelled = true; };
  }, [code, dark]);

  if (error) {
    return (
      <div className="my-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400">
        <p className="font-medium mb-1">Mermaid 渲染错误</p>
        <pre className="whitespace-pre-wrap text-[11px]">{error}</pre>
        <pre className="mt-2 whitespace-pre-wrap text-[11px] text-gray-500">{code}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-2 flex justify-center overflow-x-auto"
      style={{ scrollbarWidth: 'thin' }}
    />
  );
}
