import { useEffect, useRef, useState, useCallback } from 'react';
import cytoscape from 'cytoscape';
import api from '../api/client';
import { Loader2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  title: string;
  type: string;
  source_type: string;
  connectionCount?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ─── Obsidian-style color palette ─────────────────────────────────────────────

const NODE_COLORS: Record<string, { dark: string; light: string }> = {
  memo:       { dark: '#f97316', light: '#ea580c' },
  document:   { dark: '#60a5fa', light: '#2563eb' },
  note:       { dark: '#34d399', light: '#059669' },
  excalidraw: { dark: '#f472b6', light: '#db2777' },
};

const DEFAULT_COLOR = { dark: '#94a3b8', light: '#64748b' };

function getNodeColor(sourceType: string, isDark: boolean): string {
  const c = NODE_COLORS[sourceType] || DEFAULT_COLOR;
  return isDark ? c.dark : c.light;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function KnowledgeGraph({ onNodeClick }: { onNodeClick: (id: string, type: string) => void }) {
  console.log('KnowledgeGraph: Component rendered');

  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data and initialize Cytoscape
  useEffect(() => {
    console.log('KnowledgeGraph: useEffect triggered, containerRef:', containerRef.current);
    if (!containerRef.current) {
      console.log('KnowledgeGraph: containerRef is null, skipping');
      return;
    }

    const container = containerRef.current;
    const isDark = document.documentElement.classList.contains('dark');

    console.log('KnowledgeGraph: Container size:', container.clientWidth, 'x', container.clientHeight);

    // Ensure container has dimensions
    if (container.clientWidth === 0 || container.clientHeight === 0) {
      console.warn('KnowledgeGraph: Container has zero dimensions');
      return;
    }

    console.log('KnowledgeGraph: About to call API...');
    api.get('/knowledge-graph/', { params: { threshold: 0.55, max_edges: 150 } })
      .then(resp => {
        const data: GraphData = resp.data;
        if (!data.nodes || data.nodes.length === 0) {
          setError('暂无数据，请先重建向量索引');
          setLoading(false);
          return;
        }

        // Compute connection counts
        const counts = new Map<string, number>();
        for (const edge of data.edges) {
          counts.set(edge.source, (counts.get(edge.source) || 0) + 1);
          counts.set(edge.target, (counts.get(edge.target) || 0) + 1);
        }
        for (const node of data.nodes) {
          node.connectionCount = counts.get(node.id) || 0;
        }

        // Sort by connection count (most connected first) for better visual distribution
        const sortedNodes = [...data.nodes].sort((a, b) => (b.connectionCount || 0) - (a.connectionCount || 0));

        // Pre-compute positions: uniform distribution within a circular area
        // Using Fermat's spiral for even distribution in a disk
        const n = sortedNodes.length;
        const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~137.5 degrees in radians
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        const centerX = containerWidth / 2;
        const centerY = containerHeight / 2;
        const maxRadius = Math.min(containerWidth, containerHeight) * 0.42; // 84% of min dimension

        const positions = new Map<string, { x: number; y: number }>();
        sortedNodes.forEach((node, i) => {
          // Fermat's spiral: evenly distributed points in a disk
          const radius = maxRadius * Math.sqrt(i / n);
          const angle = i * goldenAngle;
          positions.set(node.id, {
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle),
          });
        });

        // Create Cytoscape elements with pre-computed positions
        console.log('KnowledgeGraph: API returned nodes:', sortedNodes.map(n => ({ id: n.id, title: n.title })));

        const elements: cytoscape.ElementDefinition[] = [
          // Nodes
          ...sortedNodes.map(node => ({
            data: {
              id: node.id,
              label: node.title,
              source_type: node.source_type,
              connectionCount: node.connectionCount || 0,
              nodeType: node.type,
            },
            position: positions.get(node.id),
          })),
          // Edges
          ...data.edges.map(edge => ({
            data: {
              source: edge.source,
              target: edge.target,
              weight: edge.weight,
            },
          })),
        ];

        // Node size based on connection count
        const getNodeSize = (count: number): number => {
          if (count <= 3) return 8;
          if (count <= 8) return 10;
          if (count <= 15) return 12;
          return 14;
        };

        // Initialize Cytoscape
        console.log('KnowledgeGraph: Initializing Cytoscape with', sortedNodes.length, 'nodes and', data.edges.length, 'edges');

        const LABEL_ZOOM_THRESHOLD = 1.5; // Show labels when zoomed in beyond this

        const cy = cytoscape({
          container: container,
          elements,
          style: [
            // Node style
            {
              selector: 'node',
              style: {
                'background-color': (ele: cytoscape.NodeSingular) => getNodeColor(ele.data('source_type'), isDark),
                'label': 'data(label)',
                'text-opacity': 0, // Hidden by default
                'width': (ele: cytoscape.NodeSingular) => getNodeSize(ele.data('connectionCount')),
                'height': (ele: cytoscape.NodeSingular) => getNodeSize(ele.data('connectionCount')),
                'font-size': '10px',
                'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                'color': isDark ? '#e2e8f0' : '#1e293b',
                'text-valign': 'bottom',
                'text-margin-y': 8,
                'text-halign': 'center',
                'text-wrap': 'ellipsis',
                'text-max-width': '80px',
                'border-width': 0,
                'overlay-padding': 10,
                'overlay-opacity': 0,
              } as cytoscape.Css.Node,
            },
            // Edge style — curved arcs
            {
              selector: 'edge',
              style: {
                'line-color': isDark ? '#6b7280' : '#9ca3af',
                'width': 1.5,
                'opacity': 0.6,
                'curve-style': 'unbundled-bezier',
                'control-point-distances': 40,
                'control-point-weights': 0.5,
              } as cytoscape.Css.Edge,
            },
            // Hovered node
            {
              selector: 'node:active',
              style: {
                'overlay-opacity': 0.1,
                'overlay-color': isDark ? '#ffffff' : '#000000',
              } as cytoscape.Css.Node,
            },
            // Highlighted neighbor
            {
              selector: '.highlighted',
              style: {
                'opacity': 1,
              } as cytoscape.Css.Node,
            },
            // Dimmed node
            {
              selector: '.dimmed',
              style: {
                'opacity': 0.15,
              } as cytoscape.Css.Node,
            },
            // Dimmed edge
            {
              selector: 'edge.dimmed',
              style: {
                'opacity': 0.05,
              } as cytoscape.Css.Edge,
            },
            // Highlighted edge
            {
              selector: 'edge.highlighted',
              style: {
                'opacity': 0.8,
                'line-color': (ele: cytoscape.EdgeSingular) => {
                  const source = ele.source();
                  return getNodeColor(source.data('source_type'), isDark);
                },
                'width': 2,
              } as cytoscape.Css.Edge,
            },
          ],
          layout: {
            name: 'preset',
            animate: false,
            fit: true,
            padding: 30,
          } as cytoscape.LayoutOptions,
          // Interaction options — smooth zoom
          minZoom: 0.3,
          maxZoom: 3,
          wheelSensitivity: 2,
          userPanningEnabled: true,
          userZoomingEnabled: true,
          boxSelectionEnabled: false,
          autoungrabify: false,
          pixelRatio: 'auto',
        });

        // ─── Hover effects ─────────────────────────────────────────────────
        let hoveredNode: cytoscape.NodeSingular | null = null;

        cy.on('mouseover', 'node', (event) => {
          const node = event.target;
          hoveredNode = node;

          // Get connected edges and nodes
          const connectedEdges = node.connectedEdges();
          const connectedNodes = connectedEdges.connectedNodes().union(node);

          // Dim all nodes and edges
          cy.elements().addClass('dimmed');

          // Highlight connected elements
          connectedNodes.removeClass('dimmed').addClass('highlighted');
          connectedEdges.removeClass('dimmed').addClass('highlighted');

          // Change cursor
          containerRef.current!.style.cursor = 'pointer';
        });

        cy.on('mouseout', 'node', () => {
          hoveredNode = null;

          // Remove all highlights
          cy.elements().removeClass('dimmed highlighted');

          // Reset cursor
          containerRef.current!.style.cursor = 'grab';
        });

        // ─── Click handler ─────────────────────────────────────────────────
        cy.on('tap', 'node', (event) => {
          console.log('KnowledgeGraph: Node tapped:', event.target.id(), event.target.data('source_type'));
          const node = event.target;
          onNodeClick(node.id(), node.data('source_type'));
        });

        // ─── Drag cursor ──────────────────────────────────────────────────
        cy.on('grab', 'node', () => {
          containerRef.current!.style.cursor = 'grabbing';
        });

        cy.on('free', 'node', () => {
          containerRef.current!.style.cursor = hoveredNode ? 'pointer' : 'grab';
        });

        // ─── Zoom: show/hide labels ───────────────────────────────────────
        const updateLabels = () => {
          const zoom = cy.zoom();
          const showLabels = zoom >= LABEL_ZOOM_THRESHOLD;
          cy.nodes().style('text-opacity', showLabels ? 1 : 0);
        };

        cy.on('zoom', updateLabels);
        updateLabels(); // Initial check

        // Store cy instance for controls
        cyRef.current = cy;

        // Log successful initialization
        console.log('KnowledgeGraph: Cytoscape initialized successfully');
        console.log('KnowledgeGraph: Container size:', container.clientWidth, 'x', container.clientHeight);
        console.log('KnowledgeGraph: Nodes:', cy.nodes().length, 'Edges:', cy.edges().length);

        setLoading(false);
      })
      .catch((err) => {
        console.error('KnowledgeGraph: Failed to load data:', err);
        setError('加载失败');
        setLoading(false);
      });

    // Cleanup
    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [onNodeClick]);

  // ─── Zoom controls ─────────────────────────────────────────────────────────
  const handleZoomIn = useCallback(() => {
    if (cyRef.current) {
      cyRef.current.animate({
        zoom: cyRef.current.zoom() * 1.3,
        center: { eles: cyRef.current.elements() },
      } as cytoscape.AnimationOptions, {
        duration: 300,
      });
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (cyRef.current) {
      cyRef.current.animate({
        zoom: cyRef.current.zoom() / 1.3,
        center: { eles: cyRef.current.elements() },
      } as cytoscape.AnimationOptions, {
        duration: 300,
      });
    }
  }, []);

  const handleReset = useCallback(() => {
    if (cyRef.current) {
      cyRef.current.animate({
        zoom: 1,
        pan: { x: 0, y: 0 },
      } as cytoscape.AnimationOptions, {
        duration: 500,
      });
    }
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 min-h-0 w-full relative overflow-hidden bg-white dark:bg-[#0d1117]">
      {/* Cytoscape container — always rendered so ref is available */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-[#0d1117]/80 z-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-[#0d1117]/80 z-20 text-gray-400 text-sm">
          {error}
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute top-2 right-2 sm:top-3 sm:right-3 flex flex-col gap-1 z-10">
        <button
          onClick={handleZoomIn}
          className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-md bg-white/80 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700/80 text-gray-600 dark:text-gray-300 backdrop-blur transition-colors border border-gray-200 dark:border-gray-700/50"
          title="放大"
        >
          <ZoomIn size={14} />
        </button>
        <button
          onClick={handleZoomOut}
          className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-md bg-white/80 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700/80 text-gray-600 dark:text-gray-300 backdrop-blur transition-colors border border-gray-200 dark:border-gray-700/50"
          title="缩小"
        >
          <ZoomOut size={14} />
        </button>
        <button
          onClick={handleReset}
          className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-md bg-white/80 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700/80 text-gray-600 dark:text-gray-300 backdrop-blur transition-colors border border-gray-200 dark:border-gray-700/50"
          title="重置视图"
        >
          <Maximize2 size={14} />
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 flex gap-2 sm:gap-3 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 bg-white/80 dark:bg-gray-900/80 backdrop-blur px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg border border-gray-200 dark:border-gray-700/50 z-10">
        {Object.entries(NODE_COLORS).map(([key, colors]) => {
          const labels: Record<string, string> = {
            memo: '随想', document: '大纲', note: '笔记', excalidraw: '画布',
          };
          return (
            <span key={key} className="flex items-center gap-1">
              <span
                className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full inline-block"
                style={{
                  background: colors.dark,
                  boxShadow: `0 0 6px ${colors.dark}60`,
                }}
              />
              {labels[key] || key}
            </span>
          );
        })}
      </div>
    </div>
  );
}
