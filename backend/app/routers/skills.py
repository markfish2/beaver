"""AI Skill 管理：从 data/skill/ 目录加载 markdown 格式的 skill 文件"""

import os
import re
from fastapi import APIRouter
from pathlib import Path

router = APIRouter()

SKILL_DIR = Path(__file__).parent.parent.parent / "data" / "skill"


def _parse_skill_file(filepath: Path) -> dict | None:
    """解析 skill markdown 文件

    格式：
    ---
    name: 润色文字
    icon: ✨
    description: 优化文字表达
    ---
    prompt 内容...
    """
    try:
        content = filepath.read_text(encoding="utf-8").strip()
        # 解析 frontmatter
        match = re.match(r'^---\s*\n(.*?)\n---\s*\n?(.*)', content, re.DOTALL)
        if not match:
            # 没有 frontmatter，用文件名作为名称
            return {
                "id": filepath.stem,
                "name": filepath.stem,
                "icon": "📝",
                "description": "",
                "prompt": content,
            }

        frontmatter = match.group(1)
        prompt = match.group(2).strip()

        # 解析 frontmatter 字段
        meta = {}
        for line in frontmatter.split("\n"):
            if ":" in line:
                key, value = line.split(":", 1)
                meta[key.strip()] = value.strip()

        return {
            "id": filepath.stem,
            "name": meta.get("name", filepath.stem),
            "icon": meta.get("icon", "📝"),
            "description": meta.get("description", ""),
            "prompt": prompt,
        }
    except Exception:
        return None


@router.get("/")
async def list_skills():
    """获取所有 skill 列表"""
    # 确保 skill 目录存在
    SKILL_DIR.mkdir(parents=True, exist_ok=True)
    skills = []
    for f in sorted(SKILL_DIR.glob("*.md")):
        skill = _parse_skill_file(f)
        if skill:
            skills.append(skill)
    return skills


@router.get("/{skill_id}")
async def get_skill(skill_id: str):
    """获取单个 skill 详情"""
    filepath = SKILL_DIR / f"{skill_id}.md"
    if not filepath.exists():
        return {"error": "Skill not found"}
    skill = _parse_skill_file(filepath)
    return skill or {"error": "Failed to parse skill"}
