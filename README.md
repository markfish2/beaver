# Beaver 🦫

**轻量级个人知识库** — 自托管，支持多端 PWA

> 大纲笔记 · Markdown 笔记 · 日记 · 随想 · 待办 · 思维导图 · 画布 · AI 对话 · 知识图谱

![Beaver Logo](BEAVERLOGO.png)

---

## 功能

| 模块 | 特性 |
|------|------|
| **大纲笔记** | 无限层级嵌套、拖拽排序、富文本格式、@提及、#标签、撤销重做 |
| **Markdown 笔记** | GFM 语法、代码高亮、HTML 粘贴自动转 Markdown |
| **画布** | 基于 Excalidraw 的矢量绘图，图片二进制独立存储，乐观锁版本控制 |
| **思维导图** | 从大纲一键生成，支持层级折叠 |
| **日记** | 按月组织，日历视图，月度摘要 |
| **随想** | 快速记录想法，热力图日历，颜色标记，标签系统 |
| **待办** | 截止日期解析、排序、状态追踪 |
| **AI 对话** | RAG 模式，基于向量语义搜索 |
| **搜索** | 全局统一搜索 |
| **分享** | 公开链接，无需登录 |
| **Chrome 插件** | 右键保存网页/文字/图片 |
| **多端** | 响应式设计 + PWA（iOS / Android / HarmonyOS） |
| **离线** | Service Worker + 离线队列，恢复连接自动同步 |

---

## 快速开始

```bash
git clone https://github.com/markfish2/beaver.git
cd beaver

# 创建环境变量文件
cp .env.example .env
# 编辑 .env，将 SECRET_KEY 改为随机字符串
# SECRET_KEY=$(openssl rand -hex 32)

# 启动
docker compose up -d --build
```

首次访问 `http://localhost:8080` 会引导创建管理员账号。

### 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `SECRET_KEY` | ✅ | JWT 签名密钥。不设置则每次重启容器后所有登录失效。`openssl rand -hex 32` 生成 |

在项目根目录创建 `.env` 文件（参考 `.env.example`），Docker Compose 会自动读取。

### 开发环境

```bash
# 后端
cd backend && python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 前端
cd frontend && npm install && npm run dev
```

---

## 技术栈

**后端：** Python · FastAPI · SQLAlchemy · SQLite · Pydantic · sqlite-vec

**前端：** React 19 · TypeScript · Vite · Tailwind CSS 4 · React Router 7

**画布：** Excalidraw (embedded fork)

**部署：** Docker · Nginx · PWA (vite-plugin-pwa + Workbox)

---

## 项目结构

```
beaver/
├── backend/           # FastAPI 后端
├── frontend/          # React 前端
├── excalidraw/        # Excalidraw 嵌入式 fork
├── chrome-extension/  # Chrome 浏览器插件
├── nginx/             # 反向代理配置
├── deploy/            # 部署脚本
└── docker-compose.yml
```

---

## Acknowledgments

Beaver stands on the shoulders of these amazing open source projects:

- **[Excalidraw](https://excalidraw.com)** — Virtual whiteboard for sketching hand-drawn like diagrams. Used as the canvas/drawing engine.
- **[React](https://react.dev)** — A JavaScript library for building user interfaces.
- **[FastAPI](https://fastapi.tiangolo.com)** — Modern, fast web framework for building APIs with Python.
- **[Tailwind CSS](https://tailwindcss.com)** — A utility-first CSS framework.
- **[Vite](https://vite.dev)** — Next generation frontend tooling.
- **[Lucide](https://lucide.dev)** — Beautiful & consistent icons. Used for all UI icons.
- **[simple-mind-map](https://github.com/wanglin2/mind-map)** — Simple mind map implementation. Used for mind map generation.
- **[react-markdown](https://github.com/remarkjs/react-markdown)** — Markdown component for React.
- **[Turndown](https://github.com/mixmark-io/turndown)** — HTML to Markdown converter. Used for web clip and paste conversion.
- **[Workbox](https://developers.google.com/web/tools/workbox)** — JavaScript libraries for Progressive Web Apps. Used for service worker and offline support.
- **[Cytoscape.js](https://js.cytoscape.org)** — Graph theory library for visualization. Used for knowledge graph.
- **[KaTeX](https://katex.org)** — Fast math typesetting for the web. Used for LaTeX rendering.
- **[mermaid](https://mermaid.js.org)** — JavaScript based diagramming and charting tool. Used for diagram rendering.
- **[pica](https://github.com/nodeca/pica)** — High quality image resize in browser. Used for client-side image compression.
- **[Readability.js](https://github.com/mozilla/readability)** — A standalone version of the readability library. Used in Chrome extension for content extraction.
- **[jsPDF](https://github.com/parallax/jsPDF)** — Client-side JavaScript PDF generation. Used for PDF export.

---

## License

MIT
