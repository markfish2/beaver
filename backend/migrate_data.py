import sqlite3
import uuid
import os
from datetime import datetime
from app.database import Base, engine, get_db
from app.models import User, Document, Node, Attachment
from sqlalchemy.orm import Session

# 旧数据库路径
OLD_DB_PATH = 'data/appback.db'
# 新数据库路径
NEW_DB_PATH = 'data/app.db'

# 确保新数据库不存在，或者先删除
if os.path.exists(NEW_DB_PATH):
    os.remove(NEW_DB_PATH)

# 创建新数据库结构
Base.metadata.create_all(bind=engine)

# 连接旧数据库
old_conn = sqlite3.connect(OLD_DB_PATH)
old_cursor = old_conn.cursor()

# 连接新数据库
new_db = next(get_db())

try:
    # 迁移用户数据
    print("迁移用户数据...")
    old_cursor.execute("SELECT id, username, password_hash, theme, font_family, font_size FROM users")
    users = old_cursor.fetchall()
    
    for user_data in users:
        old_id, username, password_hash, theme, font_family, font_size = user_data
        new_user = User(
            id=uuid.UUID(old_id),
            username=username,
            password_hash=password_hash,
            theme=theme,
            font_family=font_family,
            font_size=font_size
        )
        new_db.add(new_user)
    
    new_db.commit()
    print(f"成功迁移 {len(users)} 个用户")
    
    # 迁移文档数据
    print("迁移文档数据...")
    old_cursor.execute("SELECT id, title, type, parent_id, sort_order, is_starred FROM documents")
    documents = old_cursor.fetchall()
    
    # 创建旧ID到新ID的映射
    id_map = {}
    
    for doc_data in documents:
        old_id, title, type, parent_id, sort_order, is_starred = doc_data
        
        # 处理parent_id
        new_parent_id = None
        if parent_id:
            new_parent_id = id_map.get(parent_id)
        
        new_doc = Document(
            id=uuid.UUID(old_id),
            title=title,
            type=type,
            parent_id=new_parent_id,
            sort_order=sort_order,
            is_starred=is_starred,
            icon=None  # 新字段，默认值
        )
        
        id_map[old_id] = new_doc.id
        new_db.add(new_doc)
    
    new_db.commit()
    print(f"成功迁移 {len(documents)} 个文档")
    
    # 迁移节点数据
    print("迁移节点数据...")
    old_cursor.execute("SELECT id, document_id, parent_node_id, content, note, is_completed, is_collapsed, sort_order, heading, is_bold, is_italic, color, highlight, is_todo, content_type, file_path, file_name FROM nodes")
    nodes = old_cursor.fetchall()
    
    # 创建节点旧ID到新ID的映射
    node_id_map = {}
    
    for node_data in nodes:
        old_id, document_id, parent_node_id, content, note, is_completed, is_collapsed, sort_order, heading, is_bold, is_italic, color, highlight, is_todo, content_type, file_path, file_name = node_data
        
        # 处理document_id
        new_document_id = id_map.get(document_id)
        if not new_document_id:
            continue
        
        # 处理parent_node_id
        new_parent_node_id = None
        if parent_node_id:
            new_parent_node_id = node_id_map.get(parent_node_id)
        
        new_node = Node(
            id=uuid.UUID(old_id),
            document_id=new_document_id,
            parent_node_id=new_parent_node_id,
            content=content,
            note=note,
            is_completed=is_completed,
            is_collapsed=is_collapsed,
            sort_order=sort_order,
            heading=heading,
            is_bold=is_bold,
            is_italic=is_italic,
            color=color,
            highlight=highlight,
            is_todo=is_todo,
            content_type=content_type,
            file_path=file_path,
            file_name=file_name
        )
        
        node_id_map[old_id] = new_node.id
        new_db.add(new_node)
    
    new_db.commit()
    print(f"成功迁移 {len(nodes)} 个节点")
    
    # 迁移附件数据
    print("迁移附件数据...")
    old_cursor.execute("SELECT id, file_path, file_name, file_type, file_size, created_at FROM attachments")
    attachments = old_cursor.fetchall()
    
    for att_data in attachments:
        old_id, file_path, file_name, file_type, file_size, created_at = att_data
        # 转换created_at为datetime对象
        try:
            created_at_obj = datetime.strptime(created_at, '%Y-%m-%d %H:%M:%S.%f')
        except ValueError:
            try:
                created_at_obj = datetime.strptime(created_at, '%Y-%m-%d %H:%M:%S')
            except ValueError:
                created_at_obj = datetime.utcnow()
        
        new_att = Attachment(
            id=uuid.UUID(old_id),
            file_path=file_path,
            file_name=file_name,
            file_type=file_type,
            file_size=file_size,
            created_at=created_at_obj
        )
        new_db.add(new_att)
    
    new_db.commit()
    print(f"成功迁移 {len(attachments)} 个附件")
    
    print("数据迁移完成！")
    
    # 创建迁移标记文件
    with open('data/.migrated', 'w') as f:
        f.write('Migration completed successfully')
        
except Exception as e:
    print(f"迁移过程中出现错误: {e}")
    new_db.rollback()
finally:
    old_conn.close()
    new_db.close()