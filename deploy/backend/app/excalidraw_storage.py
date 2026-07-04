"""
Excalidraw 画布数据文件系统存储层。

场景数据（elements + appState）存储为 JSON 文件。
图片数据存储为独立二进制文件，不走 JSON。
使用 write-then-rename 保证原子写入。
"""

import os
import json
import re
import base64
import shutil
import tempfile
import logging
from typing import Optional

logger = logging.getLogger(__name__)

EXCALIDRAW_DIR = "./data/excalidraw"


def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def _atomic_write_json(filepath: str, data: dict) -> None:
    """原子写入 JSON 文件（write-fsync-rename）。"""
    _ensure_dir(os.path.dirname(filepath))
    fd, tmp_path = tempfile.mkstemp(dir=os.path.dirname(filepath), suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, filepath)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def _atomic_write_bytes(filepath: str, data: bytes) -> None:
    """原子写入二进制文件（write-fsync-rename）。"""
    _ensure_dir(os.path.dirname(filepath))
    fd, tmp_path = tempfile.mkstemp(dir=os.path.dirname(filepath), suffix='.tmp')
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, filepath)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def _read_json(filepath: str) -> Optional[dict]:
    """读取 JSON 文件，不存在返回 None。"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return None
    except (json.JSONDecodeError, IOError) as e:
        logger.warning(f"读取 JSON 失败: {filepath}, {e}")
        return None


def _parse_data_url(data_url: str) -> tuple[bytes, str]:
    """解析 data:image/png;base64,... 格式，返回 (二进制数据, 扩展名)。"""
    match = re.match(r'data:image/(\w+[\w+-]*);base64,(.*)', data_url, re.DOTALL)
    if not match:
        raise ValueError("Invalid data URL format")
    ext = match.group(1).lower()
    if ext == 'jpeg':
        ext = 'jpg'
    elif ext == 'svg+xml':
        ext = 'svg'
    raw = base64.b64decode(match.group(2), validate=False)
    return raw, f'.{ext}'


def _ext_to_mime(ext: str) -> str:
    """扩展名转 MIME 类型。"""
    ext = ext.lstrip('.').lower()
    if ext == 'svg':
        return 'image/svg+xml'
    if ext == 'jpg':
        return 'image/jpeg'
    return f'image/{ext}'


def _validate_file_id(file_id: str) -> None:
    """校验 file_id 不包含路径分隔符，防止路径穿越。"""
    if not file_id or '/' in file_id or '\\' in file_id or '..' in file_id:
        raise ValueError(f"Invalid file_id: {file_id}")


# ── 场景数据 ──

def get_scene_path(document_id: str) -> str:
    return os.path.join(EXCALIDRAW_DIR, f"{document_id}.json")


def read_scene(document_id: str) -> Optional[dict]:
    """读取场景数据（elements + appState + _version）。"""
    return _read_json(get_scene_path(document_id))


def get_version(document_id: str) -> int:
    """获取当前场景版本号。不存在返回 0。"""
    scene = read_scene(document_id)
    if scene is None:
        return 0
    return scene.get('_version', 0)


def write_scene(document_id: str, data: dict, expected_version: Optional[int] = None) -> tuple[bool, int]:
    """
    原子写入场景数据，带版本控制。

    Args:
        data: 场景数据（不含 _version，会自动设置）。不会被修改。
        expected_version: 期望的当前版本号。如果提供且不匹配，拒绝写入。

    Returns:
        (success, current_version)
    """
    scene_path = get_scene_path(document_id)
    current = _read_json(scene_path)
    current_version = current.get('_version', 0) if current else 0

    if expected_version is not None and expected_version != current_version:
        return False, current_version

    new_version = current_version + 1
    # 复制 data 避免修改调用方的 dict
    write_data = {**data, '_version': new_version}
    _atomic_write_json(scene_path, write_data)
    return True, new_version


# ── 图片文件（二进制存储）──

def get_files_dir(document_id: str) -> str:
    """获取图片目录路径。"""
    return os.path.join(EXCALIDRAW_DIR, str(document_id))


def get_file_path(document_id: str, file_id: str, ext: str = '.png') -> str:
    """获取单个图片文件路径。"""
    return os.path.join(get_files_dir(document_id), f"{file_id}{ext}")


def get_files_meta_path(document_id: str) -> str:
    """获取图片元数据文件路径。"""
    return os.path.join(EXCALIDRAW_DIR, f"{document_id}_files_meta.json")


def read_files_meta(document_id: str) -> dict:
    """
    读取图片元数据。
    返回 {file_id: {mimeType, ext}} 格式。
    """
    meta = _read_json(get_files_meta_path(document_id))
    if meta:
        return meta
    # 兼容：从目录扫描
    files_dir = get_files_dir(document_id)
    if not os.path.isdir(files_dir):
        return {}
    result = {}
    for name in os.listdir(files_dir):
        filepath = os.path.join(files_dir, name)
        if os.path.isfile(filepath) and not name.startswith('.') and not name.endswith('.tmp'):
            file_id = os.path.splitext(name)[0]
            ext = os.path.splitext(name)[1]
            result[file_id] = {'mimeType': _ext_to_mime(ext), 'ext': ext}
    return result


def write_image_file(document_id: str, file_id: str, data_url: str) -> dict:
    """
    将 dataUrl 解析为二进制并写入文件。

    Returns:
        {fileId, mimeType, ext} — 文件元数据
    """
    _validate_file_id(file_id)
    raw, ext = _parse_data_url(data_url)
    filepath = get_file_path(document_id, file_id, ext)
    _atomic_write_bytes(filepath, raw)
    return {'fileId': file_id, 'mimeType': _ext_to_mime(ext), 'ext': ext}


def write_files_meta(document_id: str, meta: dict) -> None:
    """原子写入图片元数据。"""
    _atomic_write_json(get_files_meta_path(document_id), meta)


def read_image_file(document_id: str, file_id: str) -> Optional[tuple[bytes, str]]:
    """
    读取单个图片文件。

    Returns:
        (二进制数据, mimeType) 或 None
    """
    _validate_file_id(file_id)
    meta = read_files_meta(document_id)
    if file_id not in meta:
        return None
    ext = meta[file_id].get('ext', '.png')
    filepath = get_file_path(document_id, file_id, ext)
    if not os.path.exists(filepath):
        return None
    try:
        with open(filepath, 'rb') as f:
            raw = f.read()
        mime = meta[file_id].get('mimeType', 'image/png')
        return raw, mime
    except IOError as e:
        logger.warning(f"读取图片失败: {document_id}/{file_id}, {e}")
        return None


def delete_image_file(document_id: str, file_id: str) -> None:
    """删除单个图片文件。"""
    _validate_file_id(file_id)
    files_dir = get_files_dir(document_id)
    if not os.path.isdir(files_dir):
        return
    for name in os.listdir(files_dir):
        if os.path.splitext(name)[0] == file_id:
            filepath = os.path.join(files_dir, name)
            try:
                os.unlink(filepath)
            except OSError as e:
                logger.warning(f"删除图片失败: {document_id}/{file_id}, {e}")


def delete_all(document_id: str) -> None:
    """删除场景文件、图片目录和元数据文件。"""
    # 删除场景 JSON
    scene_path = get_scene_path(document_id)
    if os.path.exists(scene_path):
        try:
            os.unlink(scene_path)
        except OSError as e:
            logger.warning(f"删除场景文件失败: {document_id}, {e}")
    # 删除图片元数据
    meta_path = get_files_meta_path(document_id)
    if os.path.exists(meta_path):
        try:
            os.unlink(meta_path)
        except OSError as e:
            logger.warning(f"删除图片元数据失败: {document_id}, {e}")
    # 删除图片目录
    files_dir = get_files_dir(document_id)
    if os.path.isdir(files_dir):
        try:
            shutil.rmtree(files_dir)
        except OSError as e:
            logger.warning(f"删除图片目录失败: {document_id}, {e}")


# ── 兼容旧格式（迁移用）──

def get_files_json_path(document_id: str) -> str:
    """旧格式：files 存在独立 JSON 文件中。"""
    return os.path.join(EXCALIDRAW_DIR, f"{document_id}_files.json")


def read_files_json(document_id: str) -> Optional[dict]:
    """读取旧格式的 files JSON。"""
    return _read_json(get_files_json_path(document_id))


def migrate_files_from_json(document_id: str) -> bool:
    """将旧格式的 files JSON 迁移为二进制文件。返回是否有迁移。"""
    old_files = read_files_json(document_id)
    if not old_files:
        return False
    meta = {}
    failed = 0
    total = 0
    for file_id, file_info in old_files.items():
        if isinstance(file_info, dict):
            data_url = file_info.get('dataURL') or file_info.get('dataUrl')
            if data_url:
                total += 1
                try:
                    file_meta = write_image_file(document_id, file_id, data_url)
                    meta[file_id] = file_meta
                except Exception as e:
                    failed += 1
                    logger.warning(f"迁移图片失败: {document_id}/{file_id}, {e}")
    if meta:
        write_files_meta(document_id, meta)
    # 只有全部迁移成功才删除旧 JSON，避免部分失败时丢失数据
    if failed == 0:
        old_path = get_files_json_path(document_id)
        if os.path.exists(old_path):
            try:
                os.unlink(old_path)
            except OSError:
                pass
    else:
        logger.warning(f"画布 {document_id} 有 {failed}/{total} 张图片迁移失败，保留旧文件")
    return True
