import { useEffect, useRef, useState, useCallback } from 'react';
import { simulation, forceCenter, forceCollide, forceLink, forceManyBody, forceX, forceY } from 'd3-force';
import { zoom, zoomIdentity } from 'd3-zoom';
import { select } from 'd3-selection';
import { api } from '../api/client';
import { Loader2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

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

interface KnowledgeGraphProps {
  onNodeClick: (id: string, type: string) => void;
}

export default function KnowledgeGraph({ onNodeClick }: KnowledgeGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GraphData | null>(null);
  const simRef = useRef<ReturnType<typeof simulation> | null>(null);

  // 加载图谱数据
  useEffect(() => {
    const load = async () => {
      try {
        const resp = await api.get('/knowledge-graph/', { params: { threshold: 0.5, max_edges: 150 } });
        setData(resp.data);
      } catch (e) {
        setError('加载图谱数据失败');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // 渲染图谱
  useEffect(() => {
    if (!data || !svgRef.current || !containerRef.current) return;

    const svg = svgRef.current;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));

    // 清空
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(g);

    // 创建力导向模拟
    const nodes = data.nodes.map(n => ({ ...n, x: width / 2 + (Math.random() - 0.5) * 200, y: height / 2 + (Math.random() - 0.5) * 200 }));
    const links = data.edges.map(e => ({ ...e, source: e.source, target: e.target }));

    const sim = simulation(nodes)
      .force('charge', forceManyBody().strength(-120))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collision', forceCollide().radius(30))
      .force('link', forceLink(links).id((d: any) => d.id).distance(80).strength(0.3))
      .force('x', forceX(width / 2).strength(0.05))
      .force('y', forceY(height / 2).strength(0.05));

    simRef.current = sim;

    // 边
    const linkGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.appendChild(linkGroup);
    const linkEls: SVGLineElement[] = [];
    for (const link of links) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('stroke', '#d1d5db');
      line.setAttribute('stroke-width', String(Math.max(0.5, link.weight * 2)));
      line.setAttribute('stroke-opacity', '0.4');
      linkGroup.appendChild(line);
      linkEls.push(line);
    }

    // 节点
    const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.appendChild(nodeGroup);
    const nodeEls: SVGGElement[] = [];
    for (const node of nodes) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.style.cursor = 'pointer';

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', node.type === 'folder' ? '6' : '8');
      circle.setAttribute('fill', node.source_type === 'memo' ? '#3b82f6' : node.type === 'note' ? '#10b981' : '#6b7280');
      circle.setAttribute('stroke', '#fff');
      circle.setAttribute('stroke-width', '1.5');
      g.appendChild(circle);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.textContent = node.title;
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dy', '16');
      text.setAttribute('font-size', '10');
      text.setAttribute('fill', '#6b7280');
      text.setAttribute('pointer-events', 'none');
      g.appendChild(text);

      g.addEventListener('click', () => onNodeClick(node.id, node.source_type));
      nodeGroup.appendChild(g);
      nodeEls.push(g);
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
        const touch = e.touches[0];
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

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">{error}</div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden bg-white dark:bg-gray-900">
      <svg ref={svgRef} className="w-full h-full" />
      {/* 图例 */}
      <div className="absolute bottom-4 left-4 flex gap-3 text-xs text-gray-500 dark:text-gray-400 bg-white/80 dark:bg-gray-800/80 backdrop-blur px-3 py-2 rounded-lg">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />随想</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />笔记</span>
      </div>
    </div>
  );
}
