import { useEffect, useRef, useState, useCallback } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import type { Node } from '../api/data';

interface MindMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: Node[];
  documentTitle: string;
  onNodeUpdate: (id: string, content: string) => void;
  onNodeAdd: (parentId: string | null, content: string) => void;
  onNodeDelete: (id: string) => void;
  onNodeMove: (id: string, newParentId: string | null) => void;
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

interface LineStyleConfig {
  name: string;
  description: string;
  previewIcon: string;
  theme: any;
}

// 5种导线样式配置 - 重点突出连线样式的差异
const LINE_STYLES: Record<LineStyleKey, LineStyleConfig> = {
  // 1. 曲线风格 - 平滑的贝塞尔曲线（参考图片3、4的XMind彩虹风格）
  curve: {
    name: '曲线风格',
    description: '平滑贝塞尔曲线，柔和自然',
    previewIcon: 'curve',
    theme: {
      "backgroundColor": "#ffffff",
      "lineStyle": "curve",
      "lineWidth": 2,
      "lineColor": "#3B82F6",
      "lineDasharray": "none",
      "lineRadius": 0,
      "rootLineKeepSameInCurve": true,
      "root": {
        "fillColor": "#2563EB",
        "color": "#ffffff",
        "fontSize": 18,
        "fontWeight": "bold",
        "borderRadius": 8,
        "borderWidth": 0,
        "paddingX": 20,
        "paddingY": 12
      },
      "second": {
        "fillColor": "#3B82F6",
        "color": "#ffffff",
        "fontSize": 16,
        "fontWeight": "normal",
        "borderRadius": 6,
        "borderWidth": 0,
        "paddingX": 16,
        "paddingY": 10
      },
      "node": {
        "fillColor": "#DBEAFE",
        "color": "#1E40AF",
        "fontSize": 14,
        "fontWeight": "normal",
        "borderRadius": 4,
        "borderWidth": 0,
        "paddingX": 12,
        "paddingY": 8
      }
    }
  },
  // 2. 直线风格 - 带圆角的折线（参考图片2的商务风格）
  straight: {
    name: '直线风格',
    description: '直角折线，简洁商务',
    previewIcon: 'straight',
    theme: {
      "backgroundColor": "#F5F5F5",
      "lineStyle": "straight",
      "lineWidth": 1.5,
      "lineColor": "#757575",
      "lineDasharray": "none",
      "lineRadius": 0,
      "root": {
        "fillColor": "#424242",
        "color": "#ffffff",
        "fontSize": 18,
        "fontWeight": "bold",
        "borderRadius": 0,
        "borderWidth": 1,
        "borderColor": "#212121",
        "paddingX": 20,
        "paddingY": 12
      },
      "second": {
        "fillColor": "#616161",
        "color": "#ffffff",
        "fontSize": 16,
        "fontWeight": "bold",
        "borderRadius": 0,
        "borderWidth": 1,
        "borderColor": "#424242",
        "paddingX": 16,
        "paddingY": 10
      },
      "node": {
        "fillColor": "#E0E0E0",
        "color": "#424242",
        "fontSize": 14,
        "fontWeight": "bold",
        "borderRadius": 0,
        "borderWidth": 1,
        "borderColor": "#BDBDBD",
        "paddingX": 12,
        "paddingY": 8
      }
    }
  },
  // 3. 直连风格 - 直接连线（简洁直接）
  direct: {
    name: '直连风格',
    description: '直接连线，极简风格',
    previewIcon: 'direct',
    theme: {
      "backgroundColor": "#FAFAFA",
      "lineStyle": "direct",
      "lineWidth": 2,
      "lineColor": "#059669",
      "lineDasharray": "none",
      "lineRadius": 0,
      "root": {
        "fillColor": "#059669",
        "color": "#ffffff",
        "fontSize": 18,
        "fontWeight": "bold",
        "borderRadius": 12,
        "borderWidth": 0,
        "paddingX": 20,
        "paddingY": 12
      },
      "second": {
        "fillColor": "#10B981",
        "color": "#ffffff",
        "fontSize": 16,
        "fontWeight": "normal",
        "borderRadius": 8,
        "borderWidth": 0,
        "paddingX": 16,
        "paddingY": 10
      },
      "node": {
        "fillColor": "#D1FAE5",
        "color": "#065F46",
        "fontSize": 14,
        "fontWeight": "normal",
        "borderRadius": 6,
        "borderWidth": 0,
        "paddingX": 12,
        "paddingY": 8
      }
    }
  },
  // 4. 虚线风格 - 虚线连线（特殊标记风格）
  dashed: {
    name: '虚线风格',
    description: '虚线连接，轻盈通透',
    previewIcon: 'dashed',
    theme: {
      "backgroundColor": "#FDF8F3",
      "lineStyle": "straight",
      "lineWidth": 2,
      "lineColor": "#D4A574",
      "lineDasharray": "8,4",
      "lineRadius": 0,
      "root": {
        "fillColor": "#D4A574",
        "color": "#ffffff",
        "fontSize": 18,
        "fontWeight": "bold",
        "borderRadius": 10,
        "borderWidth": 0,
        "paddingX": 20,
        "paddingY": 12
      },
      "second": {
        "fillColor": "#E8C4A0",
        "color": "#5D4037",
        "fontSize": 16,
        "fontWeight": "normal",
        "borderRadius": 8,
        "borderWidth": 0,
        "paddingX": 16,
        "paddingY": 10
      },
      "node": {
        "fillColor": "#FFF8F0",
        "color": "#5D4037",
        "fontSize": 14,
        "fontWeight": "normal",
        "borderRadius": 6,
        "borderWidth": 1,
        "borderColor": "#E8C4A0",
        "paddingX": 12,
        "paddingY": 8
      }
    }
  },
  // 5. 圆角直线风格 - 大圆角折线（柔和商务风）
  rounded: {
    name: '圆角直线',
    description: '大圆角折线，柔和现代',
    previewIcon: 'rounded',
    theme: {
      "backgroundColor": "#F0F4F8",
      "lineStyle": "straight",
      "lineWidth": 2.5,
      "lineColor": "#3182CE",
      "lineDasharray": "none",
      "lineRadius": 15,
      "root": {
        "fillColor": "#1A365D",
        "color": "#ffffff",
        "fontSize": 18,
        "fontWeight": "bold",
        "borderRadius": 16,
        "borderWidth": 0,
        "paddingX": 24,
        "paddingY": 14
      },
      "second": {
        "fillColor": "#3182CE",
        "color": "#ffffff",
        "fontSize": 16,
        "fontWeight": "normal",
        "borderRadius": 12,
        "borderWidth": 0,
        "paddingX": 18,
        "paddingY": 12
      },
      "node": {
        "fillColor": "#EBF8FF",
        "color": "#2A4365",
        "fontSize": 14,
        "fontWeight": "normal",
        "borderRadius": 10,
        "borderWidth": 0,
        "paddingX": 14,
        "paddingY": 10
      }
    }
  }
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

// 连线样式预览图标组件
const LineStylePreview = ({ style, isActive }: { style: LineStyleKey; isActive: boolean }) => {
  const baseClass = "w-12 h-8 border-2 rounded flex items-center justify-center";
  const activeClass = isActive ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-white";
  
  switch (style) {
    case 'curve':
      return (
        <div className={`${baseClass} ${activeClass}`}>
          <svg width="32" height="20" viewBox="0 0 32 20">
            <path d="M2,10 Q8,2 16,10 T30,10" fill="none" stroke={isActive ? "#3B82F6" : "#9CA3AF"} strokeWidth="2" />
          </svg>
        </div>
      );
    case 'straight':
      return (
        <div className={`${baseClass} ${activeClass}`}>
          <svg width="32" height="20" viewBox="0 0 32 20">
            <polyline points="2,10 12,10 12,5 30,5" fill="none" stroke={isActive ? "#757575" : "#9CA3AF"} strokeWidth="2" />
          </svg>
        </div>
      );
    case 'direct':
      return (
        <div className={`${baseClass} ${activeClass}`}>
          <svg width="32" height="20" viewBox="0 0 32 20">
            <line x1="2" y1="10" x2="30" y2="10" stroke={isActive ? "#059669" : "#9CA3AF"} strokeWidth="2" />
          </svg>
        </div>
      );
    case 'dashed':
      return (
        <div className={`${baseClass} ${activeClass}`}>
          <svg width="32" height="20" viewBox="0 0 32 20">
            <line x1="2" y1="10" x2="30" y2="10" stroke={isActive ? "#D4A574" : "#9CA3AF"} strokeWidth="2" strokeDasharray="4,2" />
          </svg>
        </div>
      );
    case 'rounded':
      return (
        <div className={`${baseClass} ${activeClass}`}>
          <svg width="32" height="20" viewBox="0 0 32 20">
            <path d="M2,10 L10,10 Q14,10 14,6 L14,5 Q14,2 17,2 L30,2" fill="none" stroke={isActive ? "#3182CE" : "#9CA3AF"} strokeWidth="2" />
          </svg>
        </div>
      );
    default:
      return null;
  }
};

const MindMapModal = ({
  isOpen,
  onClose,
  nodes,
  documentTitle,
  onNodeUpdate,
  onNodeAdd,
  onNodeDelete,
  onNodeMove
}: MindMapModalProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mindMapRef = useRef<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [currentLineStyle, setCurrentLineStyle] = useState<LineStyleKey>(getStoredLineStyle);
  const [showStyleMenu, setShowStyleMenu] = useState(false);

  const convertNodesToMindMapData = useCallback((nodes: Node[]): MindMapNodeData => {
    const rootNodes = nodes.filter(n => !n.parent_node_id);
    
    const buildChildren = (parentId: string): MindMapNodeData[] => {
      const children = nodes
        .filter(n => n.parent_node_id === parentId)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      
      return children.map(child => ({
        data: {
          text: child.content || '无标题',
          id: child.id
        },
        children: buildChildren(child.id)
      }));
    };

    if (rootNodes.length === 0) {
      return {
        data: {
          text: documentTitle || '新文档',
          id: 'root'
        },
        children: []
      };
    }

    if (rootNodes.length === 1) {
      return {
        data: {
          text: rootNodes[0].content || '无标题',
          id: rootNodes[0].id
        },
        children: buildChildren(rootNodes[0].id)
      };
    }

    return {
      data: {
        text: documentTitle || '新文档',
        id: 'root'
      },
      children: rootNodes
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map(node => ({
          data: {
            text: node.content || '无标题',
            id: node.id
          },
          children: buildChildren(node.id)
        }))
    };
  }, [documentTitle, nodes]);

  const applyLineStyle = useCallback((styleKey: LineStyleKey) => {
    if (!mindMapRef.current) return;
    
    const styleConfig = LINE_STYLES[styleKey];
    // 使用 setThemeConfig 来更新主题配置，而不是 setTheme
    // 第二个参数 false 表示触发重新渲染
    mindMapRef.current.setThemeConfig(styleConfig.theme, false);
    
    if (containerRef.current) {
      containerRef.current.style.backgroundColor = styleConfig.theme.backgroundColor;
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const container = containerRef.current;
    
    const initMindMap = async () => {
      const MindMap = (await import('simple-mind-map')).default;
      
      const data = convertNodesToMindMapData(nodes);

      if (mindMapRef.current) {
        mindMapRef.current.setData(data);
        applyLineStyle(currentLineStyle);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const styleConfig = LINE_STYLES[currentLineStyle];
      mindMapRef.current = new (MindMap as any)({
        el: container,
        data: data,
        layout: 'logicalStructure',
        // 使用 themeConfig 而不是 theme 来传递自定义配置
        themeConfig: styleConfig.theme,
        enableFreeDrag: false,
        nodeTextEditZIndex: 1000,
      });

      container.style.backgroundColor = styleConfig.theme.backgroundColor;

      mindMapRef.current.on('node_dblclick', (_: any, node: any) => {
        const nodeData = node.getData();
        const nodeId = nodeData?.id;
        mindMapRef.current?.renderer.startTextEdit(node, '', (newText: string) => {
          if (nodeId && nodeId !== 'root') {
            onNodeUpdate(nodeId, newText);
          }
        });
      });

      mindMapRef.current.on('node_contextmenu', (e: MouseEvent, node: any) => {
        e.preventDefault();
        const nodeData = node.getData();
        const nodeId = nodeData?.id;
        if (!nodeId) return;

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
        addChildBtn.className = 'mindmap-menu-item';
        addChildBtn.style.cssText = `
          padding: 8px 16px;
          cursor: pointer;
          font-size: 14px;
        `;
        addChildBtn.onmouseenter = () => addChildBtn.style.background = '#f0f0f0';
        addChildBtn.onmouseleave = () => addChildBtn.style.background = 'transparent';
        addChildBtn.onclick = () => {
          onNodeAdd(nodeId === 'root' ? null : nodeId, '新节点');
          document.body.removeChild(menu);
        };
        menu.appendChild(addChildBtn);

        if (nodeId !== 'root') {
          const deleteBtn = document.createElement('div');
          deleteBtn.textContent = '删除节点';
          deleteBtn.className = 'mindmap-menu-item';
          deleteBtn.style.cssText = `
            padding: 8px 16px;
            cursor: pointer;
            font-size: 14px;
            color: #dc2626;
          `;
          deleteBtn.onmouseenter = () => deleteBtn.style.background = '#fee2e2';
          deleteBtn.onmouseleave = () => deleteBtn.style.background = 'transparent';
          deleteBtn.onclick = () => {
            onNodeDelete(nodeId);
            document.body.removeChild(menu);
          };
          menu.appendChild(deleteBtn);
        }

        document.body.appendChild(menu);

        const closeMenu = (e: MouseEvent) => {
          if (!menu.contains(e.target as globalThis.Node)) {
            try {
              document.body.removeChild(menu);
            } catch {}
            document.removeEventListener('click', closeMenu);
          }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
      });

      mindMapRef.current.on('node_dragend', (_: any, node: any) => {
        const nodeData = node.getData();
        const nodeId = nodeData?.id;
        const parentNode = node.getParent();
        const parentData = parentNode?.getData();
        const newParentId = parentData?.id;
        
        if (nodeId && nodeId !== 'root' && newParentId !== nodeId) {
          onNodeMove(nodeId, newParentId === 'root' ? null : newParentId);
        }
      });
    };

    initMindMap();

    return () => {
      if (mindMapRef.current) {
        try {
          mindMapRef.current.destroy();
        } catch {}
        mindMapRef.current = null;
      }
    };
  }, [isOpen, nodes, convertNodesToMindMapData, onNodeUpdate, onNodeAdd, onNodeDelete, onNodeMove, currentLineStyle, applyLineStyle]);

  useEffect(() => {
    if (isOpen && mindMapRef.current) {
      const data = convertNodesToMindMapData(nodes);
      mindMapRef.current.setData(data);
    }
  }, [nodes, isOpen, convertNodesToMindMapData]);

  const handleLineStyleChange = (styleKey: LineStyleKey) => {
    setCurrentLineStyle(styleKey);
    setStoredLineStyle(styleKey);
    applyLineStyle(styleKey);
    setShowStyleMenu(false);
  };

  const handleExportPDF = async () => {
    if (!containerRef.current || !mindMapRef.current) return;
    
    setIsExporting(true);
    try {
      const styleConfig = LINE_STYLES[currentLineStyle];
      const canvas = await html2canvas(containerRef.current, {
        backgroundColor: styleConfig.theme.backgroundColor,
        scale: 2,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`${documentTitle || '思维导图'}.pdf`);
    } catch (error) {
      console.error('PDF export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-[95vw] h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
            思维导图 - {documentTitle}
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowStyleMenu(!showStyleMenu)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <LineStylePreview style={currentLineStyle} isActive={false} />
                <span className="text-sm">{LINE_STYLES[currentLineStyle].name}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {showStyleMenu && (
                <div className="absolute right-0 top-full mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 min-w-[200px] z-50">
                  {(Object.keys(LINE_STYLES) as LineStyleKey[]).map((key) => (
                    <button
                      key={key}
                      onClick={() => handleLineStyleChange(key)}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
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
                      {currentLineStyle === key && (
                        <svg className="w-4 h-4 text-blue-500 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <button
              onClick={handleExportPDF}
              disabled={isExporting}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isExporting ? '导出中...' : '导出 PDF'}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div 
          ref={containerRef} 
          className="flex-1 overflow-hidden"
          style={{ 
            width: 'calc(95vw - 32px)', 
            height: 'calc(90vh - 80px)',
            margin: '16px'
          }}
        />
      </div>
    </div>
  );
};

export default MindMapModal;
