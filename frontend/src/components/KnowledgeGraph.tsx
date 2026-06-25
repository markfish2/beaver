import { useEffect, useRef, useState } from 'react';
import { forceSimulation, forceCollide, forceLink, forceManyBody, forceRadial } from 'd3-force';
import { zoom } from 'd3-zoom';
import { select } from 'd3-selection';
import api from '../api/client';
import { Loader2 } from 'lucide-react';

interface GraphNode {
  id: string;
  title: string;
  type: string;
  source_type: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  weight: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Claude 配色方案
const NODE_COLORS: Record<string, { fill: string; stroke: string; darkFill: string; darkStroke: string }> = {
  memo: { fill: '#f5e6d8', stroke: '#e8a87c', darkFill: '#3d2e1f', darkStroke: '#c08552' },
  document: { fill: '#dde5ee', stroke: '#89a8c8', darkFill: '#1e2d3d', darkStroke: '#5b8ab5' },
  note: { fill: '#e0eae4', stroke: '#7fb89e', darkFill: '#1e2d25', darkStroke: '#5a9e7a' },
};

function getNodeColor(sourceType: string, isDark: boolean) {
  const c = NODE_COLORS[sourceType] || NODE_COLORS.document;
  return isDark ? { fill: c.darkFill, stroke: c.darkStroke } : { fill: c.fill, stroke: c.stroke };
}

export default function KnowledgeGraph({ onNodeClick }: { onNodeClick: (id: string, type: string) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GraphData | null>(null);

  useEffect(() => {
    api.get('/knowledge-graph/', { params: { threshold: 0.55, max_edges: 100 } })
      .then(resp => setData(resp.data))
      .catch(() => setError('加载失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!data || !svgRef.current || !containerRef.current) return;

    const svg = svgRef.current;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const isDark = document.documentElement.classList.contains('dark');
    const radius = Math.min(width, height) / 2 - 60;

    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(g);

    // 节点初始位置：随机分布在圆内
    const nodes = data.nodes.map((n) => {
      const angle = Math.random() * 2 * Math.PI;
      const r = Math.sqrt(Math.random()) * radius * 0.8;
      return {
        ...n,
        x: width / 2 + r * Math.cos(angle),
        y: height / 2 + r * Math.sin(angle),
      };
    });
    const links = data.edges.map(e => ({ ...e, source: e.source, target: e.target }));

    // 力导向模拟：约束在圆形范围内
    const sim = forceSimulation(nodes)
      .force('radial', forceRadial(radius * 0.85, width / 2, height / 2).strength(0.6))
      .force('charge', forceManyBody().strength(-40))
      .force('collision', forceCollide().radius(22))
      .force('link', forceLink(links).id((d: any) => d.id).distance(50).strength(0.3))
      .alpha(1)
      .alphaDecay(0.03);

    // 边
    const linkGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.appendChild(linkGroup);
    const linkEls: SVGLineElement[] = [];
    for (const link of links) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('stroke', isDark ? '#4b5563' : '#d1d5db');
      line.setAttribute('stroke-width', String(Math.max(0.5, link.weight * 1.5)));
      line.setAttribute('stroke-opacity', '0.3');
      linkGroup.appendChild(line);
      linkEls.push(line);
    }

    // 节点
    const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.appendChild(nodeGroup);
    const nodeEls: SVGGElement[] = [];

    for (const node of nodes) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      el.style.cursor = 'pointer';

      const colors = getNodeColor(node.source_type, isDark);
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', '7');
      circle.setAttribute('fill', colors.fill);
      circle.setAttribute('stroke', colors.stroke);
      circle.setAttribute('stroke-width', '2');
      el.appendChild(circle);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.textContent = node.title;
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dy', '18');
      text.setAttribute('font-size', '10');
      text.setAttribute('fill', isDark ? '#9ca3af' : '#6b7280');
      text.setAttribute('pointer-events', 'none');
      el.appendChild(text);

      el.addEventListener('click', () => onNodeClick(node.id, node.source_type));
      nodeGroup.appendChild(el);
      nodeEls.push(el);
    }

    // 拖拽
    let draggingNode: any = null;
    const handleMouseDown = (e: MouseEvent, i: number) => {
      e.preventDefault();
      draggingNode = nodes[i];
      draggingNode.fx = draggingNode.x;
      draggingNode.fy = draggingNode.y;
      sim.alphaTarget(0.3).restart();
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingNode) return;
      const rect = svg.getBoundingClientRect();
      draggingNode.fx = e.clientX - rect.left;
      draggingNode.fy = e.clientY - rect.top;
    };
    const handleMouseUp = () => {
      if (draggingNode) {
        draggingNode.fx = null;
        draggingNode.fy = null;
        draggingNode = null;
        sim.alphaTarget(0);
      }
    };

    nodeEls.forEach((el, i) => {
      el.addEventListener('mousedown', (e) => handleMouseDown(e, i));
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        draggingNode = nodes[i];
        draggingNode.fx = draggingNode.x;
        draggingNode.fy = draggingNode.y;
        sim.alphaTarget(0.3).restart();
      });
    });
    svg.addEventListener('mousemove', handleMouseMove);
    svg.addEventListener('touchmove', (e) => {
      if (!draggingNode) return;
      const touch = e.touches[0];
      const rect = svg.getBoundingClientRect();
      draggingNode.fx = touch.clientX - rect.left;
      draggingNode.fy = touch.clientY - rect.top;
    });
    svg.addEventListener('mouseup', handleMouseUp);
    svg.addEventListener('touchend', handleMouseUp);

    // 缩放
    const zoomBehavior = zoom()
      .scaleExtent([0.3, 3])
      .on('zoom', (event: any) => {
        g.setAttribute('transform', event.transform.toString());
      });
    select(svg as any).call(zoomBehavior as any);

    // 动画
    sim.on('tick', () => {
      for (let i = 0; i < links.length; i++) {
        const link = links[i] as any;
        const line = linkEls[i];
        line.setAttribute('x1', String(link.source.x));
        line.setAttribute('y1', String(link.source.y));
        line.setAttribute('x2', String(link.target.x));
        line.setAttribute('y2', String(link.target.y));
      }
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i] as any;
        nodeEls[i].setAttribute('transform', `translate(${node.x},${node.y})`);
      }
    });

    return () => {
      sim.stop();
      svg.removeEventListener('mousemove', handleMouseMove);
      svg.removeEventListener('mouseup', handleMouseUp);
    };
  }, [data, onNodeClick]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !data || data.nodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        {error || '暂无数据，请先重建向量索引'}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden bg-white dark:bg-gray-900">
      <svg ref={svgRef} className="w-full h-full" />
      {/* 图例 */}
      <div className="absolute bottom-4 left-4 flex gap-3 text-xs text-gray-500 dark:text-gray-400 bg-white/80 dark:bg-gray-800/80 backdrop-blur px-3 py-2 rounded-lg">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full inline-block" style={{ background: '#f5e6d8', border: '2px solid #e8a87c' }} />随想</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full inline-block" style={{ background: '#dde5ee', border: '2px solid #89a8c8' }} />大纲</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full inline-block" style={{ background: '#e0eae4', border: '2px solid #7fb89e' }} />笔记</span>
      </div>
    </div>
  );
}
