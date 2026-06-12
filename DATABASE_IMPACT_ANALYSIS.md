# Excalidraw 整合对数据库架构的影响分析

## 📊 现有数据库架构概览

### 核心表结构

#### 1. documents 表
```sql
CREATE TABLE documents (
    id UUID PRIMARY KEY,
    title VARCHAR NOT NULL,
    type VARCHAR DEFAULT 'document',  -- ⚠️ 关键字段
    parent_id UUID REFERENCES documents(id),
    sort_order FLOAT DEFAULT 0.0,
    is_starred BOOLEAN DEFAULT FALSE,
    icon VARCHAR,
    diary_date VARCHAR(10),
    version INTEGER DEFAULT 1
);
```

**当前 type 字段使用情况**:
- `'document'` - 普通文档
- `'folder'` - 文件夹
- **枚举类型**: 纯字符串，无数据库约束

#### 2. nodes 表
```sql
CREATE TABLE nodes (
    id UUID PRIMARY KEY,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    parent_node_id UUID REFERENCES nodes(id) ON DELETE CASCADE,
    content TEXT DEFAULT '',
    content_type VARCHAR(20) DEFAULT 'text',  -- ⚠️ 关键字段
    -- ... 其他字段
    version INTEGER DEFAULT 1
);
```

**当前 content_type 字段使用情况**:
- `'text'` - 文本节点
- `'image'` - 图片节点
- `'attachment'` - 附件节点

#### 3. 其他相关表
- `users` - 用户表
- `shares` - 分享表
- `attachments` - 附件表
- `memos` - 备忘录表

---

## 🎯 整合方案的数据库变更

### 方案一：作为新文档类型（推荐）⭐

#### 变更 1: 扩展 Document.type 枚举

**变更内容**:
```python
# 现有值
type = 'document' | 'folder'

# 新增值
type = 'document' | 'folder' | 'excalidraw'
```

**风险评估**: ✅ **极低风险**

**原因**:
1. **无数据库约束**: type 字段是 VARCHAR，无 ENUM 约束
2. **向后兼容**: 现有代码只检查 `'folder'`，不检查其他值
3. **不影响现有数据**: 现有记录的 type 值不变
4. **无需迁移**: 直接插入新值即可

**代码影响分析**:

```python
# 后端：crud.py 或 routers/documents.py
# 现有代码示例（假设）
def get_documents(db: Session, search: str = None):
    query = db.query(Document)
    if search:
        query = query.filter(Document.title.contains(search))
    return query.all()

# ✅ 无需修改：type 字段用于筛选，不影响查询逻辑
```

```typescript
// 前端：components/Sidebar.tsx
// 现有代码示例（假设）
const DocumentIcon = ({ type }) => {
  switch (type) {
    case 'folder':
      return <FolderIcon />;
    case 'document':
    default:
      return <FileIcon />;
  }
};

// ✅ 需要扩展：添加 'excalidraw' 的处理
const DocumentIcon = ({ type }) => {
  switch (type) {
    case 'folder':
      return <FolderIcon />;
    case 'excalidraw':
      return <ExcalidrawIcon />;  // 🆕 新增
    case 'document':
    default:
      return <FileIcon />;
  }
};
```

---

#### 变更 2: 新增 excalidraw_data 表

**变更内容**:
```sql
CREATE TABLE excalidraw_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID UNIQUE NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    scene_data TEXT,  -- JSON 格式的画布数据
    thumbnail TEXT,   -- Base64 缩略图（可选）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_excalidraw_data_document_id ON excalidraw_data(document_id);
```

**风险评估**: ✅ **零风险**

**原因**:
1. **新增表**: 不影响任何现有表
2. **外键约束**: ON DELETE CASCADE 确保数据一致性
3. **独立存储**: 画布数据与文档数据完全隔离
4. **可选功能**: 只有 excalidraw 类型的文档才会使用此表

**优势**:
- ✅ 不修改现有表结构
- ✅ 不影响现有查询性能
- ✅ 画布数据独立管理
- ✅ 易于扩展和维护

---

## 🔍 潜在风险点详细分析

### 风险 1: 前端硬编码 type 检查 ⚠️

**风险等级**: 低

**可能位置**:
```typescript
// 可能硬编码的位置
const isDocument = (type: string) => type === 'document';
const isFolder = (type: string) => type === 'folder';

// 或者
if (item.type === 'document') {
  // 处理文档
} else if (item.type === 'folder') {
  // 处理文件夹
}
```

**解决方案**: 搜索并更新所有硬编码位置

```bash
# 搜索前端代码
grep -r "type.*document\|type.*folder" frontend/src/ --include="*.tsx" --include="*.ts"

# 搜索后端代码
grep -r "type.*document\|type.*folder" backend/ --include="*.py"
```

**修复示例**:
```typescript
// ❌ 错误：硬编码
const canHaveNodes = item.type === 'document';

// ✅ 正确：支持所有文档类型
const canHaveNodes = item.type === 'document' || item.type === 'excalidraw';
```

---

### 风险 2: 后端业务逻辑限制 ⚠️

**风险等级**: 低

**可能位置**:
```python
# 可能限制的地方
def create_node(db: Session, node_data: NodeCreate):
    # 检查文档类型
    document = db.query(Document).filter(Document.id == node_data.document_id).first()

    # ❌ 如果有这种限制
    if document.type != 'document':
        raise HTTPException(400, "Cannot add nodes to non-document types")

    # ✅ 应该改为
    if document.type == 'folder':
        raise HTTPException(400, "Cannot add nodes to folder")
```

**解决方案**: 审查所有业务逻辑

```bash
# 搜索后端限制逻辑
grep -r "type.*document" backend/app/ --include="*.py" -A 5 -B 5
```

**修复策略**:
- 文档类型检查应该排除 `'folder'`，而不是只允许 `'document'`
- 这样新增的 `'excalidraw'` 类型自动支持

---

### 风险 3: 导出/导入功能 ⚠️

**风险等级**: 中等

**可能问题**:
```python
# 导出功能可能只处理 document 类型
def export_document(db: Session, document_id: UUID):
    document = db.query(Document).filter(Document.id == document_id).first()

    if document.type != 'document':
        raise HTTPException(400, "Only documents can be exported")

    # 导出逻辑...
```

**解决方案**:
```python
# ✅ 扩展导出功能
def export_document(db: Session, document_id: UUID):
    document = db.query(Document).filter(Document.id == document_id).first()

    if document.type == 'folder':
        raise HTTPException(400, "Folders cannot be exported")

    if document.type == 'excalidraw':
        return export_excalidraw(db, document)

    # 默认文档导出逻辑
    return export_standard_document(db, document)
```

---

### 风险 4: 搜索功能 ⚠️

**风险等级**: 极低

**可能影响**:
```python
# 搜索可能需要特殊处理 excalidraw 类型
def search_documents(db: Session, query: str):
    results = db.query(Document).filter(
        Document.title.contains(query)
    ).all()

    # ✅ 现有代码应该可以正常工作
    # excalidraw 文档也会被搜索到（按标题）
    return results
```

**扩展建议**:
```python
# 未来可以扩展搜索画布内容
def search_documents(db: Session, query: str):
    # 搜索文档标题
    title_results = db.query(Document).filter(
        Document.title.contains(query)
    ).all()

    # 搜索画布内容（可选）
    excalidraw_results = db.query(ExcalidrawData).filter(
        ExcalidrawData.scene_data.contains(query)
    ).all()

    return merge_results(title_results, excalidraw_results)
```

---

### 风险 5: 版本控制 ⚠️

**风险等级**: 极低

**现状**:
```python
# Document 有 version 字段
class Document(Base):
    version: Mapped[int] = mapped_column(Integer, default=1)
```

**影响分析**:
- ✅ Excalidraw 文档也使用 Document 表，自动获得版本控制
- ✅ 版本冲突检测机制不需要修改
- ✅ 现有的乐观锁逻辑正常工作

**扩展建议**:
```python
# excalidraw_data 表也可以添加版本控制
class ExcalidrawData(Base):
    __tablename__ = "excalidraw_data"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id"))
    scene_data: Mapped[str] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, default=1)  # 🆕 添加版本控制
    updated_at: Mapped[datetime] = mapped_column(DateTime, onupdate=datetime.utcnow)
```

---

## 📋 完整的变更清单

### 数据库变更

| 变更项 | 类型 | 风险等级 | 影响范围 | 是否需要迁移 |
|--------|------|---------|---------|-------------|
| Document.type 扩展 | 修改枚举值 | ✅ 极低 | 前端+后端 | ❌ 不需要 |
| 新增 excalidraw_data 表 | 新增表 | ✅ 零 | 后端 | ✅ 需要建表 |

### 后端代码变更

| 文件 | 变更类型 | 风险等级 | 说明 |
|------|---------|---------|------|
| `models.py` | 新增模型 | ✅ 零 | 新增 ExcalidrawData 模型 |
| `schemas.py` | 新增 Schema | ✅ 零 | 新增 ExcalidrawData 相关 Schema |
| `crud.py` | 新增函数 | ✅ 零 | 新增画布数据的 CRUD 操作 |
| `routers/excalidraw.py` | 新增路由 | ✅ 零 | 新增画布相关的 API 端点 |
| `routers/documents.py` | 可能修改 | ⚠️ 低 | 如果有限制逻辑需要调整 |

### 前端代码变更

| 文件 | 变更类型 | 风险等级 | 说明 |
|------|---------|---------|------|
| `api/data.ts` | 新增接口 | ✅ 零 | 新增画布数据的 API 调用 |
| `api/excalidraw.ts` | 新增文件 | ✅ 零 | 画布相关的 API 封装 |
| `components/ExcalidrawEditor.tsx` | 新增组件 | ✅ 零 | 画布编辑器组件 |
| `components/Sidebar.tsx` | 修改 | ⚠️ 低 | 添加 excalidraw 图标和菜单 |
| `components/MainArea.tsx` | 修改 | ⚠️ 低 | 添加 excalidraw 页面路由 |
| `components/DocumentIcon.tsx` | 修改 | ⚠️ 低 | 添加 excalidraw 图标 |

---

## 🛡️ 安全保障措施

### 1. 数据库层面

```sql
-- 1. 外键约束确保数据一致性
ALTER TABLE excalidraw_data
ADD CONSTRAINT fk_excalidraw_document
FOREIGN KEY (document_id) REFERENCES documents(id)
ON DELETE CASCADE;

-- 2. 唯一约束防止重复数据
ALTER TABLE excalidraw_data
ADD CONSTRAINT uk_excalidraw_document_id
UNIQUE (document_id);

-- 3. 索引优化查询性能
CREATE INDEX idx_excalidraw_document_id
ON excalidraw_data(document_id);
```

### 2. 后端层面

```python
# 1. 输入验证
class ExcalidrawDataCreate(BaseModel):
    document_id: UUID
    scene_data: Optional[str] = None

    @validator('scene_data')
    def validate_json(cls, v):
        if v is not None:
            try:
                json.loads(v)
            except json.JSONDecodeError:
                raise ValueError('Invalid JSON format')
        return v

# 2. 权限检查
@router.post("/excalidraw/", response_model=dict)
async def create_excalidraw_data(
    data: ExcalidrawDataCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    # 验证文档存在且属于当前用户
    document = db.query(Document).filter(
        Document.id == data.document_id
    ).first()

    if not document:
        raise HTTPException(404, "Document not found")

    # 验证文档类型
    if document.type != 'excalidraw':
        raise HTTPException(400, "Invalid document type")

    # 创建画布数据
    excalidraw = ExcalidrawData(
        id=uuid4(),
        document_id=data.document_id,
        scene_data=data.scene_data or '{"elements":[]}'
    )
    db.add(excalidraw)
    db.commit()

    return {"id": excalidraw.id}

# 3. 错误处理
@router.put("/excalidraw/{document_id}", response_model=dict)
async def update_excalidraw_data(
    document_id: UUID,
    data: ExcalidrawDataUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    try:
        excalidraw = db.query(ExcalidrawData).filter(
            ExcalidrawData.document_id == document_id
        ).first()

        if not excalidraw:
            raise HTTPException(404, "Excalidraw data not found")

        # 验证 JSON 格式
        json.loads(data.scene_data)

        # 更新数据
        excalidraw.scene_data = data.scene_data
        excalidraw.updated_at = datetime.utcnow()
        db.commit()

        return {"status": "saved", "updated_at": excalidraw.updated_at}

    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON format")
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Internal server error: {str(e)}")
```

### 3. 前端层面

```typescript
// 1. 类型安全
interface ExcalidrawDocument extends Document {
  type: 'excalidraw';
  excalidraw_data?: ExcalidrawData;
}

// 2. 错误边界
const ExcalidrawEditorWrapper: React.FC<{ document: ExcalidrawDocument }> = ({
  document,
}) => {
  return (
    <ErrorBoundary
      fallback={<div>画布加载失败，请刷新页面重试</div>}
      onError={(error) => {
        console.error('Excalidraw error:', error);
        // 上报错误
        reportError(error);
      }}
    >
      <ExcalidrawEditor
        documentId={document.id}
        initialData={document.excalidraw_data?.scene_data}
      />
    </ErrorBoundary>
  );
};

// 3. 数据验证
const validateExcalidrawData = (data: string): boolean => {
  try {
    const parsed = JSON.parse(data);
    return (
      typeof parsed === 'object' &&
      Array.isArray(parsed.elements)
    );
  } catch {
    return false;
  }
};
```

---

## 🔄 迁移策略

### 方案 A: 平滑迁移（推荐）⭐

**策略**: 逐步添加功能，不影响现有系统

**步骤**:

#### Step 1: 创建新表（零影响）
```sql
-- 创建 excalidraw_data 表
CREATE TABLE IF NOT EXISTS excalidraw_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID UNIQUE NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    scene_data TEXT,
    thumbnail TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_excalidraw_data_document_id
ON excalidraw_data(document_id);
```

**验证**: 现有功能完全不受影响 ✅

#### Step 2: 后端代码更新（零影响）
- 新增 `models.py` 中的 ExcalidrawData 模型
- 新增 `routers/excalidraw.py` 路由
- 注册新路由到 `main.py`

**验证**: 现有 API 正常工作 ✅

#### Step 3: 前端代码更新（低影响）
- 新增 ExcalidrawEditor 组件
- 修改 Sidebar 添加新菜单项
- 修改 MainArea 添加新页面路由

**验证**:
- ✅ 现有文档正常显示
- ✅ 现有文件夹正常工作
- ✅ 可以创建新的 excalidraw 文档

#### Step 4: 测试验证
```bash
# 1. 运行现有测试
npm run test

# 2. 测试新功能
# - 创建 excalidraw 文档
# - 绘制图形
# - 保存和加载
# - 导出功能

# 3. 回归测试
# - 验证现有文档功能正常
# - 验证文件夹功能正常
# - 验证分享功能正常
```

---

### 方案 B: 完整迁移（可选）

**策略**: 一次性完成所有变更

**步骤**:
1. 创建 excalidraw_data 表
2. 更新后端代码
3. 更新前端代码
4. 运行完整测试
5. 部署上线

**风险**: 略高于方案 A，但更快

---

## 📊 风险评估总结

### 整体风险等级: ✅ 低风险

| 风险类型 | 等级 | 说明 |
|---------|------|------|
| 数据丢失 | ✅ 零 | 不修改现有表，只新增 |
| 性能影响 | ✅ 极低 | 新表独立，不影响现有查询 |
| 向后兼容 | ✅ 完全 | 现有功能完全不受影响 |
| 代码冲突 | ⚠️ 低 | 需要搜索并更新硬编码逻辑 |
| 迁移复杂度 | ✅ 低 | 只需要建表，无数据迁移 |

### 关键优势

1. **✅ 零停机时间**: 无需停止服务
2. **✅ 零数据丢失**: 不修改现有数据
3. **✅ 完全向后兼容**: 现有功能正常工作
4. **✅ 可回滚**: 随时可以删除新表恢复原状
5. **✅ 渐进式**: 可以分步骤实施

---

## 🧪 测试验证清单

### 单元测试

```python
# 1. 测试创建 excalidraw 文档
def test_create_excalidraw_document():
    doc = create_document(
        title="测试画布",
        type="excalidraw",
        parent_id=None,
        sort_order=1.0
    )
    assert doc.type == "excalidraw"
    assert doc.title == "测试画布"

# 2. 测试创建画布数据
def test_create_excalidraw_data():
    doc = create_excalidraw_document("测试画布")
    data = create_excalidraw_data(
        document_id=doc.id,
        scene_data='{"elements":[]}'
    )
    assert data.document_id == doc.id

# 3. 测试更新画布数据
def test_update_excalidraw_data():
    doc = create_excalidraw_document("测试画布")
    data = create_excalidraw_data(doc.id)

    updated = update_excalidraw_data(
        document_id=doc.id,
        scene_data='{"elements":[{"type":"rectangle"}]}'
    )
    assert updated.scene_data != data.scene_data

# 4. 测试删除文档时画布数据自动删除
def test_cascade_delete():
    doc = create_excalidraw_document("测试画布")
    create_excalidraw_data(doc.id)

    delete_document(doc.id)

    # 验证画布数据已删除
    data = get_excalidraw_data(doc.id)
    assert data is None

# 5. 测试现有文档功能不受影响
def test_existing_document_functionality():
    # 创建普通文档
    doc = create_document(
        title="普通文档",
        type="document",
        parent_id=None,
        sort_order=1.0
    )

    # 创建节点
    node = create_node(
        document_id=doc.id,
        content="测试节点",
        parent_node_id=None
    )

    assert node.content == "测试节点"
    assert node.document_id == doc.id
```

### 集成测试

```typescript
// 1. 测试前端创建 excalidraw 文档
describe('Excalidraw Integration', () => {
  it('should create excalidraw document', async () => {
    const doc = await createExcalidrawDocument('测试画布');
    expect(doc.type).toBe('excalidraw');
    expect(doc.title).toBe('测试画布');
  });

  it('should save and load canvas data', async () => {
    const doc = await createExcalidrawDocument('测试画布');
    const testData = '{"elements":[{"type":"rectangle","x":100,"y":100}]}';

    await updateExcalidrawData(doc.id, testData);
    const loaded = await getExcalidrawData(doc.id);

    expect(loaded.scene_data).toBe(testData);
  });

  it('should not affect existing documents', async () => {
    // 创建普通文档
    const doc = await createDocument('普通文档', 'document');
    const node = await createNode(doc.id, '测试节点');

    expect(node.content).toBe('测试节点');

    // 验证文档类型
    const loadedDoc = await getDocument(doc.id);
    expect(loadedDoc.type).toBe('document');
  });
});
```

### 回归测试

```bash
# 运行所有现有测试
npm run test

# 检查关键功能
# ✅ 创建文档
# ✅ 创建文件夹
# ✅ 创建节点
# ✅ 编辑节点
# ✅ 删除节点
# ✅ 移动节点
# ✅ 分享文档
# ✅ 搜索文档
# ✅ 导出文档
```

---

## 🚀 部署策略

### 推荐部署流程

```bash
# 1. 备份数据库
cp backend/data/app.db backend/data/app.db.backup.$(date +%Y%m%d_%H%M%S)

# 2. 创建新表（零影响）
sqlite3 backend/data/app.db < migration_add_excalidraw.sql

# 3. 部署新代码
docker compose down
docker compose build --no-cache
docker compose up -d

# 4. 验证部署
docker compose ps
docker compose logs -f

# 5. 测试新功能
# - 访问前端
# - 创建 excalidraw 文档
# - 绘制图形
# - 保存和加载
```

### 回滚方案

```bash
# 如果出现问题，快速回滚

# 1. 停止服务
docker compose down

# 2. 恢复数据库备份
cp backend/data/app.db.backup.YYYYMMDD_HHMMSS backend/data/app.db

# 3. 回滚代码（如果需要）
git checkout <previous-commit>

# 4. 重新部署
docker compose build --no-cache
docker compose up -d
```

---

## 📝 最终结论

### 核心问题回答

**问**: 整合 Excalidraw 会破坏原有数据库架构吗？

**答**: ✅ **不会破坏**

### 理由

1. **✅ 不修改现有表结构**
   - 只新增 excalidraw_data 表
   - documents 表只扩展 type 枚举值（无约束）

2. **✅ 不影响现有数据**
   - 现有文档的 type 值不变
   - 现有节点数据不变
   - 现有用户数据不变

3. **✅ 完全向后兼容**
   - 现有代码不需要修改（除了添加新功能）
   - 现有 API 正常工作
   - 现有功能正常运行

4. **✅ 可回滚**
   - 随时可以删除新表
   - 随时可以回滚代码
   - 不会造成数据丢失

5. **✅ 零停机时间**
   - 可以在线部署
   - 不影响用户体验
   - 不需要维护窗口

### 风险等级

**整体风险**: ✅ **低风险**

- 数据丢失风险: ✅ 零
- 性能影响: ✅ 极低
- 向后兼容性: ✅ 完全
- 迁移复杂度: ✅ 低

### 推荐行动

1. ✅ **可以安全实施**: 方案一（作为新文档类型）
2. ✅ **建议分步骤**: 采用平滑迁移策略
3. ✅ **建议备份**: 部署前备份数据库
4. ✅ **建议测试**: 运行完整测试套件

---

## 📚 相关文档

- **整合方案**: `EXCALIDRAW_INTEGRATION.md`
- **Web 体验分析**: `EXCALIDRAW_WEB_EXPERIENCE.md`
- **iOS 图标优化**: `CLAUDE.md` (iOS PWA 图标最佳实践)

---

**总结**: 整合 Excalidraw 是**安全**的，不会破坏现有数据库架构。采用方案一（新增表 + 扩展枚举）可以实现**零风险**的渐进式集成。
