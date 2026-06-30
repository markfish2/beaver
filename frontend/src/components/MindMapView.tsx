import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Layers, ChevronDown } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import type { Node } from '../api/data';
import { uploadFile, getFileUrl, getThumbnailUrl } from '../api/data';

interface MindMapViewProps {
  nodes: Node[];
  documentTitle: string;
  onNodeUpdate: (id: string, content: string) => void;
  onNodeAdd: (parentId: string | null, content: string) => Promise<Node | null>;
  onNodeDelete: (id: string) => void;
  onNodeMove: (id: string, newParentId: string | null) => void;
  onBackToOutline: () => void;
}

interface MindMapNodeData {
  data: {
    text: string;
    id?: string;
    [key: string]: any;
  };
  children?: MindMapNodeData[];
}

type LineStyleKey = 'curve' | 'straight' | 'direct' | 'dashed' | 'rounded';
type ColorThemeKey = 'classic' | 'colorful' | 'dark';

interface LineStyleConfig {
  name: string;
  description: string;
  theme: any;
}

// 彩色主题的分支调色板
const BRANCH_COLORS = [
  { bg: '#3B82F6', text: '#ffffff', light: '#DBEAFE', lightText: '#1E40AF' },  // Blue
  { bg: '#10B981', text: '#ffffff', light: '#D1FAE5', lightText: '#065F46' },  // Green
  { bg: '#F59E0B', text: '#ffffff', light: '#FEF3C7', lightText: '#92400E' },  // Amber
  { bg: '#EF4444', text: '#ffffff', light: '#FEE2E2', lightText: '#991B1B' },  // Red
  { bg: '#8B5CF6', text: '#ffffff', light: '#EDE9FE', lightText: '#5B21B6' },  // Purple
  { bg: '#EC4899', text: '#ffffff', light: '#FCE7F3', lightText: '#9D174D' },  // Pink
  { bg: '#06B6D4', text: '#ffffff', light: '#CFFAFE', lightText: '#155E75' },  // Cyan
  { bg: '#F97316', text: '#ffffff', light: '#FFEDD5', lightText: '#9A3412' },  // Orange
];

interface ColorThemeConfig {
  name: string;
  description: string;
  backgroundColor: string;
  lineColor: string;
  root: Record<string, any>;
  second: Record<string, any>;
  node: Record<string, any>;
}

const COLOR_THEMES: Record<ColorThemeKey, ColorThemeConfig> = {
  classic: {
    name: '经典',
    description: '默认灰白色调',
    backgroundColor: '#FFFFFF',
    lineColor: '#64748B',
    root: { fillColor: '#334155', color: '#ffffff', fontSize: 20, fontWeight: 'bold', borderRadius: 8, borderWidth: 0, paddingX: 24, paddingY: 8, tagPlacement: 'bottom' },
    second: { fillColor: 'transparent', color: '#475569', fontSize: 16, fontWeight: '600', borderRadius: 0, borderWidth: 0, paddingX: 8, paddingY: 2, tagPlacement: 'bottom' },
    node: { fillColor: 'transparent', color: '#475569', fontSize: 14, fontWeight: 'normal', borderRadius: 0, borderWidth: 0, paddingX: 8, paddingY: 2, tagPlacement: 'bottom' },
  },
  colorful: {
    name: '彩色',
    description: '多色分支，清晰区分',
    backgroundColor: '#FFFFFF',
    lineColor: '#64748B',
    root: { fillColor: '#1e293b', color: '#ffffff', fontSize: 20, fontWeight: 'bold', borderRadius: 8, borderWidth: 0, paddingX: 24, paddingY: 8, tagPlacement: 'bottom' },
    second: { fillColor: 'transparent', color: '#475569', fontSize: 16, fontWeight: '600', borderRadius: 6, borderWidth: 0, paddingX: 12, paddingY: 4, tagPlacement: 'bottom' },
    node: { fillColor: 'transparent', color: '#475569', fontSize: 14, fontWeight: 'normal', borderRadius: 0, borderWidth: 0, paddingX: 8, paddingY: 2, tagPlacement: 'bottom' },
  },
  dark: {
    name: '暗夜',
    description: '深色背景，护眼舒适',
    backgroundColor: '#111318',
    lineColor: 'rgba(255,255,255,0.07)',
    root: { fillColor: '#1c1f26', color: '#f0f2f5', fontSize: 20, fontWeight: 'bold', borderRadius: 8, borderWidth: 0, paddingX: 24, paddingY: 8, tagPlacement: 'bottom' },
    second: { fillColor: 'transparent', color: '#d1d5db', fontSize: 16, fontWeight: '600', borderRadius: 0, borderWidth: 0, paddingX: 8, paddingY: 2, tagPlacement: 'bottom' },
    node: { fillColor: 'transparent', color: '#9ca3b4', fontSize: 14, fontWeight: 'normal', borderRadius: 0, borderWidth: 0, paddingX: 8, paddingY: 2, tagPlacement: 'bottom' },
  },
};

const LINE_STYLES: Record<LineStyleKey, LineStyleConfig> = {
  curve: {
    name: '曲线风格',
    description: '平滑贝塞尔曲线',
    theme: {
      "lineStyle": "curve",
      "lineWidth": 1.25,
      "lineDasharray": "none",
      "lineRadius": 0,
      "rootLineKeepSameInCurve": true,
      "imgMaxWidth": 100,
      "imgMaxHeight": 75,
    }
  },
  straight: {
    name: '直线风格',
    description: '直角折线',
    theme: {
      "lineStyle": "straight",
      "lineWidth": 1,
      "lineDasharray": "none",
      "lineRadius": 0,
      "imgMaxWidth": 100,
      "imgMaxHeight": 75,
    }
  },
  direct: {
    name: '直连风格',
    description: '直接连线',
    theme: {
      "lineStyle": "direct",
      "lineWidth": 1,
      "lineDasharray": "none",
      "lineRadius": 0,
      "imgMaxWidth": 100,
      "imgMaxHeight": 75,
    }
  },
  dashed: {
    name: '虚线风格',
    description: '虚线连接',
    theme: {
      "lineStyle": "straight",
      "lineWidth": 1,
      "lineDasharray": "6,4",
      "lineRadius": 0,
      "imgMaxWidth": 100,
      "imgMaxHeight": 75,
    }
  },
  rounded: {
    name: '圆角直线',
    description: '大圆角折线',
    theme: {
      "lineStyle": "straight",
      "lineWidth": 1.25,
      "lineDasharray": "none",
      "lineRadius": 20,
      "imgMaxWidth": 100,
      "imgMaxHeight": 75,
    }
  },
};

const getStoredLineStyle = (): LineStyleKey => {
  try {
    const stored = localStorage.getItem('mindmap-line-style');
    if (stored && LINE_STYLES[stored as LineStyleKey]) {
      return stored as LineStyleKey;
    }
  } catch {}
  return 'curve';
};

const setStoredLineStyle = (style: LineStyleKey) => {
  try {
    localStorage.setItem('mindmap-line-style', style);
  } catch {}
};

const getStoredColorTheme = (): ColorThemeKey => {
  try {
    const stored = localStorage.getItem('mindmap-color-theme');
    if (stored && COLOR_THEMES[stored as ColorThemeKey]) {
      return stored as ColorThemeKey;
    }
  } catch {}
  return 'classic';
};

const setStoredColorTheme = (theme: ColorThemeKey) => {
  try {
    localStorage.setItem('mindmap-color-theme', theme);
  } catch {}
};

const LineStylePreview = ({ style, isActive }: { style: LineStyleKey; isActive: boolean }) => {
  const baseClass = "w-10 h-6 border-2 rounded flex items-center justify-center";
  const activeClass = isActive ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-white";
  
  const icons: Record<LineStyleKey, React.ReactNode> = {
    curve: (
      <div className={`${baseClass} ${activeClass}`}>
        <svg width="24" height="14" viewBox="0 0 24 14">
          <path d="M2,7 Q6,2 12,7 T22,7" fill="none" stroke={isActive ? "#3B82F6" : "#9CA3AF"} strokeWidth="2" />
        </svg>
      </div>
    ),
    straight: (
      <div className={`${baseClass} ${activeClass}`}>
        <svg width="24" height="14" viewBox="0 0 24 14">
          <polyline points="2,7 10,7 10,3 22,3" fill="none" stroke={isActive ? "#757575" : "#9CA3AF"} strokeWidth="2" />
        </svg>
      </div>
    ),
    direct: (
      <div className={`${baseClass} ${activeClass}`}>
        <svg width="24" height="14" viewBox="0 0 24 14">
          <line x1="2" y1="7" x2="22" y2="7" stroke={isActive ? "#059669" : "#9CA3AF"} strokeWidth="2" />
        </svg>
      </div>
    ),
    dashed: (
      <div className={`${baseClass} ${activeClass}`}>
        <svg width="24" height="14" viewBox="0 0 24 14">
          <line x1="2" y1="7" x2="22" y2="7" stroke={isActive ? "#D4A574" : "#9CA3AF"} strokeWidth="2" strokeDasharray="4,2" />
        </svg>
      </div>
    ),
    rounded: (
      <div className={`${baseClass} ${activeClass}`}>
        <svg width="24" height="14" viewBox="0 0 24 14">
          <path d="M2,7 L8,7 Q11,7 11,4 L11,3 Q11,1 14,1 L22,1" fill="none" stroke={isActive ? "#3182CE" : "#9CA3AF"} strokeWidth="2" />
        </svg>
      </div>
    )
  };
  
  return icons[style] || null;
};

const ColorThemePreview = ({ theme, isActive }: { theme: ColorThemeKey; isActive: boolean }) => {
  const baseClass = "w-10 h-6 border-2 rounded flex items-center justify-center gap-0.5 px-1";
  const activeClass = isActive ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-white";

  const previews: Record<ColorThemeKey, React.ReactNode> = {
    classic: (
      <div className={`${baseClass} ${activeClass}`}>
        <div className="w-2 h-2 rounded-full bg-slate-600" />
        <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        <div className="w-1 h-1 rounded-full bg-slate-300" />
      </div>
    ),
    colorful: (
      <div className={`${baseClass} ${activeClass}`}>
        <div className="w-2 h-2 rounded-full bg-blue-500" />
        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
        <div className="w-1 h-1 rounded-full bg-amber-500" />
      </div>
    ),
    dark: (
      <div className={`${baseClass} ${isActive ? 'border-blue-500 bg-slate-800' : 'border-gray-300 bg-slate-800'}`}>
        <div className="w-2 h-2 rounded-full bg-slate-600 border border-slate-500" />
        <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
        <div className="w-1 h-1 rounded-full bg-slate-400" />
      </div>
    ),
  };

  return previews[theme] || null;
};

function getMaxDepth(nodes: Node[]): number {
  const childrenMap = new Map<string | null, Node[]>();
  for (const n of nodes) {
    const pid = n.parent_node_id || null;
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid)!.push(n);
  }
  const walk = (parentId: string | null, depth: number): number => {
    const children = childrenMap.get(parentId) || [];
    if (children.length === 0) return depth;
    return Math.max(...children.map(c => walk(c.id, depth + 1)));
  };
  return walk(null, 0);
}

function MindMapView({
  nodes,
  documentTitle,
  onNodeUpdate,
  onNodeAdd,
  onNodeDelete,
  onNodeMove,
  onBackToOutline
}: MindMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mindMapRef = useRef<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [currentLineStyle, setCurrentLineStyle] = useState<LineStyleKey>(getStoredLineStyle);
  const [currentColorTheme, setCurrentColorTheme] = useState<ColorThemeKey>(getStoredColorTheme);
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showLevelMenu, setShowLevelMenu] = useState(false);
  const [collapseLevel, setCollapseLevel] = useState<number>(0); // 0 = show all
  
  // 用于跳过自己触发的 nodes 更新
  const skipNextNodesUpdateRef = useRef(false);
  // 记录上一次的 nodes 长度和内容哈希，用于判断是否需要更新
  const prevNodesRef = useRef<string>('');
  
  const callbacksRef = useRef({
    onNodeUpdate,
    onNodeAdd,
    onNodeDelete,
    onNodeMove
  });
  
  useEffect(() => {
    callbacksRef.current = {
      onNodeUpdate,
      onNodeAdd,
      onNodeDelete,
      onNodeMove
    };
  }, [onNodeUpdate, onNodeAdd, onNodeDelete, onNodeMove]);

  const convertNodesToMindMapData = useCallback((nodes: Node[], collapseLvl: number = 0): MindMapNodeData => {
    const rootNodes = nodes.filter(n => !n.parent_node_id);
    const isColorful = currentColorTheme === 'colorful';
    const isDark = currentColorTheme === 'dark';

    // 为二级节点分配分支颜色
    const getBranchColor = (branchIndex: number) => {
      return BRANCH_COLORS[branchIndex % BRANCH_COLORS.length];
    };

    // depth: 0 = root的子节点(二级节点), 1 = 二级节点的子节点(三级节点), 以此类推
    // branchIndex: 二级节点在兄弟中的索引，用于彩色主题分配颜色
    const buildChildren = (parentId: string, depth: number, branchIndex: number): MindMapNodeData[] => {
      const children = nodes
        .filter(n => n.parent_node_id === parentId)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

      return children.map((child, i) => {
        let nodeText = child.content || '无标题';
        let nodeImage: string | undefined = undefined;
        let nodeImageSize: { width: number; height: number; custom?: boolean } | undefined = undefined;
        let nodeHyperlink: string | undefined = undefined;
        let nodeHyperlinkTitle: string | undefined = undefined;

        if (child.content_type === 'image' && child.file_path) {
          nodeText = child.content || child.file_name || '图片';
          nodeImage = getThumbnailUrl(child.file_path);
          nodeImageSize = { width: 100, height: 75, custom: true };
        } else if (child.content_type === 'attachment' && child.file_path) {
          nodeText = child.content || `📎 ${child.file_name || '附件'}`;
        } else {
          const docLinkRegex = /@\[([^\]]+)\]\(([^)]+)\)/;
          const docLinkMatch = nodeText.match(docLinkRegex);
          if (docLinkMatch) {
            nodeHyperlink = `/d/${docLinkMatch[2]}`;
            nodeHyperlinkTitle = `跳转到: ${docLinkMatch[1]}`;
            nodeText = nodeText.replace(docLinkRegex, `@${docLinkMatch[1]}`);
          } else {
            const urlRegex = /(https?:\/\/[^\s<>&"']+)/;
            const urlMatch = nodeText.match(urlRegex);
            if (urlMatch) {
              nodeHyperlink = urlMatch[1];
              nodeHyperlinkTitle = urlMatch[1];
            }
          }
        }

        // 彩色主题：二级节点分配饱和色，三级+用浅色
        let nodeStyle: Record<string, any> | undefined;
        let noteColor: string;
        let tagBg: string;

        if (isColorful) {
          const bc = getBranchColor(branchIndex);
          if (depth === 0) {
            // 二级节点：饱和色背景 + 白字
            nodeStyle = { fillColor: bc.bg, color: bc.text, borderRadius: 6, paddingX: 14, paddingY: 6 };
            noteColor = 'rgba(255,255,255,0.8)';
            tagBg = 'rgba(255,255,255,0.15)';
          } else {
            // 三级+：浅色背景 + 深色文字
            nodeStyle = { fillColor: bc.light, color: bc.lightText, borderRadius: 4, paddingX: 8, paddingY: 3 };
            noteColor = '#808080';
            tagBg = 'transparent';
          }
        } else if (isDark) {
          noteColor = depth === 0 ? 'rgba(255,255,255,0.5)' : '#6b7280';
          tagBg = 'transparent';
        } else {
          noteColor = depth >= 1 ? '#808080' : '#ffffff';
          tagBg = 'transparent';
        }

        // 彩色主题下，子节点继承父级的 branchIndex
        const childBranchIndex = isColorful ? (depth === 0 ? i : branchIndex) : 0;

        // depth 0 = 二级节点(root的子节点), 所以 collapseLvl=N 对应 depth >= N-2
        const shouldCollapse = collapseLvl > 0 && depth >= collapseLvl - 2;

        return {
          data: {
            text: nodeText,
            id: child.id,
            image: nodeImage,
            imageTitle: child.file_name,
            imageSize: nodeImageSize,
            hyperlink: nodeHyperlink,
            hyperlinkTitle: nodeHyperlinkTitle,
            ...nodeStyle,
            ...(shouldCollapse ? { expand: false } : {}),
            tag: child.note && child.note.trim() ? [{
              text: child.note.trim(),
              style: {
                fill: tagBg,
                fontSize: 11,
                height: 14,
                paddingX: 0,
                radius: 0,
                color: noteColor
              }
            }] : []
          },
          children: buildChildren(child.id, depth + 1, childBranchIndex)
        };
      });
    };

    // 根节点的备注颜色
    const rootNoteColor = isDark ? 'rgba(255,255,255,0.5)' : '#808080';

    if (rootNodes.length === 0) {
      return {
        data: { text: documentTitle || '新文档', id: 'root' },
        children: []
      };
    }

    if (rootNodes.length === 1) {
      const rootNode = rootNodes[0];
      let nodeText = rootNode.content || '无标题';
      let nodeImage: string | undefined = undefined;
      let nodeImageSize: { width: number; height: number; custom?: boolean } | undefined = undefined;

      if (rootNode.content_type === 'image' && rootNode.file_path) {
        nodeText = rootNode.content || rootNode.file_name || '图片';
        nodeImage = getThumbnailUrl(rootNode.file_path);
        nodeImageSize = { width: 100, height: 75, custom: true };
      } else if (rootNode.content_type === 'attachment' && rootNode.file_path) {
        nodeText = rootNode.content || `📎 ${rootNode.file_name || '附件'}`;
      }

      return {
        data: {
          text: nodeText,
          id: rootNode.id,
          image: nodeImage,
          imageTitle: rootNode.file_name,
          imageSize: nodeImageSize,
          tag: rootNode.note && rootNode.note.trim() ? [{
            text: rootNode.note.trim(),
            style: { fill: 'transparent', fontSize: 11, height: 14, paddingX: 0, radius: 0, color: rootNoteColor }
          }] : []
        },
        children: buildChildren(rootNodes[0].id, 1, 0)
      };
    }

    return {
      data: { text: documentTitle || '新文档', id: 'root' },
      children: rootNodes
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map((node, i) => {
          let nodeText = node.content || '无标题';
          let nodeImage: string | undefined = undefined;
          let nodeImageSize: { width: number; height: number; custom?: boolean } | undefined = undefined;

          if (node.content_type === 'image' && node.file_path) {
            nodeText = node.content || node.file_name || '图片';
            nodeImage = getThumbnailUrl(node.file_path);
            nodeImageSize = { width: 100, height: 75, custom: true };
          } else if (node.content_type === 'attachment' && node.file_path) {
            nodeText = node.content || `📎 ${node.file_name || '附件'}`;
          }

          let nodeHyperlink: string | undefined = undefined;
          let nodeHyperlinkTitle: string | undefined = undefined;
          const docLinkRegex = /@\[([^\]]+)\]\(([^)]+)\)/;
          const docLinkMatch = nodeText.match(docLinkRegex);
          if (docLinkMatch) {
            nodeHyperlink = `/d/${docLinkMatch[2]}`;
            nodeHyperlinkTitle = `跳转到: ${docLinkMatch[1]}`;
            nodeText = nodeText.replace(docLinkRegex, `@${docLinkMatch[1]}`);
          } else {
            const urlRegex = /(https?:\/\/[^\s<>&"']+)/;
            const urlMatch = nodeText.match(urlRegex);
            if (urlMatch) {
              nodeHyperlink = urlMatch[1];
              nodeHyperlinkTitle = urlMatch[1];
            }
          }

          // 彩色主题：多根节点时也分配颜色
          let nodeStyle: Record<string, any> | undefined;
          let noteColor: string;
          let tagBg: string;

          if (isColorful) {
            const bc = getBranchColor(i);
            nodeStyle = { fillColor: bc.bg, color: bc.text, borderRadius: 6, paddingX: 14, paddingY: 6 };
            noteColor = 'rgba(255,255,255,0.8)';
            tagBg = 'rgba(255,255,255,0.15)';
          } else if (isDark) {
            noteColor = 'rgba(255,255,255,0.6)';
            tagBg = 'transparent';
          } else {
            noteColor = '#808080';
            tagBg = 'transparent';
          }

          return {
            data: {
              text: nodeText,
              id: node.id,
              image: nodeImage,
              imageTitle: node.file_name,
              imageSize: nodeImageSize,
              hyperlink: nodeHyperlink,
              hyperlinkTitle: nodeHyperlinkTitle,
              ...nodeStyle,
              tag: node.note && node.note.trim() ? [{
                text: node.note.trim(),
                style: { fill: tagBg, fontSize: 11, height: 14, paddingX: 0, radius: 0, color: noteColor }
              }] : []
            },
            children: buildChildren(node.id, 1, i)
          };
        })
    };
  }, [documentTitle, nodes, currentColorTheme]);

  const buildMergedTheme = useCallback((lineKey: LineStyleKey, colorKey: ColorThemeKey) => {
    const lineConfig = LINE_STYLES[lineKey];
    const colorConfig = COLOR_THEMES[colorKey];
    return {
      ...lineConfig.theme,
      backgroundColor: colorConfig.backgroundColor,
      lineColor: colorConfig.lineColor,
      root: { ...colorConfig.root },
      second: { ...colorConfig.second },
      node: { ...colorConfig.node },
    };
  }, []);

  const applyTheme = useCallback((lineKey: LineStyleKey, colorKey: ColorThemeKey) => {
    if (!mindMapRef.current) return;
    const mergedTheme = buildMergedTheme(lineKey, colorKey);
    mindMapRef.current.setThemeConfig(mergedTheme, false);
    if (containerRef.current) {
      containerRef.current.style.backgroundColor = mergedTheme.backgroundColor;
    }
  }, [buildMergedTheme]);

  // 初始化思维导图
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    let isDestroyed = false;
    
    const initMindMap = async () => {
      const MindMap = (await import('simple-mind-map')).default;
      const Export = (await import('simple-mind-map/src/plugins/Export.js')).default;
      const ExportPDF = (await import('simple-mind-map/src/plugins/ExportPDF.js')).default;
      // 动态导入移动端触控插件
      const TouchEvent = (await import('simple-mind-map/src/plugins/TouchEvent.js')).default;
      
      if (isDestroyed) return;
      
      // 注册插件（使用静态方法）
      MindMap.usePlugin(Export);
      MindMap.usePlugin(ExportPDF);
      // 注册移动端触控支持
      MindMap.usePlugin(TouchEvent);
      
      const data = convertNodesToMindMapData(nodes, collapseLevel);
      const mergedTheme = buildMergedTheme(currentLineStyle, currentColorTheme);

      const mindMap = new (MindMap as any)({
        el: container,
        data: data,
        layout: 'logicalStructure',
        themeConfig: mergedTheme,
        enableFreeDrag: false,
        nodeTextEditZIndex: 1000,
        textAutoWrapWidth: 99999,
        minZoom: 0.5,
        maxZoom: 2,
        enableDblclickReset: true,
        enableDragWithInertia: true,
        enableDrag: true,
        mouseScaleCenterUseMousePosition: true,
      });

      mindMapRef.current = mindMap;
      container.style.backgroundColor = mergedTheme.backgroundColor;

      // 监听文本编辑完成事件
      mindMap.on('hide_text_edit', async (_textEditNode: any, _activeNodeList: any, node: any) => {
        if (!node) return;
        const nodeData = node.getData();
        const nodeId = nodeData?.id;
        const nodeUid = nodeData?.uid;
        const newText = nodeData?.text;

        // 设置标志，跳过自己触发的 nodes 更新
        skipNextNodesUpdateRef.current = true;
        
        // 如果没有 nodeId 但有 uid，说明是新建的节点
        if (!nodeId && nodeUid) {
          const parentNode = node.parent;
          const parentData = parentNode?.getData();
          const parentNodeId = parentData?.id;
          const actualParentId = parentNodeId === 'root' ? null : parentNodeId;
          
          if (newText && newText.trim()) {
            // 调用 onNodeAdd 保存到数据库，并获取新节点的 id
            const newNode = await callbacksRef.current.onNodeAdd(actualParentId, newText.trim());
            // 直接更新节点的 id，而不是刷新整个思维导图
            if (newNode && node.nodeData) {
              node.nodeData.data.id = newNode.id;
            }
          }
        } else if (nodeId && nodeId !== 'root' && newText !== undefined) {
          callbacksRef.current.onNodeUpdate(nodeId, newText);
        }
      });

      // 监听右键菜单事件
      mindMap.on('node_contextmenu', (e: MouseEvent, node: any) => {
        e.preventDefault();
        e.stopPropagation();
        
        const nodeData = node.getData();
        const nodeId = nodeData?.id;
        const nodeUid = nodeData?.uid;
        // 新建的节点没有 id，但有 uid，也需要能显示菜单
        if (!nodeId && !nodeUid) return;

        // 移除已存在的菜单
        const existingMenu = document.querySelector('.mindmap-context-menu');
        if (existingMenu) {
          existingMenu.remove();
        }

        const menu = document.createElement('div');
        menu.className = 'mindmap-context-menu';
        menu.style.cssText = `
          position: fixed;
          left: ${e.clientX}px;
          top: ${e.clientY}px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          padding: 8px 0;
          z-index: 10000;
          min-width: 120px;
        `;

        const addChildBtn = document.createElement('div');
        addChildBtn.textContent = '新增子节点';
        addChildBtn.style.cssText = `
          padding: 8px 16px;
          cursor: pointer;
          font-size: 14px;
        `;
        addChildBtn.onmouseenter = () => addChildBtn.style.background = '#f0f0f0';
        addChildBtn.onmouseleave = () => addChildBtn.style.background = 'transparent';
        addChildBtn.onclick = (evt) => {
          evt.stopPropagation();
          menu.remove();
          mindMap.execCommand('INSERT_CHILD_NODE', true, [node]);
        };
        menu.appendChild(addChildBtn);

        // 只有已保存的节点（有 id）才能删除，新建节点（只有 uid）不能删除
        if (nodeId && nodeId !== 'root') {
          const deleteBtn = document.createElement('div');
          deleteBtn.textContent = '删除节点';
          deleteBtn.style.cssText = `
            padding: 8px 16px;
            cursor: pointer;
            font-size: 14px;
            color: #dc2626;
          `;
          deleteBtn.onmouseenter = () => deleteBtn.style.background = '#fee2e2';
          deleteBtn.onmouseleave = () => deleteBtn.style.background = 'transparent';
          deleteBtn.onclick = (evt) => {
            evt.stopPropagation();
            // 设置标志，跳过后端更新触发的重新渲染
            skipNextNodesUpdateRef.current = true;
            // 先从思维导图中删除节点（立即更新视图）
            mindMap.execCommand('REMOVE_NODE', [node]);
            // 然后同步到后端
            callbacksRef.current.onNodeDelete(nodeId);
            menu.remove();
          };
          menu.appendChild(deleteBtn);
        }

        document.body.appendChild(menu);

        const closeMenu = (evt: MouseEvent) => {
          if (!menu.contains(evt.target as globalThis.Node)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
          }
        };
        
        setTimeout(() => {
          document.addEventListener('click', closeMenu);
        }, 0);
      });

      // 监听节点拖拽结束事件
      mindMap.on('node_dragend', (_: any, node: any) => {
        const nodeData = node.getData();
        const nodeId = nodeData?.id;
        const parentNode = node.getParent();
        const parentData = parentNode?.getData();
        const newParentId = parentData?.id;
        
        if (nodeId && nodeId !== 'root' && newParentId !== nodeId) {
          callbacksRef.current.onNodeMove(nodeId, newParentId === 'root' ? null : newParentId);
        }
      });
    };

    initMindMap();

    return () => {
      isDestroyed = true;
      if (mindMapRef.current) {
        try {
          mindMapRef.current.destroy();
        } catch {}
        mindMapRef.current = null;
      }
    };
  }, []);

  // 更新数据
  useEffect(() => {
    if (!mindMapRef.current) return;

    // 跳过自己触发的更新
    if (skipNextNodesUpdateRef.current) {
      skipNextNodesUpdateRef.current = false;
      prevNodesRef.current = JSON.stringify(nodes.map(n => ({ id: n.id, content: n.content }))) + '|' + currentColorTheme + '|' + collapseLevel;
      return;
    }

    // 检查节点是否真的发生了变化（新增或删除节点），或色彩主题/层级切换了
    const currentNodesHash = JSON.stringify(nodes.map(n => ({ id: n.id, content: n.content })));
    const currentHashWithTheme = currentNodesHash + '|' + currentColorTheme + '|' + collapseLevel;
    if (currentHashWithTheme === prevNodesRef.current) {
      return;
    }

    // 检测是否是文章切换（所有节点 ID 都变了）
    const prevNodesHash = (prevNodesRef.current || '|').split('|')[0];
    let prevNodes: any[] = [];
    try { prevNodes = JSON.parse(prevNodesHash || '[]'); } catch { prevNodes = []; }
    const currentIds = new Set(nodes.map(n => n.id));
    const prevIds = new Set(prevNodes.map((n: any) => n.id));

    // 如果当前节点和之前的节点完全没有交集，说明是文章切换
    const hasIntersection = [...currentIds].some(id => prevIds.has(id));

    // 检测色彩主题是否切换了（setData 不会清除节点上的 fillColor 等属性，需要重建）
    const prevTheme = (prevNodesRef.current || '').split('|')[1];
    const themeChanged = prevTheme && prevTheme !== currentColorTheme;

    if ((!hasIntersection && prevNodes.length > 0) || themeChanged) {
      // 文章切换或色彩主题切换，重新初始化思维导图
      try {
        mindMapRef.current.destroy();
      } catch {}
      mindMapRef.current = null;
      // 触发重新初始化
      const container = containerRef.current;
      if (container) {
        // 清空容器
        container.innerHTML = '';
        // 重新初始化
        const initMindMap = async () => {
          const MindMap = (await import('simple-mind-map')).default;
          const Export = (await import('simple-mind-map/src/plugins/Export.js')).default;
          const ExportPDF = (await import('simple-mind-map/src/plugins/ExportPDF.js')).default;
          const TouchEvent = (await import('simple-mind-map/src/plugins/TouchEvent.js')).default;

          MindMap.usePlugin(Export);
          MindMap.usePlugin(ExportPDF);
          MindMap.usePlugin(TouchEvent);

          const data = convertNodesToMindMapData(nodes, collapseLevel);
          const mergedTheme = buildMergedTheme(currentLineStyle, currentColorTheme);

          const mindMap = new (MindMap as any)({
            el: container,
            data: data,
            layout: 'logicalStructure',
            themeConfig: mergedTheme,
            enableFreeDrag: false,
            nodeTextEditZIndex: 1000,
            textAutoWrapWidth: 99999,
            minZoom: 0.5,
            maxZoom: 2,
            enableDblclickReset: true,
            enableDragWithInertia: true,
            enableDrag: true,
            mouseScaleCenterUseMousePosition: true,
          });

          mindMapRef.current = mindMap;
          container.style.backgroundColor = mergedTheme.backgroundColor;

          // 重新绑定事件
          mindMap.on('hide_text_edit', async (_textEditNode: any, _activeNodeList: any, node: any) => {
            if (!node) return;
            const nodeData = node.getData();
            const nodeId = nodeData?.id;
            const nodeUid = nodeData?.uid;
            const newText = nodeData?.text;

            skipNextNodesUpdateRef.current = true;

            if (!nodeId && nodeUid) {
              const parentNode = node.parent;
              const parentData = parentNode?.getData();
              const parentId = parentData?.id || null;

              const newNode = await callbacksRef.current.onNodeAdd(parentId, newText);
              if (newNode) {
                node.setData({
                  ...nodeData,
                  id: newNode.id,
                  uid: undefined
                });
              }
            } else if (nodeId) {
              callbacksRef.current.onNodeUpdate(nodeId, newText);
            }
          });

          mindMap.on('node_active', (node: any) => {
            if (node && node.getData()?.id) {
              window.dispatchEvent(new CustomEvent('mindmap-node-focus', {
                detail: { nodeId: node.getData().id }
              }));
            }
          });

          mindMap.on('node_click', (node: any, e: MouseEvent) => {
            if (e.shiftKey && node && node.getData()?.id) {
              window.dispatchEvent(new CustomEvent('mindmap-node-select', {
                detail: { nodeId: node.getData().id }
              }));
            }
          });
        };
        initMindMap();
      }
    } else {
      // 普通更新，使用 setData
      const data = convertNodesToMindMapData(nodes, collapseLevel);
      mindMapRef.current.setData(data);
    }

    prevNodesRef.current = currentHashWithTheme;
  }, [nodes, convertNodesToMindMapData, currentLineStyle, currentColorTheme, collapseLevel, buildMergedTheme]);

  // 更新样式
  useEffect(() => {
    if (mindMapRef.current) {
      applyTheme(currentLineStyle, currentColorTheme);
    }
  }, [currentLineStyle, currentColorTheme, applyTheme]);

  const handleLineStyleChange = (styleKey: LineStyleKey) => {
    setCurrentLineStyle(styleKey);
    setStoredLineStyle(styleKey);
  };

  const handleColorThemeChange = (themeKey: ColorThemeKey) => {
    setCurrentColorTheme(themeKey);
    setStoredColorTheme(themeKey);
  };

  const handleExportPDF = async () => {
    if (!mindMapRef.current) {
      return;
    }

    setIsExporting(true);
    try {
      const pdf = await mindMapRef.current.export('pdf', true, documentTitle || '思维导图');
      return pdf;
    } catch (error) {
      console.error('PDF export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <button
            onClick={onBackToOutline}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            返回大纲
          </button>
          <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2" />
          <span className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            {documentTitle}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* 层级过滤器 */}
          {(() => {
            const maxDepth = getMaxDepth(nodes);
            if (maxDepth <= 1) return null;
            return (
              <div className="relative">
                <button
                  onClick={() => { setShowLevelMenu(!showLevelMenu); setShowColorMenu(false); setShowStyleMenu(false); }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <Layers className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {collapseLevel === 0 ? '全部层级' : `显示 ${collapseLevel} 级`}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </button>
                {showLevelMenu && (
                  <div className="absolute right-0 top-full mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[140px] z-50">
                    <button
                      onClick={() => { setCollapseLevel(0); setShowLevelMenu(false); }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${collapseLevel === 0 ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                    >
                      <span>全部层级</span>
                      <span className="text-xs text-gray-400">展开所有</span>
                    </button>
                    {Array.from({ length: maxDepth }, (_, i) => i + 1).map(level => (
                      <button
                        key={level}
                        onClick={() => { setCollapseLevel(level); setShowLevelMenu(false); }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${collapseLevel === level ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                      >
                        <span>{level} 级</span>
                        <span className="text-xs text-gray-400">{level === 1 ? '仅根节点' : `显示到 ${level} 级`}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* 色彩主题选择器 */}
          <div className="relative">
            <button
              onClick={() => { setShowColorMenu(!showColorMenu); setShowStyleMenu(false); setShowLevelMenu(false); }}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <ColorThemePreview theme={currentColorTheme} isActive={false} />
              <span className="text-sm hidden sm:inline">{COLOR_THEMES[currentColorTheme].name}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showColorMenu && (
              <div className="absolute right-0 top-full mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 min-w-[180px] z-50">
                {(Object.keys(COLOR_THEMES) as ColorThemeKey[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => {
                      handleColorThemeChange(key);
                      setShowColorMenu(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                      currentColorTheme === key ? 'bg-gray-50 dark:bg-gray-750' : ''
                    }`}
                  >
                    <ColorThemePreview theme={key} isActive={currentColorTheme === key} />
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {COLOR_THEMES[key].name}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {COLOR_THEMES[key].description}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 线条形状选择器 */}
          <div className="relative">
            <button
              onClick={() => { setShowStyleMenu(!showStyleMenu); setShowColorMenu(false); setShowLevelMenu(false); }}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <LineStylePreview style={currentLineStyle} isActive={false} />
              <span className="text-sm hidden sm:inline">{LINE_STYLES[currentLineStyle].name}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showStyleMenu && (
              <div className="absolute right-0 top-full mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 min-w-[180px] z-50">
                {(Object.keys(LINE_STYLES) as LineStyleKey[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => {
                      handleLineStyleChange(key);
                      setShowStyleMenu(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                      currentLineStyle === key ? 'bg-gray-50 dark:bg-gray-750' : ''
                    }`}
                  >
                    <LineStylePreview style={key} isActive={currentLineStyle === key} />
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {LINE_STYLES[key].name}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {LINE_STYLES[key].description}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            {isExporting ? '导出中...' : '导出 PDF'}
          </button>
        </div>
      </div>
      
      <div 
        ref={containerRef} 
        className="flex-1 overflow-hidden touch-none"
        style={{ 
          backgroundColor: COLOR_THEMES[currentColorTheme].backgroundColor,
          touchAction: 'none',
        }}
      />
    </div>
  );
}

export default MindMapView;
