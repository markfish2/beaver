from pydantic import BaseModel, ConfigDict
from uuid import UUID
from typing import Optional, List
from datetime import datetime

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: UUID
    theme: str
    font_family: str
    font_size: str
    memo_columns: int = 1
    nickname: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    bio: Optional[str] = None
    avatar_path: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class UserSettingsUpdate(BaseModel):
    theme: Optional[str] = None
    font_family: Optional[str] = None
    font_size: Optional[str] = None
    memo_columns: Optional[int] = None

class UserProfileUpdate(BaseModel):
    nickname: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    bio: Optional[str] = None
    avatar_path: Optional[str] = None

class PasswordUpdate(BaseModel):
    old_password: str
    new_password: str

class DocumentBase(BaseModel):
    title: str
    type: str = "document"
    parent_id: Optional[UUID] = None
    sort_order: float = 0
    is_starred: bool = False
    ai_excluded: bool = False
    icon: Optional[str] = None
    diary_date: Optional[str] = None
    deleted_at: Optional[datetime] = None
    original_parent_id: Optional[str] = None

class DocumentCreate(DocumentBase):
    pass

class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    parent_id: Optional[UUID] = None
    sort_order: Optional[float] = None
    is_starred: Optional[bool] = None
    ai_excluded: Optional[bool] = None
    icon: Optional[str] = None
    diary_date: Optional[str] = None
    expected_version: Optional[int] = None

class Document(DocumentBase):
    id: UUID
    version: int = 1
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class NodeBase(BaseModel):
    document_id: UUID
    parent_node_id: Optional[UUID] = None
    content: str = ""
    note: str = ""
    is_completed: bool = False
    is_in_progress: bool = False
    is_collapsed: bool = False
    sort_order: float
    heading: Optional[str] = None
    is_bold: bool = False
    is_italic: bool = False
    color: Optional[str] = None
    highlight: Optional[str] = None
    is_todo: bool = False
    content_type: str = "text"
    file_path: Optional[str] = None
    file_name: Optional[str] = None

class NodeCreate(NodeBase):
    id: Optional[UUID] = None
    pass

class NodeUpdate(BaseModel):
    content: Optional[str] = None
    note: Optional[str] = None
    is_completed: Optional[bool] = None
    is_in_progress: Optional[bool] = None
    is_collapsed: Optional[bool] = None
    heading: Optional[str] = None
    is_bold: Optional[bool] = None
    is_italic: Optional[bool] = None
    color: Optional[str] = None
    highlight: Optional[str] = None
    is_todo: Optional[bool] = None
    content_type: Optional[str] = None
    file_path: Optional[str] = None
    file_name: Optional[str] = None
    expected_version: Optional[int] = None

class NodeMove(BaseModel):
    parent_node_id: Optional[UUID] = None
    sort_order: float

class NodeBatchUpdateItem(BaseModel):
    id: str
    parent_node_id: Optional[str] = None
    sort_order: float

class NodeBatchPropertyUpdateItem(BaseModel):
    id: str
    content: Optional[str] = None
    note: Optional[str] = None
    is_completed: Optional[bool] = None
    is_in_progress: Optional[bool] = None
    is_collapsed: Optional[bool] = None
    heading: Optional[str] = None
    is_bold: Optional[bool] = None
    is_italic: Optional[bool] = None
    color: Optional[str] = None
    highlight: Optional[str] = None
    is_todo: Optional[bool] = None

class NodeBatchCreateItem(BaseModel):
    id: Optional[str] = None
    document_id: str
    parent_node_id: Optional[str] = None
    content: str = ""
    note: str = ""
    is_completed: bool = False
    is_in_progress: bool = False
    is_collapsed: bool = False
    sort_order: float
    is_todo: bool = False
    content_type: str = "text"
    file_path: Optional[str] = None
    file_name: Optional[str] = None
    heading: Optional[str] = None
    is_bold: bool = False
    is_italic: bool = False

class Node(NodeBase):
    id: UUID
    version: int = 1

    model_config = ConfigDict(from_attributes=True)

# Attachment schemas
class AttachmentBase(BaseModel):
    file_name: str
    file_type: str
    file_size: int

class AttachmentCreate(AttachmentBase):
    file_path: str

class Attachment(AttachmentBase):
    id: UUID
    file_path: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class UploadResponse(BaseModel):
    file_path: str
    file_name: str
    file_type: str
    file_size: int
    thumbnail_path: str | None = None

class BatchSaveOperation(BaseModel):
    id: str
    type: str
    data: dict

class BatchSaveRequest(BaseModel):
    operations: List[BatchSaveOperation]

# Share schemas
class ShareResponse(BaseModel):
    id: UUID
    document_id: UUID
    token: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class SharedDocumentResponse(BaseModel):
    title: str
    nodes: List[Node]

# Diary schemas
class DiaryMonthItem(BaseModel):
    year: int
    months: List[int]

class DiaryMonthsResponse(BaseModel):
    items: List[DiaryMonthItem]

class DiaryDocumentResponse(BaseModel):
    document: Document
    nodes: List[Node]
    is_new: bool

class DiaryDayNodeResponse(BaseModel):
    node_id: str
    is_new: bool
    child_node: Optional[Node] = None

class DiaryTaskWithParent(Node):
    parent_content: Optional[str] = None
    diary_date: Optional[str] = None

class DiarySummaryResponse(BaseModel):
    tasks: List[DiaryTaskWithParent]
    tags: List[str]

# Memo schemas
class MemoBase(BaseModel):
    content: str = ""
    is_pinned: bool = False
    is_archived: bool = False
    is_public: bool = False
    color: Optional[str] = None
    ai_excluded: bool = False

class MemoCreate(MemoBase):
    pass

class MemoUpdate(BaseModel):
    content: Optional[str] = None
    is_pinned: Optional[bool] = None
    is_archived: Optional[bool] = None
    is_public: Optional[bool] = None
    color: Optional[str] = None
    ai_excluded: Optional[bool] = None
    ai_excluded: Optional[bool] = None

class Memo(MemoBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class MemoListResponse(BaseModel):
    memos: List[Memo]
    total: int
    page: int
    page_size: int

class MemoHeatmapResponse(BaseModel):
    year: int
    month: int
    days: dict

class MemoTagsResponse(BaseModel):
    tags: List[str]

# Todo schemas
class TodoBase(BaseModel):
    content: str = ""
    is_completed: bool = False
    sort_order: float = 0.0

class TodoCreate(TodoBase):
    pass

class TodoUpdate(BaseModel):
    content: Optional[str] = None
    is_completed: Optional[bool] = None
    sort_order: Optional[float] = None

class Todo(TodoBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class TodoListResponse(BaseModel):
    todos: List[Todo]
    total: int

# Search schemas
class SearchResultItem(BaseModel):
    result_type: str  # "document" | "diary" | "memo" | "document_title"
    entity_id: UUID
    title: str
    snippet: str
    node_id: Optional[UUID] = None
    diary_date: Optional[str] = None
    parent_id: Optional[UUID] = None
    created_at: Optional[datetime] = None

class SearchResponse(BaseModel):
    query: str
    results: List[SearchResultItem]
    total: int

class LinkPreview(BaseModel):
    url: str
    title: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    favicon: Optional[str] = None
    site_name: Optional[str] = None

# ==================== Excalidraw Schemas ====================

class ExcalidrawDataBase(BaseModel):
    document_id: UUID
    scene_data: Optional[str] = None

class ExcalidrawDataCreate(ExcalidrawDataBase):
    pass

class ExcalidrawDataUpdate(BaseModel):
    scene_data: str
    version: Optional[int] = None  # 乐观锁版本号

class ExcalidrawData(ExcalidrawDataBase):
    id: UUID
    thumbnail: Optional[str] = None
    version: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# ── Habit ──

class HabitBase(BaseModel):
    name: str
    icon: str = "📌"
    sort_order: float = 0.0

class HabitCreate(HabitBase):
    pass

class HabitUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    sort_order: Optional[float] = None

class HabitWithRecords(BaseModel):
    id: UUID
    name: str
    icon: str
    sort_order: float
    is_archived: bool
    created_at: datetime
    week_records: List[str]  # 本周已打卡的日期列表 ["2026-06-02", ...]

    model_config = ConfigDict(from_attributes=True)

class HabitToggleRequest(BaseModel):
    date: str  # YYYY-MM-DD

# ── API Token ──

class ApiTokenCreate(BaseModel):
    name: str = "API Token"

class ApiTokenInfo(BaseModel):
    id: UUID
    name: str
    created_at: datetime
    last_used_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class ApiTokenCreated(ApiTokenInfo):
    token: str

# ── AI Config ──

class AIConfigBase(BaseModel):
    name: str
    provider: str = "custom"       # deepseek/openai/gemini/qwen/mimo/custom
    api_url: str
    api_key: str
    model: str
    purpose: str = "chat"          # chat/embedding
    is_default: bool = False

class AIConfigCreate(AIConfigBase):
    pass

class AIConfigUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    api_url: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
    is_default: Optional[bool] = None

class AIConfig(AIConfigBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# ── Voice Record ──

class VoiceRecordBase(BaseModel):
    memo_id: Optional[UUID] = None
    document_id: Optional[UUID] = None
    audio_path: str
    duration_seconds: Optional[int] = None
    transcribed_text: Optional[str] = None
    ai_messages: Optional[str] = None
    ai_config_id: Optional[UUID] = None

class VoiceRecordCreate(VoiceRecordBase):
    pass

class VoiceRecord(VoiceRecordBase):
    id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class TranscribeResponse(BaseModel):
    text: str
    voice_record_id: UUID

class AIChatRequest(BaseModel):
    messages: list  # [{"role": "user", "content": "..."}]
    context: str = ""
    ai_config_id: Optional[UUID] = None
    conversation_id: Optional[UUID] = None
    mode: str = "data"  # "data" = 搜索本地笔记, "web" = 网络问答
