from sqlalchemy import String, Float, Boolean, Text, ForeignKey, DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid
import uuid
from datetime import datetime
from typing import List, Optional
from .database import Base
from fastapi import HTTPException

class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String)
    theme: Mapped[str] = mapped_column(String, default="system")
    font_family: Mapped[str] = mapped_column(String, default="system")
    font_size: Mapped[str] = mapped_column(String, default="medium")
    memo_columns: Mapped[int] = mapped_column(Integer, default=1)
    nickname: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    avatar_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

class Document(Base):
    __tablename__ = "documents"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String, index=True)
    type: Mapped[str] = mapped_column(String, default="document") # folder or document
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("documents.id"), nullable=True, index=True)
    sort_order: Mapped[float] = mapped_column(Float, default=0.0)
    is_starred: Mapped[bool] = mapped_column(Boolean, default=False)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    ai_excluded: Mapped[bool] = mapped_column(Boolean, default=False)
    icon: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    diary_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, default=None, index=True)
    original_parent_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    children: Mapped[List["Document"]] = relationship("Document", back_populates="parent", cascade="all, delete-orphan")
    parent: Mapped[Optional["Document"]] = relationship("Document", remote_side=[id], back_populates="children")
    nodes: Mapped[List["Node"]] = relationship("Node", back_populates="document", cascade="all, delete-orphan")

class Node(Base):
    __tablename__ = "nodes"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    parent_node_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"), nullable=True, index=True)
    content: Mapped[str] = mapped_column(Text, default="")
    note: Mapped[str] = mapped_column(Text, default="")
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    is_in_progress: Mapped[bool] = mapped_column(Boolean, default=False)
    is_collapsed: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[float] = mapped_column(Float, default=0.0)
    heading: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    is_bold: Mapped[bool] = mapped_column(Boolean, default=False)
    is_italic: Mapped[bool] = mapped_column(Boolean, default=False)
    color: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    highlight: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    is_todo: Mapped[bool] = mapped_column(Boolean, default=False)
    content_type: Mapped[str] = mapped_column(String(20), default="text")
    file_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    file_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)

    # Relationships
    document: Mapped["Document"] = relationship("Document", back_populates="nodes")
    children: Mapped[List["Node"]] = relationship("Node", back_populates="parent", cascade="all, delete-orphan")
    parent: Mapped[Optional["Node"]] = relationship("Node", remote_side=[id], back_populates="children")

class Share(Base):
    __tablename__ = "shares"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    token: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    document: Mapped["Document"] = relationship("Document")

class Attachment(Base):
    __tablename__ = "attachments"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    file_path: Mapped[str] = mapped_column(String(500))
    file_name: Mapped[str] = mapped_column(String(255))
    file_type: Mapped[str] = mapped_column(String(100))
    file_size: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Memo(Base):
    __tablename__ = "memos"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    content: Mapped[str] = mapped_column(Text, default="")
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    ai_excluded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, default=None, index=True)

class Todo(Base):
    __tablename__ = "todos"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    content: Mapped[str] = mapped_column(Text, default="")
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ApiToken(Base):
    __tablename__ = "api_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    name: Mapped[str] = mapped_column(String(100), default="API Token")
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, default=None)

class Habit(Base):
    __tablename__ = "habits"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100))
    icon: Mapped[str] = mapped_column(String(10), default="📌")
    sort_order: Mapped[float] = mapped_column(Float, default=0.0)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    records: Mapped[List["HabitRecord"]] = relationship("HabitRecord", back_populates="habit", cascade="all, delete-orphan")

class HabitRecord(Base):
    __tablename__ = "habit_records"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    habit_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("habits.id", ondelete="CASCADE"), index=True)
    record_date: Mapped[str] = mapped_column(String(10))  # YYYY-MM-DD
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    habit: Mapped["Habit"] = relationship("Habit", back_populates="records")

    __table_args__ = (
        # 同一天同一习惯只有一条记录
        {'sqlite_autoincrement': False},
    )

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


class AIConfig(Base):
    """AI 模型 API 配置"""
    __tablename__ = "ai_configs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100))                    # 配置名称，如 "DeepSeek"
    provider: Mapped[str] = mapped_column(String(50))                  # deepseek/openai/gemini/qwen/mimo/custom
    api_url: Mapped[str] = mapped_column(String(500))                  # API 地址
    api_key: Mapped[str] = mapped_column(String(500))                  # API Key
    model: Mapped[str] = mapped_column(String(100))                    # 模型名称
    purpose: Mapped[str] = mapped_column(String(20), default="chat")   # chat/embedding
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)   # 是否默认配置
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class VoiceRecord(Base):
    """语音录音记录"""
    __tablename__ = "voice_records"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    memo_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("memos.id", ondelete="SET NULL"), nullable=True, index=True)
    document_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("documents.id", ondelete="SET NULL"), nullable=True, index=True)
    audio_path: Mapped[str] = mapped_column(String(500))               # 音频文件路径
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 录音时长（秒）
    transcribed_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)     # 转写原文
    ai_messages: Mapped[Optional[str]] = mapped_column(Text, nullable=True)          # AI 对话历史（JSON）
    ai_config_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("ai_configs.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # 关系
    memo: Mapped[Optional["Memo"]] = relationship("Memo")
    document: Mapped[Optional["Document"]] = relationship("Document")


class NoteEmbedding(Base):
    """笔记向量嵌入表，用于语义搜索"""
    __tablename__ = "note_embeddings"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    source_type: Mapped[str] = mapped_column(String(20))  # 'memo' | 'document' | 'node'
    source_id: Mapped[str] = mapped_column(String)        # 对应笔记 ID
    chunk_text: Mapped[str] = mapped_column(Text)         # 分块文本
    embedding: Mapped[Optional[bytes]] = mapped_column(nullable=True)  # sqlite-vec 向量
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AIConversation(Base):
    """AI 对话历史"""
    __tablename__ = "ai_conversations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    messages: Mapped[List["AIMessage"]] = relationship("AIMessage", back_populates="conversation", cascade="all, delete-orphan")


class AIMessage(Base):
    """AI 对话消息"""
    __tablename__ = "ai_messages"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ai_conversations.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20))  # 'user' | 'assistant'
    content: Mapped[str] = mapped_column(Text)
    sources: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON: [{"id":"...","title":"...","type":"memo"}]
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    conversation: Mapped["AIConversation"] = relationship("AIConversation", back_populates="messages")
