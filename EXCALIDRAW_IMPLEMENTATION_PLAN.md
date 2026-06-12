# Excalidraw 完整实现方案

## 📋 需求确认

### 核心需求
1. ✅ **侧边栏访问**: Excalidraw 文件在侧边栏"文件"tab 中显示
2. ✅ **新建方式**: 新建文章菜单添加"画布"类型
3. ✅ **收藏功能**: 支持收藏/取消收藏 Excalidraw 文档
4. ✅ **文章操作**: 与大纲笔记、普通笔记操作一致
   - 重命名
   - 复制
   - 移动
   - 删除
   - 分享

### 当前实现分析

#### 侧边栏结构
```typescript
// 现有的 tab 类型
type ViewMode = 'diary' | 'all' | 'starred';

// 现有的文档类型
type DocumentType = 'document' | 'folder' | 'note';

// 新增文档类型
type DocumentType = 'document' | 'folder' | 'note' | 'excalidraw';  // 🆕
```

#### 新建文章菜单（当前位置：830-852 行）
```typescript
// 现有菜单项
1. 新建大纲笔记 (type: 'document')
2. 新建普通笔记 (type: 'note')
3. 新建文件夹 (type: 'folder')

// 🆕 新增菜单项
4. 新建画布 (type: 'excalidraw')
```

#### 收藏功能（现有实现）
```typescript
// 现有的收藏逻辑
const filteredDocuments = useMemo(() => {
  let filtered = documents;

  if (viewMode === 'starred') {
    filtered = filtered.filter(d => d.is_starred);
  }

  return filtered;
}, [documents, viewMode]);

// ✅ 无需修改：现有的收藏逻辑已经支持所有文档类型
```

---

## 🎯 实现计划

### Phase 1: 后端准备（数据库 + API）

#### 1.1 数据库迁移

**文件**: `backend/migration_add_excalidraw.sql`

```sql
-- 创建 excalidraw_data 表
CREATE TABLE IF NOT EXISTS excalidraw_data (
    id TEXT PRIMARY KEY,
    document_id TEXT UNIQUE NOT NULL,
    scene_data TEXT,
    thumbnail TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_excalidraw_data_document_id
ON excalidraw_data(document_id);
```

#### 1.2 后端模型

**文件**: `backend/app/models.py`

```python
# 在现有模型末尾添加
class ExcalidrawData(Base):
    __tablename__ = "excalidraw_data"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    document_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("documents.id", ondelete="CASCADE"),
        unique=True,
        index=True
    )
    scene_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    thumbnail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )

    # 关系
    document: Mapped["Document"] = relationship("Document")
```

#### 1.3 后端 Schema

**文件**: `backend/app/schemas.py`

```python
# 在现有 Schema 末尾添加

class ExcalidrawDataBase(BaseModel):
    document_id: UUID
    scene_data: Optional[str] = None

class ExcalidrawDataCreate(ExcalidrawDataBase):
    pass

class ExcalidrawDataUpdate(BaseModel):
    scene_data: str

class ExcalidrawData(ExcalidrawDataBase):
    id: UUID
    thumbnail: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
```

#### 1.4 后端 CRUD

**文件**: `backend/app/crud.py`

```python
# 在现有 CRUD 函数末尾添加

# ==================== Excalidraw Data ====================

def get_excalidraw_data(db: Session, document_id: UUID) -> Optional[ExcalidrawData]:
    """获取画布数据"""
    return db.query(ExcalidrawData).filter(
        ExcalidrawData.document_id == document_id
    ).first()

def create_excalidraw_data(
    db: Session,
    data: ExcalidrawDataCreate
) -> ExcalidrawData:
    """创建画布数据"""
    excalidraw = ExcalidrawData(
        id=str(uuid4()),
        document_id=str(data.document_id),
        scene_data=data.scene_data or '{"elements":[]}'
    )
    db.add(excalidraw)
    db.commit()
    db.refresh(excalidraw)
    return excalidraw

def update_excalidraw_data(
    db: Session,
    document_id: UUID,
    data: ExcalidrawDataUpdate
) -> Optional[ExcalidrawData]:
    """更新画布数据"""
    excalidraw = db.query(ExcalidrawData).filter(
        ExcalidrawData.document_id == document_id
    ).first()

    if not excalidraw:
        return None

    excalidraw.scene_data = data.scene_data
    excalidraw.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(excalidraw)
    return excalidraw

def delete_excalidraw_data(db: Session, document_id: UUID) -> bool:
    """删除画布数据"""
    excalidraw = db.query(ExcalidrawData).filter(
        ExcalidrawData.document_id == document_id
    ).first()

    if not excalidraw:
        return False

    db.delete(excalidraw)
    db.commit()
    return True
```

#### 1.5 后端路由

**文件**: `backend/app/routers/excalidraw.py`

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from .. import crud, schemas
from ..database import get_db
from ..dependencies import get_current_user

router = APIRouter()

@router.get("/{document_id}", response_model=schemas.ExcalidrawData)
async def get_excalidraw_data(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """获取画布数据"""
    # 验证文档存在
    document = crud.get_document(db, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # 验证文档类型
    if document.type != 'excalidraw':
        raise HTTPException(status_code=400, detail="Document is not excalidraw type")

    # 获取画布数据
    excalidraw = crud.get_excalidraw_data(db, document_id)
    if not excalidraw:
        # 如果不存在，自动创建
        excalidraw = crud.create_excalidraw_data(
            db,
            schemas.ExcalidrawDataCreate(document_id=document_id)
        )

    return excalidraw

@router.post("/", response_model=schemas.ExcalidrawData)
async def create_excalidraw_data(
    data: schemas.ExcalidrawDataCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """创建画布数据"""
    # 验证文档存在
    document = crud.get_document(db, data.document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # 验证文档类型
    if document.type != 'excalidraw':
        raise HTTPException(status_code=400, detail="Document is not excalidraw type")

    # 检查是否已存在
    existing = crud.get_excalidraw_data(db, data.document_id)
    if existing:
        raise HTTPException(status_code=400, detail="Excalidraw data already exists")

    return crud.create_excalidraw_data(db, data)

@router.put("/{document_id}", response_model=schemas.ExcalidrawData)
async def update_excalidraw_data(
    document_id: UUID,
    data: schemas.ExcalidrawDataUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """更新画布数据（自动保存）"""
    # 验证文档存在
    document = crud.get_document(db, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # 验证文档类型
    if document.type != 'excalidraw':
        raise HTTPException(status_code=400, detail="Document is not excalidraw type")

    # 更新数据
    excalidraw = crud.update_excalidraw_data(db, document_id, data)
    if not excalidraw:
        raise HTTPException(status_code=404, detail="Excalidraw data not found")

    return excalidraw

@router.delete("/{document_id}")
async def delete_excalidraw_data(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """删除画布数据"""
    # 验证文档存在
    document = crud.get_document(db, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # 删除画布数据
    success = crud.delete_excalidraw_data(db, document_id)
    if not success:
        raise HTTPException(status_code=404, detail="Excalidraw data not found")

    return {"ok": True}
```

#### 1.6 注册路由

**文件**: `backend/app/main.py`

```python
# 在现有路由注册处添加
from .routers import excalidraw

app.include_router(
    excalidraw.router,
    prefix="/api/excalidraw",
    tags=["excalidraw"]
)
```

---

### Phase 2: 前端 API 封装

#### 2.1 创建 Excalidraw API 文件

**文件**: `frontend/src/api/excalidraw.ts`

```typescript
import api from './client';
import { dataCache } from './cache';

export interface ExcalidrawData {
  id: string;
  document_id: string;
  scene_data: string;
  thumbnail: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 获取画布数据
 */
export const getExcalidrawData = async (documentId: string): Promise<ExcalidrawData> => {
  const cacheKey = `excalidraw:${documentId}`;
  const cached = dataCache.get<ExcalidrawData>(cacheKey);
  if (cached) return cached;

  const response = await api.get<ExcalidrawData>(`/excalidraw/${documentId}`);
  dataCache.set(cacheKey, response.data, 2 * 60 * 1000); // 2分钟缓存
  return response.data;
};

/**
 * 创建画布数据
 */
export const createExcalidrawData = async (documentId: string): Promise<ExcalidrawData> => {
  const response = await api.post<ExcalidrawData>('/excalidraw/', {
    document_id: documentId,
    scene_data: '{"elements":[]}',
  });
  dataCache.invalidate(`excalidraw:${documentId}`);
  return response.data;
};

/**
 * 更新画布数据（自动保存）
 */
export const updateExcalidrawData = async (
  documentId: string,
  sceneData: string
): Promise<ExcalidrawData> => {
  const response = await api.put<ExcalidrawData>(`/excalidraw/${documentId}`, {
    scene_data: sceneData,
  });
  dataCache.invalidate(`excalidraw:${documentId}`);
  return response.data;
};

/**
 * 删除画布数据
 */
export const deleteExcalidrawData = async (documentId: string): Promise<void> => {
  await api.delete(`/excalidraw/${documentId}`);
  dataCache.invalidate(`excalidraw:${documentId}`);
};

/**
 * 创建 excalidraw 文档（完整流程）
 */
export const createExcalidrawDocument = async (
  title: string = '无标题画布',
  parentId?: string | null
) => {
  // 1. 创建 document
  const { createDocument } = await import('./data');
  const doc = await createDocument(title, 'excalidraw', parentId, Date.now());

  // 2. 创建画布数据
  await createExcalidrawData(doc.id);

  return doc;
};
```

#### 2.2 更新现有 API

**文件**: `frontend/src/api/data.ts`

```typescript
// 在现有的 createDocument 函数中，无需修改
// 因为它已经支持传入 type 参数

// 在现有的 getDocuments 函数中，无需修改
// 因为它已经返回所有类型的文档
```

---

### Phase 3: 前端组件开发

#### 3.1 创建 Excalidraw 编辑器组件

**文件**: `frontend/src/components/ExcalidrawEditor.tsx`

```typescript
import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Excalidraw, MainMenu, exportToBlob, exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { debounce } from 'lodash';
import { Download, Image, FileJson, FileText } from 'lucide-react';
import { getExcalidrawData, updateExcalidrawData } from '../api/excalidraw';
import { LoadingSkeleton } from './LoadingSkeleton';
import { SaveStatusIndicator } from './SaveStatusIndicator';

// 导入 CSS
import "@excalidraw/excalidraw/index.css";

interface ExcalidrawEditorProps {
  documentId: string;
  readOnly?: boolean;
}

export const ExcalidrawEditor: React.FC<ExcalidrawEditorProps> = ({
  documentId,
  readOnly = false,
}) => {
  const excalidrawRef = useRef<ExcalidrawImperativeAPI>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showExportMenu, setShowExportMenu] = useState(false);

  // 加载初始数据
  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await getExcalidrawData(documentId);
        if (data.scene_data && excalidrawRef.current) {
          const sceneData = JSON.parse(data.scene_data);
          excalidrawRef.current.updateScene(sceneData);
        }
      } catch (error) {
        console.error('Failed to load excalidraw data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [documentId]);

  // 防抖保存
  const saveData = useMemo(
    () =>
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
      if (!isLoading && !readOnly) {
        saveData(elements, appState);
      }
    },
    [isLoading, readOnly, saveData]
  );

  // 导出功能
  const handleExport = async (format: 'png' | 'svg' | 'json') => {
    if (!excalidrawRef.current) return;

    const api = excalidrawRef.current;
    setShowExportMenu(false);

    switch (format) {
      case 'png':
        const pngBlob = await exportToBlob({
          elements: api.getSceneElements(),
          appState: api.getAppState(),
          mimeType: 'image/png',
          quality: 1,
          scale: 2,
        });
        downloadBlob(pngBlob, `canvas-${Date.now()}.png`);
        break;

      case 'svg':
        const svg = await exportToSvg({
          elements: api.getSceneElements(),
          appState: api.getAppState(),
        });
        const svgBlob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
        downloadBlob(svgBlob, `canvas-${Date.now()}.svg`);
        break;

      case 'json':
        const elements = api.getSceneElements();
        const appState = api.getAppState();
        const jsonData = JSON.stringify({ elements, appState }, null, 2);
        const jsonBlob = new Blob([jsonData], { type: 'application/json' });
        downloadBlob(jsonBlob, `canvas-${Date.now()}.excalidraw`);
        break;
    }
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
    <div className="excalidraw-editor-wrapper" style={{ height: '100%', position: 'relative' }}>
      {/* 保存状态指示器 */}
      <SaveStatusIndicator status={saveStatus} />

      {/* 导出按钮 */}
      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 100 }}>
        <button
          onClick={() => setShowExportMenu(!showExportMenu)}
          className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          <span>导出</span>
        </button>

        {showExportMenu && (
          <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
            <button
              onClick={() => handleExport('png')}
              className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
            >
              <Image className="w-4 h-4" />
              <span>导出为 PNG</span>
            </button>
            <button
              onClick={() => handleExport('svg')}
              className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              <span>导出为 SVG</span>
            </button>
            <button
              onClick={() => handleExport('json')}
              className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
            >
              <FileJson className="w-4 h-4" />
              <span>导出为 JSON</span>
            </button>
          </div>
        )}
      </div>

      {/* Excalidraw 编辑器 */}
      <Excalidraw
        ref={excalidrawRef}
        onChange={handleChange}
        viewModeEnabled={readOnly}
        theme="light"
        langCode="zh-CN"
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: true,
            export: false,
            loadScene: false,
            saveToActiveFile: false,
          },
        }}
      >
        <MainMenu>
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.Separator />
          <MainMenu.ItemCustom>
            <button
              onClick={() => handleExport('json')}
              className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              导出为 .excalidraw 文件
            </button>
          </MainMenu.ItemCustom>
        </MainMenu>
      </Excalidraw>
    </div>
  );
};
```

#### 3.2 创建保存状态指示器组件

**文件**: `frontend/src/components/SaveStatusIndicator.tsx`

```typescript
import React from 'react';
import { Check, Loader2, AlertCircle } from 'lucide-react';

interface SaveStatusIndicatorProps {
  status: 'idle' | 'saving' | 'saved' | 'error';
}

export const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = ({ status }) => {
  if (status === 'idle') return null;

  const config = {
    saving: {
      icon: <Loader2 className="w-4 h-4 animate-spin" />,
      text: '保存中...',
      className: 'text-gray-500',
    },
    saved: {
      icon: <Check className="w-4 h-4" />,
      text: '已保存',
      className: 'text-green-500',
    },
    error: {
      icon: <AlertCircle className="w-4 h-4" />,
      text: '保存失败',
      className: 'text-red-500',
    },
  };

  const { icon, text, className } = config[status];

  return (
    <div
      className={`absolute top-10 left-1/2 transform -translate-x-1/2 z-50 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm flex items-center gap-2 ${className}`}
    >
      {icon}
      <span className="text-sm">{text}</span>
    </div>
  );
};
```

---

### Phase 4: 集成到现有系统

#### 4.1 修改侧边栏 - 添加"新建画布"菜单项

**文件**: `frontend/src/components/Sidebar.tsx`

**修改位置**: 830-852 行附近

```typescript
// 在现有的"新建文件夹"按钮后添加

import { PenTool } from 'lucide-react';  // 🆕 新增导入

// 在新建菜单中添加画布选项（830-852 行）
<button
  onClick={() => {
    handleCreateExcalidraw();
    setShowNewMenu(false);
    setShowFolderPicker(false);
  }}
  className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
>
  <PenTool className="w-4 h-4" />
  <span>新建画布</span>
</button>
```

**添加创建函数**（256-280 行附近）

```typescript
// 在现有的 handleCreateNote 函数后添加

const handleCreateExcalidraw = async (parentId?: string | null) => {
  try {
    const pid = parentId !== undefined ? parentId : newMenuTarget;
    const { createExcalidrawDocument } = await import('../api/excalidraw');
    const newDoc = await createExcalidrawDocument('无标题画布', pid);
    addDocument(newDoc);
    navigate(`/d/${newDoc.id}`);
    onDocumentSelect?.();
    window.dispatchEvent(new CustomEvent('sidebarClose'));
  } catch (error) {
    console.error('Failed to create excalidraw document', error);
  }
};
```

#### 4.2 修改侧边栏 - 添加画布图标

**文件**: `frontend/src/components/Sidebar.tsx`

**修改位置**: 文档列表渲染处（约 950-1000 行）

```typescript
// 在现有的文档图标渲染处添加

import { PenTool } from 'lucide-react';

// 修改文档图标渲染逻辑
const renderDocumentIcon = (doc: Document) => {
  if (doc.type === 'folder') {
    return <FolderIcon className="w-4 h-4" />;
  } else if (doc.type === 'excalidraw') {
    return <PenTool className="w-4 h-4 text-purple-500" />;
  } else {
    return <FileIcon className="w-4 h-4" />;
  }
};
```

#### 4.3 修改侧边栏 - 右键菜单支持

**文件**: `frontend/src/components/Sidebar.tsx`

**修改位置**: 右键菜单处（约 1080-1101 行）

```typescript
// 现有的右键菜单已经支持所有文档类型
// 无需修改，收藏、重命名、复制、移动、删除功能自动支持 excalidraw 类型

// 验证：右键菜单中的操作
// ✅ 收藏/取消收藏 - 已支持
// ✅ 重命名 - 已支持
// ✅ 复制 - 已支持
// ✅ 移动 - 已支持
// ✅ 删除 - 已支持
```

#### 4.4 修改主内容区域

**文件**: `frontend/src/components/MainArea.tsx`

```typescript
// 在现有的文档类型判断处添加

import { ExcalidrawEditor } from './ExcalidrawEditor';

// 修改文档渲染逻辑
const renderDocumentContent = (document: Document) => {
  switch (document.type) {
    case 'excalidraw':
      return <ExcalidrawEditor documentId={document.id} />;

    case 'note':
      return <MarkdownNoteEditor document={document} />;

    case 'document':
    default:
      return <OutlineEditor document={document} />;
  }
};
```

#### 4.5 修改文档设置菜单

**文件**: `frontend/src/components/DocumentSettingsMenu.tsx`

```typescript
// 确保所有文档操作都支持 excalidraw 类型

// 现有的操作已经支持所有类型
// ✅ 重命名
// ✅ 复制
// ✅ 移动
// ✅ 删除
// ✅ 分享
// ✅ 导出

// 无需修改
```

---

### Phase 5: 测试验证

#### 5.1 后端测试

```bash
# 1. 执行数据库迁移
cd /home/beafish/claude/miniflowy2.1/miniflowy2.1/backend
sqlite3 data/app.db < migration_add_excalidraw.sql

# 2. 测试后端 API
# 启动后端服务
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 测试创建 excalidraw 文档
curl -X POST http://localhost:8000/api/documents/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"title": "测试画布", "type": "excalidraw", "sort_order": 1}'

# 测试创建画布数据
curl -X POST http://localhost:8000/api/excalidraw/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"document_id": "<doc_id>", "scene_data": "{\"elements\":[]}"}'

# 测试更新画布数据
curl -X PUT http://localhost:8000/api/excalidraw/<doc_id> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"scene_data": "{\"elements\":[{\"type\":\"rectangle\"}]}"}'

# 测试获取画布数据
curl http://localhost:8000/api/excalidraw/<doc_id> \
  -H "Authorization: Bearer <token>"
```

#### 5.2 前端测试

```bash
# 1. 安装依赖
cd /home/beafish/claude/miniflowy2.1/miniflowy2.1/frontend
npm install @excalidraw/excalidraw

# 2. 启动前端开发服务器
npm run dev

# 3. 测试清单
```

**测试清单**:

```markdown
### 新建功能
- [ ] 侧边栏"文件"tab 显示正常
- [ ] 点击"+"按钮显示新建菜单
- [ ] 新建菜单包含"新建画布"选项
- [ ] 点击"新建画布"创建 excalidraw 文档
- [ ] 新建的画布在侧边栏显示紫色画笔图标
- [ ] 点击画布进入 Excalidraw 编辑器

### 编辑功能
- [ ] Excalidraw 编辑器正常加载
- [ ] 可以绘制图形（矩形、圆形、箭头等）
- [ ] 自动保存功能正常（1秒防抖）
- [ ] 保存状态指示器显示正确
- [ ] 刷新页面后数据保留

### 收藏功能
- [ ] 右键画布显示菜单
- [ ] 点击"收藏"成功收藏
- [ ] 画布显示收藏星标
- [ ] 切换到"收藏"tab 显示收藏的画布
- [ ] 取消收藏功能正常

### 文档操作
- [ ] 右键画布显示完整菜单
- [ ] 重命名功能正常
- [ ] 复制功能正常
- [ ] 移动功能正常
- [ ] 删除功能正常（确认对话框）
- [ ] 分享功能正常

### 导出功能
- [ ] 右上角显示导出按钮
- [ ] 点击导出按钮显示菜单
- [ ] 导出为 PNG 正常
- [ ] 导出为 SVG 正常
- [ ] 导出为 JSON 正常
- [ ] Excalidraw 内置导出功能正常

### 兼容性
- [ ] 现有大纲笔记功能正常
- [ ] 现有普通笔记功能正常
- [ ] 现有文件夹功能正常
- [ ] 现有收藏功能正常
- [ ] 移动端显示正常
```

---

## 📦 依赖安装

### 前端依赖

```bash
cd /home/beafish/claude/miniflowy2.1/miniflowy2.1/frontend

# 安装 Excalidraw
npm install @excalidraw/excalidraw

# 安装 lodash（如果未安装）
npm install lodash
npm install -D @types/lodash
```

### 后端依赖

无需新增依赖，使用现有的 SQLAlchemy、FastAPI 等。

---

## 🚀 部署流程

### Step 1: 备份数据库

```bash
cd /home/beafish/claude/miniflowy2.1/miniflowy2.1
cp backend/data/app.db backend/data/app.db.backup.$(date +%Y%m%d_%H%M%S)
```

### Step 2: 执行数据库迁移

```bash
sqlite3 backend/data/app.db < backend/migration_add_excalidraw.sql
```

### Step 3: 重新构建 Docker 镜像

```bash
docker compose build --no-cache
```

### Step 4: 启动服务

```bash
docker compose up -d
```

### Step 5: 验证部署

```bash
# 查看容器状态
docker compose ps

# 查看日志
docker compose logs -f

# 测试 API
curl http://localhost:5173/api/health
```

---

## 📝 完整代码变更清单

### 新增文件

1. ✅ `backend/migration_add_excalidraw.sql` - 数据库迁移脚本
2. ✅ `backend/app/routers/excalidraw.py` - Excalidraw API 路由
3. ✅ `frontend/src/api/excalidraw.ts` - 前端 API 封装
4. ✅ `frontend/src/components/ExcalidrawEditor.tsx` - Excalidraw 编辑器组件
5. ✅ `frontend/src/components/SaveStatusIndicator.tsx` - 保存状态指示器

### 修改文件

1. ✅ `backend/app/models.py` - 添加 ExcalidrawData 模型
2. ✅ `backend/app/schemas.py` - 添加 ExcalidrawData Schema
3. ✅ `backend/app/crud.py` - 添加 ExcalidrawData CRUD 函数
4. ✅ `backend/app/main.py` - 注册 Excalidraw 路由
5. ✅ `frontend/src/components/Sidebar.tsx` - 添加"新建画布"菜单项和图标
6. ✅ `frontend/src/components/MainArea.tsx` - 添加 Excalidraw 页面路由
7. ✅ `frontend/package.json` - 添加 @excalidraw/excalidraw 依赖

---

## ⏱️ 预计工期

| 阶段 | 任务 | 时间 |
|------|------|------|
| Phase 1 | 后端准备（数据库 + API） | 2 天 |
| Phase 2 | 前端 API 封装 | 0.5 天 |
| Phase 3 | 前端组件开发 | 1.5 天 |
| Phase 4 | 集成到现有系统 | 1 天 |
| Phase 5 | 测试验证 | 1 天 |
| **总计** | | **6 天** |

---

## 🎯 成功指标

- ✅ 侧边栏显示 excalidraw 文档（紫色画笔图标）
- ✅ 新建菜单包含"新建画布"选项
- ✅ 支持收藏/取消收藏
- ✅ 支持所有文档操作（重命名、复制、移动、删除、分享）
- ✅ Excalidraw 编辑器正常工作
- ✅ 自动保存功能正常
- ✅ 导出功能正常
- ✅ 现有功能不受影响
- ✅ 移动端兼容

---

**总结**: 这是一个完整的实现方案，涵盖了后端、前端、测试、部署的所有环节。按照这个方案实施，可以确保 Excalidraw 完美集成到现有系统中，与大纲笔记、普通笔记保持一致的用户体验。

需要我开始编码实现吗？
