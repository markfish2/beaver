# Beaver（MiniFlowy）🦫

Beaver 是一个自托管的个人知识库，支持大纲笔记、Markdown 普通笔记、随想、日记、待办、思维导图和画布，并提供桌面端、移动端和 PWA 使用体验。

## 功能特性

- 大纲笔记：层级组织、折叠、拖拽和节点编辑
- 普通笔记：Markdown、代码块、表格、图片、链接和划线
- 随想、日记、待办、全文搜索与公开分享
- Excalidraw 画布和思维导图
- 深色模式、离线缓存及多端适配
- Chrome 浏览器插件，快速保存网页内容

## 项目结构

```text
backend/          FastAPI 后端、SQLite 数据库和附件存储
frontend/         React + TypeScript + Vite 前端
excalidraw/       嵌入式画布编辑器
chrome-extension/ 浏览器插件
deploy/           预打包部署文件
```

## 快速开始

### Docker 部署

需要安装 Docker 和 Docker Compose：

```bash
docker compose up -d --build
```

启动后访问 <http://127.0.0.1:8080>。

### 本地开发

开发环境使用 Docker 启动后端，前端使用 Vite 热更新：

```bash
docker compose -f docker-compose.dev.yml up -d
cd frontend
npm install
npm run dev
```

前端访问地址仍为 <http://127.0.0.1:8080>。常用检查命令：

```bash
npm run lint
npx tsc --noEmit
npm test
```

## 数据与贡献

用户数据保存在 `backend/data/`，升级或迁移前请先备份数据库。功能开发主要修改 `backend/` 或 `frontend/`，不要直接修改 `deploy/` 中的预打包文件。

## License

MIT License
