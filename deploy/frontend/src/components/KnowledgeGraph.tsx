import { useEffect, useRef, useState, useCallback } from 'react';
import { forceSimulation, forceCollide, forceLink, forceManyBody, forceCenter, SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';
import { zoom, zoomIdentity, ZoomTransform } from 'd3-zoom';
import { select } from 'd3-selection';
import api from '../api/client';
import { Loader2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GraphNode extends SimulationNodeDatum {
  id: string;
  title: string;
  type: string;
  source_type: string;
  connectionCount?: number;
}

interface GraphEdge extends SimulationLinkDatum<GraphNode> {
  weight: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ─── Obsidian-style color palette ─────────────────────────────────────────────
// Vibrant colors for dark mode, softer for light mode — inspired by Obsidian's color groups

const NODE_COLORS: Record<string, { dark: string; light: string }> = {
  memo:     { dark: '#f97316', light: '#ea580c' },  // orange
  document: { dark: '#60a5fa', light: '#2563eb' },  // blue
  note:     { dark: '#34d399', light: '#059669' },  // green
  excalidraw: { dark: '#f472b6', light: '#db2777' }, // pink
};

const DEFAULT_COLOR = { dark: '#94a3b8', light: '#64748b' };

function getNodeColor(sourceType: string, isDark: boolean): string {
  const c = NODE_COLORS[sourceType] || DEFAULT_COLOR;
  return isDark ? c.dark : c.light;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function KnowledgeGraph({ onNodeClick }: { onNodeClick: (id: string, type: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GraphData | null>(null);
  const [zoomScale, setZoomScale] = useState(1);

  // Store refs for animation loop access
  const stateRef = useRef({
    nodes: [] as GraphNode[],
    links: [] as GraphEdge[],
    transform: zoomIdentity as ZoomTransform,
    hoveredNode: null as GraphNode | null,
    isDark: false,
    dpr: 1,
    width: 0,
    height: 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    zoomBehavior: null as any,
  });

  // Fetch data
  useEffect(() => {
    api.get('/knowledge-graph/', { params: { threshold: 0.55, max_edges: 150 } })
      .then(resp => setData(resp.data))
      .catch(() => setError('加载失败'))
      .finally(() => setLoading(false));
  }, []);

  // Compute connection counts
  const computeConnectionCounts = useCallback((nodes: GraphNode[], edges: GraphEdge[]) => {
    const counts = new Map<string, number>();
    for (const edge of edges) {
      const sid = typeof edge.source === 'string' ? edge.source : (edge.source as GraphNode).id;
      const tid = typeof edge.target === 'string' ? edge.target : (edge.target as GraphNode).id;
      counts.set(sid, (counts.get(sid) || 0) + 1);
      counts.set(tid, (counts.get(tid) || 0) + 1);
    }
    for (const node of nodes) {
      node.connectionCount = counts.get(node.id) || 0;
    }
  }, []);

  // Uniform node size — different sizes cause uneven collision forces,
  // which distorts the circular layout. Obsidian uses uniform base size.
  const NODE_RADIUS = 5;
  const getNodeRadius = useCallback((_node: GraphNode): number => {
    return NODE_RADIUS;
  }, []);

  // ─── Main canvas effect ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!data || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // HiDPI canvas
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const isDark = document.documentElement.classList.contains('dark');
    const state = stateRef.current;
    state.isDark = isDark;
    state.dpr = dpr;
    state.width = width;
    state.height = height;

    // Prepare nodes with random initial positions
    const nodes: GraphNode[] = data.nodes.map((n) => ({
      ...n,
      x: width / 2 + (Math.random() - 0.5) * 100,
      y: height / 2 + (Math.random() - 0.5) * 100,
    }));

    const links: GraphEdge[] = data.edges.map(e => ({ ...e, source: e.source, target: e.target }));
    computeConnectionCounts(nodes, links);
    state.nodes = nodes;
    state.links = links;

    // ─── Force simulation (Obsidian defaults) ────────────────────────────
    // Obsidian uses d3-force defaults: forceManyBody -300, forceLink dist 30,
    // forceCenter ~1. These create the characteristic uniform circular layout.
    const sim = forceSimulation(nodes)
      .force('center', forceCenter(width / 2, height / 2).strength(0.6))
      .force('charge', forceManyBody().strength(-300).distanceMax(400))
      .force('collision', forceCollide<GraphNode>().radius(NODE_RADIUS + 2).strength(0.8))
      .force('link', forceLink<GraphNode, GraphEdge>(links).id(d => d.id).distance(30).strength(0.5))
      .alphaDecay(0.02)
      .velocityDecay(0.4);

    // ─── Zoom behavior ─────────────────────────────────────────────────────
    const zoomBehavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.2, 5])
      .on('zoom', (event: { transform: ZoomTransform }) => {
        state.transform = event.transform;
        setZoomScale(event.transform.k);
      });

    select(canvas).call(zoomBehavior);
    stateRef.current.zoomBehavior = zoomBehavior;

    // ─── Hit detection ─────────────────────────────────────────────────────
    const getNodeAt = (mx: number, my: number): GraphNode | null => {
      // Transform mouse coords to graph coords
      const t = state.transform;
      const gx = (mx - t.x) / t.k;
      const gy = (my - t.y) / t.k;

      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        const r = getNodeRadius(n);
        const dx = (n.x || 0) - gx;
        const dy = (n.y || 0) - gy;
        if (dx * dx + dy * dy < (r + 4) * (r + 4)) return n;
      }
      return null;
    };

    // ─── Hover ─────────────────────────────────────────────────────────────
    const neighborSet = new Set<string>();
    const edgeSet = new Set<string>();

    const computeNeighbors = (node: GraphNode | null) => {
      neighborSet.clear();
      edgeSet.clear();
      if (!node) return;
      neighborSet.add(node.id);
      for (const link of links) {
        const sid = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
        const tid = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
        if (sid === node.id) {
          neighborSet.add(tid);
          edgeSet.add(`${sid}-${tid}`);
        } else if (tid === node.id) {
          neighborSet.add(sid);
          edgeSet.add(`${sid}-${tid}`);
        }
      }
    };

    let hoveredNode: GraphNode | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const node = getNodeAt(e.clientX - rect.left, e.clientY - rect.top);
      if (node !== hoveredNode) {
        hoveredNode = node;
        state.hoveredNode = node;
        computeNeighbors(node);
        canvas.style.cursor = node ? 'pointer' : 'grab';
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);

    // ─── Drag ──────────────────────────────────────────────────────────────
    let draggingNode: GraphNode | null = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let didDrag = false;

    const handleMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const node = getNodeAt(e.clientX - rect.left, e.clientY - rect.top);
      if (node) {
        draggingNode = node;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        didDrag = false;
        node.fx = node.x;
        node.fy = node.y;
        sim.alphaTarget(0.3).restart();
        canvas.style.cursor = 'grabbing';
      }
    };

    const handleMouseDrag = (e: MouseEvent) => {
      if (!draggingNode) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag = true;
      const t = state.transform;
      draggingNode.fx = (e.clientX - canvas.getBoundingClientRect().left - t.x) / t.k;
      draggingNode.fy = (e.clientY - canvas.getBoundingClientRect().top - t.y) / t.k;
    };

    const handleMouseUp = () => {
      if (draggingNode) {
        if (!didDrag) {
          // Click — navigate
          onNodeClick(draggingNode.id, draggingNode.source_type);
        }
        draggingNode.fx = null;
        draggingNode.fy = null;
        draggingNode = null;
        sim.alphaTarget(0);
        canvas.style.cursor = hoveredNode ? 'pointer' : 'grab';
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseDrag);
    canvas.addEventListener('mouseup', handleMouseUp);

    // ─── Touch support ─────────────────────────────────────────────────────
    let touchDragging: GraphNode | null = null;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const node = getNodeAt(touch.clientX - rect.left, touch.clientY - rect.top);
      if (node) {
        e.preventDefault();
        touchDragging = node;
        node.fx = node.x;
        node.fy = node.y;
        sim.alphaTarget(0.3).restart();
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchDragging || e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      const t = state.transform;
      touchDragging.fx = (touch.clientX - canvas.getBoundingClientRect().left - t.x) / t.k;
      touchDragging.fy = (touch.clientY - canvas.getBoundingClientRect().top - t.y) / t.k;
    };

    const handleTouchEnd = () => {
      if (touchDragging) {
        touchDragging.fx = null;
        touchDragging.fy = null;
        touchDragging = null;
        sim.alphaTarget(0);
      }
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);

    // ─── Canvas render loop ────────────────────────────────────────────────
    const TEXT_FADE_THRESHOLD = 1.2; // Show labels only when zoom > this

    const render = () => {
      const { transform, isDark: dark, dpr: d } = state;
      ctx.save();
      ctx.scale(d, d);

      // Clear
      ctx.fillStyle = dark ? '#0d1117' : '#f8fafc';
      ctx.fillRect(0, 0, width, height);

      // Apply zoom transform
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);

      const globalAlpha = hoveredNode ? 0.08 : 1;

      // ─── Draw edges (uniform style) ────────────────────────────────────
      const edgeColor = dark ? '#4a5568' : '#9ca3af';
      for (const link of links) {
        const s = link.source as GraphNode;
        const t = link.target as GraphNode;
        if (!s.x || !s.y || !t.x || !t.y) continue;

        let alpha = 0.4 * globalAlpha;
        let color = edgeColor;

        if (hoveredNode) {
          const sid = s.id;
          const tid = t.id;
          const key1 = `${sid}-${tid}`;
          const key2 = `${tid}-${sid}`;
          if (edgeSet.has(key1) || edgeSet.has(key2)) {
            alpha = 0.6;
            color = getNodeColor(hoveredNode.source_type, dark);
          }
        }

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.globalAlpha = 1;

      // ─── Draw nodes (glow + fill) ─────────────────────────────────────
      // Sort: hovered node on top
      const sortedNodes = [...nodes].sort((a, b) => {
        if (a === hoveredNode) return 1;
        if (b === hoveredNode) return -1;
        return 0;
      });

      for (const node of sortedNodes) {
        if (node.x === undefined || node.y === undefined) continue;

        const r = getNodeRadius(node);
        const color = getNodeColor(node.source_type, dark);
        const isNeighbor = !hoveredNode || neighborSet.has(node.id);
        const isHovered = node === hoveredNode;

        ctx.globalAlpha = isNeighbor ? 1 : 0.06;

        // Glow effect (Obsidian signature)
        if (isNeighbor) {
          ctx.save();
          ctx.shadowColor = color;
          ctx.shadowBlur = isHovered ? 18 : 10;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.globalAlpha = isHovered ? 0.6 : 0.3;
          ctx.fill();
          ctx.restore();
        }

        // Solid node
        ctx.globalAlpha = isNeighbor ? 1 : 0.06;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Subtle border
        if (isHovered) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.8;
          ctx.stroke();
        }

        // ─── Text labels (fade based on zoom) ──────────────────────────
        if (transform.k > TEXT_FADE_THRESHOLD && isNeighbor) {
          const textAlpha = Math.min(1, (transform.k - TEXT_FADE_THRESHOLD) / 0.5);
          ctx.globalAlpha = textAlpha * (isHovered ? 1 : 0.7);
          ctx.fillStyle = dark ? '#e2e8f0' : '#1e293b';
          ctx.font = `${Math.max(3, 4 / transform.k * 1.5)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(node.title, node.x, node.y + r + 4);
        }
      }

      ctx.restore();

      // ─── Mini stats (top-right) ───────────────────────────────────────
      ctx.save();
      ctx.scale(d, d);
      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = dark ? '#64748b' : '#94a3b8';
      ctx.textAlign = 'right';
      ctx.fillText(`${nodes.length} 节点 · ${links.length} 连接`, width - 12, 20);
      ctx.restore();
    };

    // Animation loop
    let animFrameId: number;
    const animate = () => {
      render();
      animFrameId = requestAnimationFrame(animate);
    };
    animate();

    // Tick the simulation (also triggers render via animate)
    sim.on('tick', () => {}); // No-op; render loop handles it

    // ─── Cleanup ─────────────────────────────────────────────────────────
    return () => {
      sim.stop();
      cancelAnimationFrame(animFrameId);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseDrag);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, [data, onNodeClick, computeConnectionCounts, getNodeRadius]);

  // ─── Zoom controls ───────────────────────────────────────────────────────
  const handleZoomIn = () => {
    const canvas = canvasRef.current;
    const zb = stateRef.current.zoomBehavior;
    if (!canvas || !zb) return;
    select(canvas).transition().duration(300).call(zb.scaleBy, 1.4);
  };

  const handleZoomOut = () => {
    const canvas = canvasRef.current;
    const zb = stateRef.current.zoomBehavior;
    if (!canvas || !zb) return;
    select(canvas).transition().duration(300).call(zb.scaleBy, 0.7);
  };

  const handleReset = () => {
    const canvas = canvasRef.current;
    const zb = stateRef.current.zoomBehavior;
    if (!canvas || !zb) return;
    select(canvas).transition().duration(500).call(zb.transform, zoomIdentity);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
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
    <div ref={containerRef} className="flex-1 relative overflow-hidden bg-[#0d1117] dark:bg-[#0d1117]">
      <canvas ref={canvasRef} className="w-full h-full" />

      {/* Zoom controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1">
        <button
          onClick={handleZoomIn}
          className="w-8 h-8 flex items-center justify-center rounded-md bg-gray-800/80 hover:bg-gray-700/80 text-gray-300 backdrop-blur transition-colors"
          title="放大"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={handleZoomOut}
          className="w-8 h-8 flex items-center justify-center rounded-md bg-gray-800/80 hover:bg-gray-700/80 text-gray-300 backdrop-blur transition-colors"
          title="缩小"
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={handleReset}
          className="w-8 h-8 flex items-center justify-center rounded-md bg-gray-800/80 hover:bg-gray-700/80 text-gray-300 backdrop-blur transition-colors"
          title="重置视图"
        >
          <Maximize2 size={16} />
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex gap-3 text-xs text-gray-400 bg-gray-900/80 backdrop-blur px-3 py-2 rounded-lg border border-gray-700/50">
        {Object.entries(NODE_COLORS).map(([key, colors]) => {
          const labels: Record<string, string> = {
            memo: '随想', document: '大纲', note: '笔记', excalidraw: '画布',
          };
          return (
            <span key={key} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: colors.dark, boxShadow: `0 0 6px ${colors.dark}60` }} />
              {labels[key] || key}
            </span>
          );
        })}
      </div>

      {/* Zoom level indicator */}
      {zoomScale !== 1 && (
        <div className="absolute bottom-3 right-3 text-xs text-gray-500 bg-gray-900/60 backdrop-blur px-2 py-1 rounded">
          {Math.round(zoomScale * 100)}%
        </div>
      )}
    </div>
  );
}
