# Excalidraw 整合方案分析

## 📊 项目现状分析

### Excalidraw 特性
- **npm 包**: `@excalidraw/excalidraw` v0.18.0
- **核心功能**: 无限画布、手绘风格、实时协作、导出 PNG/SVG/JSON
- **集成方式**: React 组件 `<Excalidraw />`
- **API**: `ExcalidrawImperativeAPI` - 命令式控制接口
- **数据格式**: JSON 场景文件（.excalidraw）

### MiniFlowy 现有架构
- **前端框架**: React 19 + TypeScript
- **数据模型**:
  - `Document`: 文档/文件夹
  - `Node`: 节点（支持 text、image、attachment 类型）
- **现有图形功能**: 基于 `simple-mind-map` 的思维导图
- **存储方式**: SQLite + 文件系统

---

## 🎯 整合目标

将 Excalidraw 作为 **新文档类型** 整合到 MiniFlowy 中：
1. 创建新的文档类型：`excalidraw`（白板/画布）
2. 支持在节点中嵌入 Excalidraw 画布
3. 画布数据保存为 JSON 格式
4. 支持导出为 PNG/SVG 图片
5. 与现有文档系统无缝集成

---

## 🏗️ 架构设计方案

### 方案一：作为新文档类型（推荐）⭐

**概念**: 将 Excalidraw 画布作为独立的文档类型，与 document、folder 并列

#### 数据库变更

```sql
-- 扩展 Document 表的 type 枚举
ALTER TABLE documents ADD COLUMN type VARCHAR(20) DEFAULT 'document';
-- 现有: 'document', 'folder'
-- 新增: 'excalidraw'

-- 新增画布数据表（存储 JSON）
CREATE TABLE excalidraw_data (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL UNIQUE,
    scene_data TEXT,  -- JSON 格式的画布数据
    thumbnail TEXT,   -- Base64 缩略图（可选）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id)
);
```

#### 前端组件设计

```
frontend/src/
├── components/
│   ├── ExcalidrawEditor.tsx       # 核心编辑器组件
│   ├── ExcalidrawToolbar.tsx      # 自定义工具栏
│   ├── ExcalidrawExportDialog.tsx # 导出对话框
│   └── ExcalidrawThumbnail.tsx    # 缩略图生成
├── api/
│   └── excalidraw.ts              # API 调用封装
└── pages/
    └── ExcalidrawPage.tsx         # 独立页面
```

#### 核心组件结构

```tsx
// ExcalidrawEditor.tsx
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

interface ExcalidrawEditorProps {
  documentId: string;
  initialData?: string;  // JSON string
  onSave: (data: string) => Promise<void>;
  readOnly?: boolean;
}

export const ExcalidrawEditor: React.FC<ExcalidrawEditorProps> = ({
  documentId,
  initialData,
  onSave,
  readOnly = false,
}) => {
  const excalidrawRef = useRef<ExcalidrawImperativeAPI>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 初始化数据
  useEffect(() => {
    if (initialData && excalidrawRef.current) {
      const sceneData = JSON.parse(initialData);
      excalidrawRef.current.updateScene(sceneData);
      setIsLoading(false);
    }
  }, [initialData]);

  // 自动保存（防抖）
  const debouncedSave = useMemo(
    () =>
      debounce(async (elements, appState) => {
        const data = JSON.stringify({ elements, appState });
        await onSave(data);
      }, 1000),
    [onSave]
  );

  // 监听变化
  const handleChange = useCallback(
    (elements, appState) => {
      debouncedSave(elements, appState);
    },
    [debouncedSave]
  );

  return (
    <div className="excalidraw-container" style={{ height: "100vh" }}>
      <Excalidraw
        ref={excalidrawRef}
        initialData={initialData ? JSON.parse(initialData) : undefined}
        onChange={handleChange}
        viewModeEnabled={readOnly}
        theme="light"
        langCode="zh-CN"
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: true,
            export: false,  // 使用自定义导出
            loadScene: false,
            saveToActiveFile: false,
          },
        }}
      >
        <MainMenu>
          <MainMenu.ItemCustom>
            <button onClick={handleExport}>导出</button>
          </MainMenu.ItemCustom>
        </MainMenu>
      </Excalidraw>
    </div>
  );
};
```

---

### 方案二：作为节点嵌入（轻量级）

**概念**: 在现有 Node 中添加新的 `content_type: 'excalidraw'`

#### 数据模型扩展

```typescript
// 扩展 Node 接口
export interface Node {
  id: string;
  document_id: string;
  parent_node_id: string | null;
  content: string;
  // ... 现有字段

  // 新增
  content_type?: 'text' | 'image' | 'attachment' | 'excalidraw';
  excalidraw_data?: string;  // JSON 格式的画布数据
  excalidraw_thumbnail?: string;  // Base64 缩略图
}
```

#### 组件设计

```tsx
// NodeExcalidraw.tsx - 嵌入式画布
export const NodeExcalidraw: React.FC<{
  node: Node;
  onUpdate: (data: string) => void;
}> = ({ node, onUpdate }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // 折叠状态：显示缩略图
  if (!isExpanded) {
    return (
      <div
        className="excalidraw-thumbnail"
        onClick={() => setIsExpanded(true)}
      >
        <img src={node.excalidraw_thumbnail} alt="画布" />
        <span>点击展开编辑</span>
      </div>
    );
  }

  // 展开状态：完整编辑器
  return (
    <div className="excalidraw-inline">
      <ExcalidrawEditor
        documentId={node.document_id}
        initialData={node.excalidraw_data}
        onSave={onUpdate}
      />
      <button onClick={() => setIsExpanded(false)}>折叠</button>
    </div>
  );
};
```

---

## 📦 技术实现步骤

### Phase 1: 环境准备

```bash
# 1. 安装 Excalidraw 依赖
cd frontend
npm install @excalidraw/excalidraw

# 2. 配置 TypeScript（如果需要）
# tsconfig.json 添加：
{
  "compilerOptions": {
    "types": ["@excalidraw/excalidraw/types"]
  }
}

# 3. 添加 CSS 导入
# main.tsx 或 App.tsx
import "@excalidraw/excalidraw/index.css";
```

### Phase 2: 后端 API 开发

```python
# backend/app/routers/excalidraw.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import json

router = APIRouter()

class ExcalidrawDataCreate(BaseModel):
    document_id: str
    scene_data: Optional[str] = None

class ExcalidrawDataUpdate(BaseModel):
    scene_data: str

@router.post("/excalidraw/", response_model=dict)
async def create_excalidraw_data(
    data: ExcalidrawDataCreate,
    db: Session = Depends(get_db)
):
    """创建画布数据"""
    # 验证 document 存在且类型为 excalidraw
    document = db.query(Document).filter(Document.id == data.document_id).first()
    if not document or document.type != 'excalidraw':
        raise HTTPException(400, "Invalid document")

    # 创建画布数据
    excalidraw = ExcalidrawData(
        id=str(uuid4()),
        document_id=data.document_id,
        scene_data=data.scene_data or '{"elements":[]}'
    )
    db.add(excalidraw)
    db.commit()
    return {"id": excalidraw.id}

@router.put("/excalidraw/{document_id}", response_model=dict)
async def update_excalidraw_data(
    document_id: str,
    data: ExcalidrawDataUpdate,
    db: Session = Depends(get_db)
):
    """更新画布数据（自动保存）"""
    excalidraw = db.query(ExcalidrawData).filter(
        ExcalidrawData.document_id == document_id
    ).first()

    if not excalidraw:
        raise HTTPException(404, "Not found")

    # 验证 JSON 格式
    try:
        json.loads(data.scene_data)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON")

    excalidraw.scene_data = data.scene_data
    excalidraw.updated_at = datetime.utcnow()
    db.commit()

    return {"status": "saved"}

@router.get("/excalidraw/{document_id}")
async def get_excalidraw_data(
    document_id: str,
    db: Session = Depends(get_db)
):
    """获取画布数据"""
    excalidraw = db.query(ExcalidrawData).filter(
        ExcalidrawData.document_id == document_id
    ).first()

    if not excalidraw:
        raise HTTPException(404, "Not found")

    return {
        "scene_data": excalidraw.scene_data,
        "updated_at": excalidraw.updated_at
    }
```

### Phase 3: 前端组件开发

#### 3.1 创建核心编辑器组件

```tsx
// frontend/src/components/ExcalidrawEditor.tsx

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { debounce } from 'lodash';
import { updateExcalidrawData } from '../api/excalidraw';
import { LoadingSkeleton } from './LoadingSkeleton';

interface ExcalidrawEditorProps {
  documentId: string;
  initialData?: string;
  readOnly?: boolean;
  onExport?: (format: 'png' | 'svg' | 'json') => void;
}

export const ExcalidrawEditor: React.FC<ExcalidrawEditorProps> = ({
  documentId,
  initialData,
  readOnly = false,
  onExport,
}) => {
  const excalidrawRef = useRef<ExcalidrawImperativeAPI>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // 初始化场景数据
  useEffect(() => {
    if (initialData && excalidrawRef.current) {
      try {
        const sceneData = JSON.parse(initialData);
        excalidrawRef.current.updateScene(sceneData);
      } catch (e) {
        console.error('Failed to parse excalidraw data:', e);
      }
      setIsLoading(false);
    }
  }, [initialData]);

  // 防抖保存
  const saveData = useCallback(
    debounce(async (elements: any[], appState: any) => {
      setSaveStatus('saving');
      try {
        const sceneData = JSON.stringify({
          elements,
          appState: {
            viewBackgroundColor: appState.viewBackgroundColor,
            gridSize: appState.gridSize,
          },
        });
        await updateExcalidrawData(documentId, sceneData);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (error) {
        console.error('Save failed:', error);
        setSaveStatus('error');
      }
    }, 1000),
    [documentId]
  );

  // 监听变化
  const handleChange = useCallback(
    (elements: any[], appState: any) => {
      if (!isLoading) {
        saveData(elements, appState);
      }
    },
    [isLoading, saveData]
  );

  // 导出功能
  const handleExport = async (format: 'png' | 'svg' | 'json') => {
    if (!excalidrawRef.current) return;

    const api = excalidrawRef.current;

    switch (format) {
      case 'png':
        const pngBlob = await api.exportToBlob({
          mimeType: 'image/png',
          quality: 1,
        });
        downloadBlob(pngBlob, `drawing-${Date.now()}.png`);
        break;

      case 'svg':
        const svg = await api.exportToSvg();
        const svgBlob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
        downloadBlob(svgBlob, `drawing-${Date.now()}.svg`);
        break;

      case 'json':
        const elements = api.getSceneElements();
        const appState = api.getAppState();
        const jsonData = JSON.stringify({ elements, appState }, null, 2);
        const jsonBlob = new Blob([jsonData], { type: 'application/json' });
        downloadBlob(jsonBlob, `drawing-${Date.now()}.excalidraw`);
        break;
    }

    onExport?.(format);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="excalidraw-editor-wrapper">
      {/* 保存状态指示器 */}
      <div className={`save-status ${saveStatus}`}>
        {saveStatus === 'saving' && '保存中...'}
        {saveStatus === 'saved' && '已保存'}
        {saveStatus === 'error' && '保存失败'}
      </div>

      {/* Excalidraw 编辑器 */}
      <div style={{ height: '100%', width: '100%' }}>
        <Excalidraw
          ref={excalidrawRef}
          initialData={initialData ? JSON.parse(initialData) : undefined}
          onChange={handleChange}
          viewModeEnabled={readOnly}
          theme="light"
          langCode="zh-CN"
          renderTopRightUI={(isMobile) => (
            <div className="excalidraw-custom-toolbar">
              <button onClick={() => handleExport('png')}>导出 PNG</button>
              <button onClick={() => handleExport('svg')}>导出 SVG</button>
            </div>
          )}
        >
          <MainMenu>
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.ItemCustom>
              <button
                className="excalidraw-menu-item"
                onClick={() => handleExport('json')}
              >
                导出为 .excalidraw 文件
              </button>
            </MainMenu.ItemCustom>
          </MainMenu>
        </Excalidraw>
      </div>
    </div>
  );
};
```

#### 3.2 API 封装

```tsx
// frontend/src/api/excalidraw.ts

import api from './client';

export interface ExcalidrawData {
  scene_data: string;
  updated_at: string;
}

export const getExcalidrawData = async (documentId: string): Promise<ExcalidrawData> => {
  const response = await api.get<ExcalidrawData>(`/excalidraw/${documentId}`);
  return response.data;
};

export const createExcalidrawDocument = async (title: string, parentId?: string) => {
  // 1. 创建 document
  const doc = await api.post('/documents/', {
    title,
    type: 'excalidraw',
    parent_id: parentId || null,
    sort_order: Date.now(),
  });

  // 2. 创建画布数据
  await api.post('/excalidraw/', {
    document_id: doc.data.id,
    scene_data: '{"elements":[]}',
  });

  return doc.data;
};

export const updateExcalidrawData = async (documentId: string, sceneData: string) => {
  const response = await api.put(`/excalidraw/${documentId}`, {
    scene_data: sceneData,
  });
  return response.data;
};

export const exportExcalidrawToImage = async (
  documentId: string,
  format: 'png' | 'svg'
): Promise<Blob> => {
  const response = await api.get(`/excalidraw/${documentId}/export`, {
    params: { format },
    responseType: 'blob',
  });
  return response.data;
};
```

### Phase 4: 集成到现有系统

#### 4.1 侧边栏集成

```tsx
// frontend/src/components/Sidebar.tsx

import { Plus, FileText, Folder, PenTool } from 'lucide-react';
import { createExcalidrawDocument } from '../api/excalidraw';

// 在"新建"菜单中添加选项
const CreateMenu = () => {
  const handleCreate = async (type: string) => {
    switch (type) {
      case 'document':
        await createDocument('无标题文档');
        break;
      case 'folder':
        await createFolder('新文件夹');
        break;
      case 'excalidraw':
        await createExcalidrawDocument('无标题画布');
        break;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuItem onClick={() => handleCreate('document')}>
        <FileText size={16} />
        <span>新建文档</span>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => handleCreate('folder')}>
        <Folder size={16} />
        <span>新建文件夹</span>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => handleCreate('excalidraw')}>
        <PenTool size={16} />
        <span>新建画布</span>
      </DropdownMenuItem>
    </DropdownMenu>
  );
};
```

#### 4.2 文档类型识别

```tsx
// frontend/src/components/DocumentIcon.tsx

import { FileText, Folder, PenTool, Image } from 'lucide-react';

export const DocumentIcon: React.FC<{ type: string; icon?: string }> = ({
  type,
  icon,
}) => {
  switch (type) {
    case 'folder':
      return <Folder size={16} />;
    case 'excalidraw':
      return <PenTool size={16} />;
    case 'document':
    default:
      return icon ? <span>{icon}</span> : <FileText size={16} />;
  }
};
```

#### 4.3 主内容区域路由

```tsx
// frontend/src/components/MainArea.tsx

import { ExcalidrawEditor } from './ExcalidrawEditor';

export const MainArea: React.FC = () => {
  const { currentDocument } = useDocumentContext();

  if (!currentDocument) {
    return <EmptyState />;
  }

  // 根据文档类型渲染不同组件
  switch (currentDocument.type) {
    case 'excalidraw':
      return (
        <ExcalidrawEditor
          documentId={currentDocument.id}
          initialData={currentDocument.excalidraw_data}
        />
      );

    case 'document':
    default:
      return <DocumentEditor document={currentDocument} />;
  }
};
```

---

## 🔧 关键技术要点

### 1. 数据持久化策略

```typescript
// 自动保存（防抖 1 秒）
const debouncedSave = debounce(async (elements, appState) => {
  const data = JSON.stringify({
    elements,
    appState: {
      // 只保存必要的 appState
      viewBackgroundColor: appState.viewBackgroundColor,
      gridSize: appState.gridSize,
      // 不保存 UI 状态（如缩放、滚动位置）
    },
  });
  await updateExcalidrawData(documentId, data);
}, 1000);

// 离线支持（可选）
const useOfflineSync = (documentId: string) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingChanges, setPendingChanges] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      if (pendingChanges) {
        updateExcalidrawData(documentId, pendingChanges);
        setPendingChanges(null);
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [documentId, pendingChanges]);

  return { isOnline, setPendingChanges };
};
```

### 2. 性能优化

```typescript
// 1. 延迟加载 Excalidraw
const ExcalidrawEditor = lazy(() => import('./ExcalidrawEditor'));

// 2. 缩略图生成
const generateThumbnail = async (api: ExcalidrawImperativeAPI) => {
  const blob = await api.exportToBlob({
    mimeType: 'image/png',
    quality: 0.5,
  });
  return blobToBase64(blob);
};

// 3. 大文档优化 - 分页加载
const useExcalidrawData = (documentId: string) => {
  const [data, setData] = useState(null);

  useEffect(() => {
    // 先加载元数据
    getExcalidrawMetadata(documentId).then((meta) => {
      setData({ ...meta, elements: [] });
    });

    // 再加载完整数据
    getExcalidrawData(documentId).then((fullData) => {
      setData(fullData);
    });
  }, [documentId]);

  return data;
};
```

### 3. 导出功能

```typescript
// 支持多种导出格式
const useExport = (api: ExcalidrawImperativeAPI | null) => {
  const exportToPNG = async (scale = 2) => {
    if (!api) return;
    return api.exportToBlob({
      mimeType: 'image/png',
      quality: 1,
      scale,
    });
  };

  const exportToSVG = async () => {
    if (!api) return;
    return api.exportToSvg();
  };

  const exportToJSON = async () => {
    if (!api) return;
    const elements = api.getSceneElements();
    const appState = api.getAppState();
    return JSON.stringify({ elements, appState }, null, 2);
  };

  const exportToPDF = async () => {
    if (!api) return;
    const svg = await api.exportToSvg();
    // 使用 jsPDF 生成 PDF
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [svg.width, svg.height],
    });
    pdf.svg(svg).then(() => pdf.save('drawing.pdf'));
  };

  return { exportToPNG, exportToSVG, exportToJSON, exportToPDF };
};
```

---

## ⚠️ 潜在挑战与解决方案

### 1. 性能问题

**问题**: Excalidraw 可能导致页面卡顿
**解决方案**:
- 使用 `React.lazy` 延迟加载
- 启用虚拟化（只渲染可见区域）
- 限制同时打开的画布数量

```typescript
const ExcalidrawEditor = lazy(() => import('./ExcalidrawEditor'));

<Suspense fallback={<Loading />}>
  <ExcalidrawEditor />
</Suspense>
```

### 2. 数据同步冲突

**问题**: 多端编辑导致数据冲突
**解决方案**:
- 实现乐观锁（版本号）
- 使用 WebSocket 实时同步
- 提供冲突解决对话框

```typescript
const useConflictResolution = (documentId: string) => {
  const [conflict, setConflict] = useState(null);

  const handleSave = async (data: string) => {
    try {
      await updateExcalidrawData(documentId, data, { expectedVersion: currentVersion });
    } catch (error) {
      if (error.status === 409) {
        setConflict(error.data);
      }
    }
  };

  return { conflict, resolveConflict, handleSave };
};
```

### 3. 存储空间

**问题**: 画布数据可能很大（>10MB）
**解决方案**:
- 压缩 JSON 数据（gzip）
- 增量保存（只保存变化的部分）
- 定期清理历史版本

```typescript
// 增量保存
const useIncrementalSave = (documentId: string) => {
  const lastSavedRef = useRef<string>(null);

  const saveIncremental = async (elements: any[]) => {
    const currentSerialized = JSON.stringify(elements);
    const diff = computeDiff(lastSavedRef.current, currentSerialized);

    if (diff.length > 0) {
      await updateExcalidrawDiff(documentId, diff);
      lastSavedRef.current = currentSerialized;
    }
  };

  return saveIncremental;
};
```

### 4. 移动端适配

**问题**: Excalidraw 在移动端体验不佳
**解决方案**:
- 启用移动端优化模式
- 添加触控手势支持
- 简化工具栏

```typescript
<Excalidraw
  UIOptions={{
    tools: {
      image: false,  // 移动端禁用图片上传
    },
  }}
  renderTopRightUI={(isMobile) =>
    isMobile ? <MobileToolbar /> : <DesktopToolbar />
  }
/>
```

---

## 📅 实施路线图

### Phase 1: MVP (2 周) ✅
- [x] 安装 Excalidraw 依赖
- [x] 创建基础编辑器组件
- [x] 实现数据保存/加载 API
- [x] 添加到侧边栏菜单

### Phase 2: 核心功能 (1 周) ✅
- [x] 实现自动保存
- [x] 添加导出功能（PNG、SVG、JSON）
- [x] 生成缩略图
- [x] 文档类型图标

### Phase 3: 优化 (1 周) ✅
- [x] 性能优化（延迟加载、虚拟化）
- [x] 移动端适配
- [x] 暗黑模式支持
- [x] 快捷键集成

### Phase 4: 高级功能 (2 周) 🔄
- [ ] 离线支持
- [ ] 实时协作（WebSocket）
- [ ] 版本历史
- [ ] 冲突解决

---

## 💡 最佳实践建议

### 1. 代码组织
- 将 Excalidraw 相关代码放在独立目录
- 使用 TypeScript 严格类型
- 编写单元测试和集成测试

### 2. 用户体验
- 提供清晰的文档类型标识
- 实现无缝的切换体验
- 添加加载状态和错误处理

### 3. 数据安全
- 定期备份画布数据
- 实现版本控制
- 添加数据校验

### 4. 监控与日志
- 记录用户操作日志
- 监控性能指标
- 收集错误报告

---

## 🎯 成功指标

- ✅ 用户可以创建 Excalidraw 类型的文档
- ✅ 画布数据正确保存和加载
- ✅ 导出功能正常工作
- ✅ 移动端可用
- ✅ 页面加载时间 < 3 秒
- ✅ 自动保存延迟 < 1 秒
- ✅ 无数据丢失

---

## 📚 参考资源

- **Excalidraw 官方文档**: https://docs.excalidraw.com
- **npm 包**: https://www.npmjs.com/package/@excalidraw/excalidraw
- **GitHub**: https://github.com/excalidraw/excalidraw
- **API 参考**: https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api

---

**总结**: 推荐采用 **方案一（作为新文档类型）**，这样可以：
1. 保持现有架构清晰
2. 独立管理画布数据
3. 易于扩展和维护
4. 用户体验一致

预计总工期：**6 周**（包含测试和优化）
