# Beaver (MiniFlowy) 🦫

**轻量个人知识库** — 一个自托管的、支持多端 PWA 的个人知识管理系统，集大纲笔记、普通笔记、日记、随想、待办、思维导图、画布于一体。

![Beaver Logo](beaver.png)

---

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
  - [Docker 部署（推荐）](#docker-部署推荐)
  - [开发环境](#开发环境)
- [详细部署指南](#详细部署指南)
  - [服务器要求](#服务器要求)
  - [生产环境部署](#生产环境部署)
  - [HTTPS 配置](#https-配置)
  - [数据备份](#数据备份)
  - [更新升级](#更新升级)
  - [回滚](#回滚)
- [API 文档](#api-文档)
  - [认证](#认证)
  - [文档管理](#文档管理)
  - [节点管理](#节点管理)
  - [附件管理](#附件管理)
  - [分享](#分享)
  - [日记](#日记)
  - [随想笔记 (Memos)](#随想笔记-memos)
  - [待办 (Todos)](#待办-todos)
  - [搜索](#搜索)
  - [链接预览](#链接预览)
  - [画布 (Excalidraw)](#画布-excalidraw)
  - [API Token](#api-token)
  - [公开接口](#公开接口)
  - [系统](#系统)
- [数据库设计](#数据库设计)
- [PWA 配置](#pwa-配置)
- [Chrome 浏览器插件](#chrome-浏览器插件)
- [iOS 捷径](#ios-捷径)
- [前端路由](#前端路由)
- [环境变量](#环境变量)
- [架构设计](#架构设计)
- [License](#license)

---

## 功能特性

### 📝 笔记系统

| 功能 | 说明 |
|------|------|
| **大纲笔记** | 无限层级嵌套，支持折叠/展开、拖拽排序、缩进/取消缩进 |
| **普通笔记 (Markdown)** | 支持 GFM 语法、代码高亮、实时预览、HTML 粘贴自动转 Markdown |
| **画布笔记 (Excalidraw)** | 矢量绘图、流程图、思维导图式绘图（桌面端），多窗口版本冲突检测，图片二进制独立存储 |
| **思维导图** | 基于大纲结构一键生成思维导图，支持层级折叠 |
| **富文本格式** | 加粗、斜体、标题级别、颜色、高亮、待办复选框 |
| **@提及** | `@` 链接其他文档，可点击跳转 |
| **#标签** | 自动识别标签，支持标签搜索和筛选 |
| **图片/附件** | 支持拖拽上传、粘贴上传、URL 自动导入，自动生成缩略图 |
| **目录 (TOC)** | 长文档自动生成目录导航 |
| **面包屑导航** | 文件夹层级导航 |
| **版本冲突检测** | 乐观并发控制，冲突时弹出解决对话框 |
| **撤销/重做** | 命令模式实现，支持 Ctrl+Z / Ctrl+Shift+Z |

### 📅 日记

- 按月组织，日历视图
- 每天独立节点，支持任务和标签
- 月度摘要（任务统计、标签汇总）

### 💭 随想笔记 (Memos)

- 快速记录想法，支持 Markdown
- 置顶、归档、公开/私密
- 颜色标记（8 种颜色）
- 标签系统（#标签 自动识别）
- 热力图日历（GitHub 风格）
- 媒体画廊（图片/视频/附件汇总）
- 随机漫步（随机浏览历史笔记）
- 转换为正式文档
- 网页图文粘贴自动转 Markdown + 图片自动上传

### ✅ 待办

- 快速创建待办事项
- 完成状态追踪
- 截止日期解析（`!12.25` 格式）
- 排序功能

### 🔍 搜索

- 全局统一搜索（文档、日记、随想、标题）
- 实时搜索结果

### 📤 分享

- 生成公开分享链接（只读）
- 无需登录即可查看
- 公开随想笔记

### 🌐 链接预览

- 自动提取 URL 的 Open Graph 元数据
- 显示标题、描述、图片、网站图标
- SSRF 防护，1 小时缓存

### 📱 多端适配

- **响应式设计**：桌面端侧边栏布局，移动端底部 Tab 布局
- **PWA 支持**：iOS / Android / HarmonyOS / 鸿蒙
- **中国浏览器兼容**：QQ 浏览器、UC 浏览器、360 浏览器
- **离线支持**：Service Worker 缓存 + 离线操作队列 + 恢复连接自动同步

### 🔒 安全

- JWT 认证 + bcrypt 密码加密
- API 速率限制（登录 20次/分钟）
- 用户数据缓存（5 分钟 TTL）
- CORS 保护
- 文件大小限制（50MB）

### 🎨 个性化

- 亮色/暗色主题（跟随系统或手动切换）
- 可配置字体（字体族、字号）
- 笔记卡片颜色标记

---

## 技术栈

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Python | 3.11 | 运行时 |
| FastAPI | 0.111.0 | Web 框架 |
| Uvicorn | 0.29.0 | ASGI 服务器 |
| SQLAlchemy | 2.0.30 | ORM |
| SQLite | - | 数据库 |
| Pydantic | 2.7.1 | 数据验证 |
| python-jose | 3.3.0 | JWT 签发/验证 |
| passlib + bcrypt | 1.7.4 / 4.0.1 | 密码哈希 |
| Pillow | 10.4.0 | 图片处理（压缩/缩略图） |
| httpx | 0.27.0+ | 异步 HTTP 客户端（链接预览、图片下载） |
| slowapi | 0.1.9 | API 速率限制 |
| python-multipart | 0.0.9 | 文件上传 |

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.2.7 | UI 框架 |
| TypeScript | ~5.9.3 | 类型安全 |
| Vite | 7.3.1 | 构建工具 |
| Tailwind CSS | 4.2.1 | 样式框架 |
| React Router | 7.13.1 | 路由 |
| Axios | 1.13.6 | HTTP 客户端 |
| react-markdown | 10.1.0 | Markdown 渲染 |
| react-syntax-highlighter | 16.1.1 | 代码高亮 |
| simple-mind-map | 0.14.0 | 思维导图 |
| @excalidraw/excalidraw | 0.18.1 | 画布绘图 |
| turndown | 7.2.4 | HTML → Markdown 转换 |
| jspdf + html2canvas | 4.2.1 / 1.4.1 | PDF 导出 |
| lucide-react | 0.577.0 | 图标库 |
| vite-plugin-pwa | 1.2.0 | PWA 支持 |
| workbox-window | 7.4.0 | Service Worker |

### 基础设施

| 技术 | 用途 |
|------|------|
| Docker + Docker Compose | 容器化部署 |
| Nginx (Alpine) | 反向代理 + 静态资源服务 |
| Node 20 (Alpine) | 前端构建环境 |

---

## 项目结构

```
miniflowy/
├── README.md                           # 本文档
├── docker-compose.yml                  # 开发环境 Docker Compose
├── .dockerignore
│
├── backend/                            # 后端服务
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── start.sh                        # 启动脚本（数据库迁移 + 启动 uvicorn）
│   ├── migrate_from_old.sh             # 旧版数据库迁移脚本
│   └── app/
│       ├── main.py                     # FastAPI 应用入口
│       ├── database.py                 # 数据库连接配置（SQLite + WAL 模式）
│       ├── models.py                   # SQLAlchemy ORM 模型（9 张表）
│       ├── schemas.py                  # Pydantic 请求/响应模型
│       ├── crud.py                     # CRUD 操作（~38KB）
│       ├── auth.py                     # JWT 认证（bcrypt + python-jose）
│       ├── dependencies.py             # FastAPI 依赖注入（带缓存的用户查询）
│       ├── excalidraw_storage.py       # 画布文件存储层（原子写入、版本控制、图片二进制存储）
│       ├── limiter.py                  # 速率限制配置
│       └── routers/                    # API 路由
│           ├── auth.py                 # 登录 / 注册 / 初始化
│           ├── users.py                # 用户设置
│           ├── documents.py            # 文档 CRUD + 复制
│           ├── nodes.py                # 节点 CRUD + 批量操作
│           ├── attachments.py          # 文件上传 / 下载 / URL 导入
│           ├── shares.py               # 分享链接管理
│           ├── diary.py                # 日记系统
│           ├── memos.py                # 随想笔记
│           ├── search.py               # 全局搜索
│           ├── public_memos.py         # 公开随想（无需认证）
│           ├── link_preview.py         # 链接预览（OG 元数据）
│           ├── excalidraw.py           # 画布数据
│           ├── todos.py                # 待办事项
│           └── api_tokens.py           # API Token 管理
│
├── frontend/                           # 前端应用
│   ├── Dockerfile                      # 两阶段构建（Node 构建 + Nginx 服务）
│   ├── nginx.conf                      # 前端 Nginx 配置（SPA 路由、缓存策略）
│   ├── package.json
│   ├── vite.config.ts                  # Vite 配置（PWA、代码分割、代理）
│   ├── index.html                      # 入口 HTML（PWA meta 标签）
│   ├── public/
│   │   ├── beaver.svg                  # SVG Favicon
│   │   ├── beaver.png                  # PNG Logo
│   │   ├── favicon.ico                 # ICO Favicon
│   │   ├── apple-touch-icon.png        # iOS 桌面图标
│   │   ├── maskable-icon.png           # Android 自适应图标
│   │   ├── shortcut.html               # iOS 捷径下载页
│   │   ├── Beaver.shortcut             # iOS 捷径文件
│   │   └── icons/                      # PWA 多尺寸图标（16x16 ~ 512x512）
│   └── src/
│       ├── main.tsx                    # 应用入口（暗色模式检测）
│       ├── App.tsx                     # 路由定义 + Provider 组合
│       ├── api/                        # API 层
│       │   ├── client.ts               # Axios 实例（重试、认证拦截器）
│       │   ├── auth.ts                 # 认证 API
│       │   ├── data.ts                 # 数据 API（~680 行）
│       │   ├── cache.ts                # 数据缓存层
│       │   └── excalidraw.ts           # 画布 API
│       ├── components/                 # 组件
│       │   ├── MainArea.tsx            # 核心编辑器（~122KB，最大的文件）
│       │   ├── Sidebar.tsx             # 桌面端侧边栏（~71KB）
│       │   ├── NodeItem.tsx            # 节点渲染（~46KB）
│       │   ├── MemoCard.tsx            # 随想卡片（~58KB）
│       │   ├── MemoHome.tsx            # 随想首页
│       │   ├── MemoInput.tsx           # 随想输入框
│       │   ├── MarkdownNoteEditor.tsx  # Markdown 笔记编辑器
│       │   ├── MindMapView.tsx         # 思维导图视图
│       │   ├── MindMapModal.tsx        # 思维导图弹窗
│       │   ├── DiaryCalendar.tsx       # 日记日历
│       │   ├── ExcalidrawEditor.tsx    # 画布编辑器
│       │   ├── FontSettings.tsx        # 字体设置
│       │   ├── Breadcrumbs.tsx         # 面包屑导航
│       │   ├── ConflictResolver.tsx    # 版本冲突解决
│       │   ├── SaveStatusIndicator.tsx # 保存状态指示器
│       │   ├── RecoveryDialog.tsx      # 数据恢复对话框
│       │   ├── ShareDialog.tsx         # 分享对话框
│       │   ├── TableOfContents.tsx     # 文档目录
│       │   ├── ImageViewer.tsx         # 图片查看器
│       │   ├── LinkPreviewCard.tsx     # 链接预览卡片
│       │   ├── TokenDialog.tsx         # API Token 管理
│       │   ├── ReloadPrompt.tsx        # PWA 更新提示
│       │   ├── MemoWanderer.tsx        # 随机漫步
│       │   ├── MemoMediaGallery.tsx    # 媒体画廊
│       │   ├── MemoHeatmapCalendar.tsx # 热力图日历
│       │   └── mobile/                 # 移动端专属组件
│       │       ├── MobileLayout.tsx     # 移动端布局（底部 Tab）
│       │       ├── MobileTopBar.tsx     # 顶部导航栏
│       │       ├── MobileBottomTabBar.tsx # 底部 Tab 栏
│       │       ├── MobileDiaryView.tsx  # 移动端日记
│       │       ├── MobileTodos.tsx      # 移动端待办
│       │       ├── FileTreeView.tsx     # 移动端文件树
│       │       ├── StarredView.tsx      # 收藏视图
│       │       └── NewMenuPopup.tsx     # 新建菜单
│       ├── pages/
│       │   ├── LoginPage.tsx           # 登录页
│       │   ├── SetupPage.tsx           # 首次初始化页
│       │   ├── SearchResultsPage.tsx   # 搜索结果页
│       │   └── SharePage.tsx           # 公开分享页
│       ├── hooks/
│       │   ├── useHistory.ts           # 撤销/重做
│       │   ├── useKeyboardScroll.ts    # 键盘滚动
│       │   ├── useRetryFailedPreviews.ts # 链接预览重试
│       │   ├── useSaveManager.ts       # 保存管理
│       │   └── useResizableTextarea.ts # textarea 拖拽调整高度
│       ├── context/
│       │   ├── AuthContext.tsx          # 认证上下文
│       │   ├── DocumentContext.tsx      # 文档列表上下文
│       │   ├── DiaryContext.tsx         # 日记上下文
│       │   ├── SearchContext.tsx        # 搜索上下文
│       │   └── MobileToolbarContext.tsx # 移动端工具栏上下文
│       ├── commands/
│       │   ├── types.ts                # 命令模式类型定义
│       │   └── implementations.ts      # 命令实现（撤销/重做）
│       └── utils/
│           ├── saveStateManager.ts     # 离线队列 + 保存状态机
│           ├── offlineQueue.ts         # 离线操作包装器
│           ├── pwaState.ts             # PWA 状态持久化（localStorage + IndexedDB）
│           ├── conflictResolver.ts     # 版本冲突解析
│           ├── markdown.ts             # Markdown 解析（大纲 → 树）
│           ├── markdownPreprocess.ts   # Markdown 预处理
│           ├── htmlToMarkdown.ts       # HTML → Markdown（Turndown）
│           ├── listContinuation.ts     # 列表自动续行
│           ├── convertMemo.ts          # 随想 → 文档转换
│           ├── convertNode.ts          # 节点 → Markdown 转换
│           ├── todoDueDate.ts          # 截止日期解析
│           └── toast.ts                # Toast 提示
│
├── nginx/
│   ├── nginx.conf                      # 生产环境 Nginx 配置
│   └── ssl/                            # SSL 证书目录
│
├── deploy/                             # 预打包部署包
│   ├── docker-compose.yml              # 部署用 Docker Compose（端口 8080）
│   ├── package.sh                      # 打包脚本
│   ├── backend/                        # 打包后的后端
│   ├── frontend/                       # 打包后的前端
│   ├── data/                           # 数据目录（数据库 + 上传文件）
│   └── nginx/
│       └── nginx.conf
│
├── chrome-extension/                   # Chrome 浏览器插件
│   ├── manifest.json                   # Manifest V3
│   ├── background.js                   # 后台脚本（右键菜单 + API 调用）
│   ├── popup.html / popup.js / popup.css
│   └── icons/                          # 插件图标
│
└── docs/                               # 文档
    ├── PRD_文件夹功能.md
    └── 技术架构_文件夹功能.md
```

---

## 快速开始

### Docker 部署（推荐）

#### 1. 克隆项目

```bash
git clone <repository-url> miniflowy
cd miniflowy
```

#### 2. 启动服务

```bash
docker compose up -d --build
```

首次构建需要几分钟下载镜像和安装依赖。

#### 3. 访问应用

打开浏览器访问 `http://your-server-ip:8080`

首次访问会跳转到初始化页面，创建管理员账号。

#### 4. 验证服务状态

```bash
# 检查容器状态
docker ps

# 检查后端健康状态
curl http://localhost:8080/api/health
```

### 开发环境

#### 后端

```bash
cd backend

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate  # Linux/macOS
# venv\Scripts\activate   # Windows

# 安装依赖
pip install -r requirements.txt

# 启动开发服务器
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

后端 API 文档：`http://localhost:8000/docs`（Swagger UI）

#### 前端

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器（自动代理 /api 到后端）
npm run dev
```

前端开发服务器：`http://localhost:8080`

#### 开发环境

本地开发不在 Docker 中运行前端。Docker 只启动后端，前端由宿主机 Vite 提供热更新：

```bash
docker compose -f docker-compose.dev.yml up -d
cd frontend
npm run dev
```

---

## 详细部署指南

### 服务器要求

| 项目 | 最低配置 | 推荐配置 |
|------|---------|---------|
| CPU | 1 核 | 2 核 |
| 内存 | 1 GB | 2 GB+ |
| 磁盘 | 10 GB | 20 GB+ |
| 操作系统 | Ubuntu 20.04 / CentOS 8 / Debian 11 | Ubuntu 22.04 |
| Docker | 20.10+ | 最新稳定版 |
| Docker Compose | 2.0+ | 最新稳定版 |

### 生产环境部署

#### 方式一：使用 deploy 目录（推荐）

```bash
# 1. 打包部署文件
cd miniflowy
bash deploy/package.sh

# 2. 上传 deploy.tar.gz 到服务器
scp deploy.tar.gz user@server:/opt/

# 3. 在服务器上解压并启动
ssh user@server
cd /opt
tar xzf deploy.tar.gz
cd deploy
docker compose up -d --build
```

默认端口 `8080`，通过服务器 Nginx 反向代理到 80/443。

#### 方式二：直接部署

```bash
# 1. 上传整个项目到服务器
rsync -avz ./miniflowy/ user@server:/opt/miniflowy/

# 2. 在服务器上构建并启动
ssh user@server
cd /opt/miniflowy
docker compose build --no-cache
docker compose up -d
```

默认端口 `8080`。

### HTTPS 配置

编辑 `nginx/nginx.conf`，取消注释 HTTPS 配置段：

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /etc/nginx/ssl/your-cert.pem;
    ssl_certificate_key /etc/nginx/ssl/your-key.pem;

    # ... 其余配置与 HTTP 相同
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}
```

将 SSL 证书放入 `nginx/ssl/` 目录，然后重启 Nginx：

```bash
docker compose restart nginx
```

### 数据备份

#### 手动备份

```bash
# 备份数据库和上传文件
tar czf backup-$(date +%Y%m%d).tar.gz backend/data/
```

#### 自动备份（Cron）

```bash
# 添加定时任务（每天凌晨 3 点备份，保留 7 天）
crontab -e
0 3 * * * cd /opt/miniflowy && tar czf /backups/miniflowy-$(date +\%Y\%m\%d).tar.gz backend/data/ && find /backups -name "miniflowy-*.tar.gz" -mtime +7 -delete
```

### 更新升级

```bash
# 1. 备份数据
tar czf backup-$(date +%Y%m%d).tar.gz backend/data/

# 2. 拉取最新代码
git pull origin main

# 3. 重新构建并重启
docker compose build --no-cache
docker compose up -d
```

### 回滚

```bash
# 1. 停止服务
docker compose down

# 2. 恢复数据库备份
tar xzf backup-YYYYMMDD.tar.gz -C ./

# 3. 切换到旧版本代码
git checkout <previous-commit>

# 4. 重新构建并启动
docker compose build --no-cache
docker compose up -d
```

---

## API 文档

所有 API 以 `/api` 为前缀。认证接口需要在请求头中携带 JWT Token：

```
Authorization: Bearer <token>
```

### 认证

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/auth/token` | 登录（获取 JWT） | ❌ |
| POST | `/api/auth/setup` | 首次初始化（创建管理员） | ❌ |
| GET | `/api/auth/setup/status` | 检查是否需要初始化 | ❌ |

**登录请求体：**
```json
{
  "username": "admin",
  "password": "your-password"
}
```

**登录响应：**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer"
}
```

### 用户

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/users/me` | 获取当前用户信息 |
| PUT | `/api/users/settings` | 更新用户设置（主题、字体、memo_columns） |
| PUT | `/api/users/password` | 修改密码 |

### 文档管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/documents/` | 获取所有文档（支持 `?search=` 搜索） |
| GET | `/api/documents/{id}` | 获取单个文档 |
| POST | `/api/documents/` | 创建文档 |
| POST | `/api/documents/{id}/copy` | 复制文档 |
| GET | `/api/documents/{id}/nodes` | 获取文档的所有节点 |
| PUT | `/api/documents/{id}` | 更新文档（支持版本冲突检测） |
| DELETE | `/api/documents/{id}` | 删除文档 |

**创建文档请求体：**
```json
{
  "title": "新文章",
  "type": "document",       // document | folder | excalidraw
  "parent_id": null,        // 父文件夹 ID，null 为根目录
  "sort_order": 1699000000  // 排序值
}
```

### 节点管理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/nodes/` | 创建节点 |
| PUT | `/api/nodes/{id}` | 更新节点 |
| PUT | `/api/nodes/{id}/move` | 移动节点（重新父级 + 排序） |
| DELETE | `/api/nodes/{id}` | 删除节点 |
| PUT | `/api/nodes/batch/move` | 批量移动 |
| POST | `/api/nodes/batch/delete` | 批量删除 |
| POST | `/api/nodes/batch/create` | 批量创建 |
| POST | `/api/nodes/batch/update` | 批量更新（结构） |
| POST | `/api/nodes/batch/properties` | 批量更新属性 |
| POST | `/api/nodes/batch/save` | 批量保存（离线同步/Beacon） |

### 附件管理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/attachments/upload` | 上传文件（最大 50MB，图片自动生成缩略图） |
| POST | `/api/attachments/upload-from-url` | 从 URL 下载并上传（绕过 CORS） |
| GET | `/api/attachments/download/{filename}` | 下载文件 |
| DELETE | `/api/attachments/{id}` | 删除附件 |

**upload-from-url 请求体：**
```json
{
  "url": "https://example.com/image.png"
}
```

### 分享

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/shares/{document_id}` | 创建分享链接 |
| GET | `/api/shares/{document_id}` | 获取文档的分享信息 |
| DELETE | `/api/shares/{token}` | 删除分享 |
| GET | `/api/public/share/{token}` | 查看分享内容（公开，无需认证） |

### 日记

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/diary/months` | 获取所有日记月份 |
| GET | `/api/diary/{year}/{month}` | 获取月度日记（文档 + 节点） |
| POST | `/api/diary/{year}/{month}/days/{day}` | 获取或创建某天的节点 |
| GET | `/api/diary/{year}/{month}/days` | 获取有日记的日期列表 |
| GET | `/api/diary/summary` | 获取日记摘要（任务 + 标签） |

### 随想笔记 (Memos)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/memos/` | 创建随想 |
| GET | `/api/memos/` | 列表（分页，支持 `?archived=` `?public=` `?tag=` `?search=`） |
| GET | `/api/memos/heatmap/{year}/{month}` | 热力图数据 |
| GET | `/api/memos/tags` | 所有标签 |
| GET | `/api/memos/{id}` | 获取单条 |
| PUT | `/api/memos/{id}` | 更新 |
| DELETE | `/api/memos/{id}` | 删除 |

### 待办 (Todos)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/todos/` | 创建待办 |
| GET | `/api/todos/` | 列表（`?completed=false` 仅未完成） |
| PUT | `/api/todos/{id}` | 更新 |
| DELETE | `/api/todos/{id}` | 删除 |

### 搜索

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/search/?q=keyword` | 全局搜索（文档、日记、随想、标题） |

### 链接预览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/link-preview/?url=https://...` | 获取链接预览（OG 元数据，1 小时缓存） |

### 画布 (Excalidraw)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/excalidraw/{document_id}` | 获取画布数据（含版本号） |
| POST | `/api/excalidraw/` | 创建画布数据 |
| PUT | `/api/excalidraw/{document_id}` | 更新画布（自动保存，支持版本控制） |
| DELETE | `/api/excalidraw/{document_id}` | 删除画布 |
| GET | `/api/excalidraw/{document_id}/files` | 获取画布图片元数据 |
| GET | `/api/excalidraw/{document_id}/files/{file_id}` | 获取单个图片文件（二进制） |

**版本控制**：PUT 请求支持 `version` 参数（乐观锁），版本不匹配返回 409 Conflict。

### API Token

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/tokens/` | 创建 Token |
| GET | `/api/tokens/` | 列出所有 Token |
| DELETE | `/api/tokens/{id}` | 删除 Token |

**创建 Token 请求体：**
```json
{
  "name": "iOS 捷径"
}
```

### 公开接口（无需认证）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/public/memos` | 公开随想列表 |
| GET | `/api/public/memos/{id}` | 单条公开随想 |
| GET | `/api/public/share/{token}` | 分享文档内容 |

### 系统

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |

---

## 数据库设计

SQLite 数据库，使用 WAL 模式优化并发性能。

### 表结构

#### users（用户）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| username | VARCHAR | 用户名（唯一） |
| password_hash | VARCHAR | bcrypt 哈希密码 |
| theme | VARCHAR | 主题（light/dark） |
| font_family | VARCHAR | 字体族 |
| font_size | INTEGER | 字号 |
| memo_columns | INTEGER | Memo 列数 |

#### documents（文档）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| title | VARCHAR | 标题 |
| type | VARCHAR | 类型（document/folder/excalidraw） |
| parent_id | UUID (FK) | 父文件夹（自引用） |
| sort_order | FLOAT | 排序值 |
| is_starred | BOOLEAN | 是否收藏 |
| icon | VARCHAR | 自定义图标 |
| diary_date | DATE | 日记日期 |
| version | INTEGER | 版本号（乐观锁） |

#### nodes（节点）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| document_id | UUID (FK) | 所属文档 |
| parent_node_id | UUID (FK) | 父节点（自引用，大纲结构） |
| content | TEXT | 内容 |
| note | TEXT | 备注 |
| is_completed | BOOLEAN | 是否完成 |
| is_in_progress | BOOLEAN | 是否进行中 |
| is_collapsed | BOOLEAN | 是否折叠 |
| sort_order | FLOAT | 排序值 |
| heading | INTEGER | 标题级别（0-6） |
| is_bold | BOOLEAN | 加粗 |
| is_italic | BOOLEAN | 斜体 |
| color | VARCHAR | 颜色 |
| highlight | VARCHAR | 高亮颜色 |
| is_todo | BOOLEAN | 是否待办 |
| content_type | VARCHAR | 内容类型（text/image/attachment） |
| file_path | VARCHAR | 文件路径 |
| file_name | VARCHAR | 文件名 |
| version | INTEGER | 版本号（乐观锁） |

#### memos（随想笔记）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| content | TEXT | Markdown 内容 |
| is_pinned | BOOLEAN | 是否置顶 |
| is_archived | BOOLEAN | 是否归档 |
| is_public | BOOLEAN | 是否公开 |
| color | VARCHAR | 卡片颜色 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

#### todos（待办）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| content | TEXT | 内容 |
| is_completed | BOOLEAN | 是否完成 |
| sort_order | FLOAT | 排序值 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

#### shares（分享）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| document_id | UUID (FK) | 分享的文档 |
| token | VARCHAR(32) | 分享 Token（唯一） |
| created_at | DATETIME | 创建时间 |

#### attachments（附件）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| file_path | VARCHAR | 存储路径 |
| file_name | VARCHAR | 原始文件名 |
| file_type | VARCHAR | MIME 类型 |
| file_size | INTEGER | 文件大小（字节） |
| created_at | DATETIME | 创建时间 |

#### api_tokens（API Token）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID (FK) | 所属用户 |
| name | VARCHAR | Token 名称 |
| token_hash | VARCHAR | Token 哈希 |
| created_at | DATETIME | 创建时间 |
| last_used_at | DATETIME | 最后使用时间 |

#### excalidraw_data（画布数据）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR | 主键 |
| document_id | UUID (FK, unique) | 关联文档 |
| scene_data | TEXT | 已迁移至文件系统，此字段为 NULL |
| thumbnail | TEXT | 缩略图（Base64） |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

**画布数据存储**：场景数据存储在 `data/excalidraw/{document_id}.json`，图片存储为二进制文件在 `data/excalidraw/{document_id}/` 目录。SQLite 只存元数据索引。支持乐观锁版本控制（`_version` 字段）。

### SQLite 优化配置

```sql
PRAGMA journal_mode = WAL;       -- 写前日志模式，提升并发读写
PRAGMA cache_size = -20480;      -- 20MB 缓存
PRAGMA busy_timeout = 30000;     -- 30 秒忙等待
PRAGMA synchronous = FULL;       -- 每次 commit 等待数据写入磁盘，防止数据丢失
```

---

## PWA 配置

Beaver 支持全平台 PWA 安装：

### 安装方式

| 平台 | 安装方式 |
|------|---------|
| **iOS** | Safari → 分享按钮 → 添加到主屏幕 |
| **Android** | Chrome → 菜单 → 添加到主屏幕（自动弹出安装提示） |
| **HarmonyOS** | 浏览器 → 添加到桌面 |
| **桌面 Chrome** | 地址栏右侧安装图标 |

### Service Worker 缓存策略

| 资源类型 | 策略 | 缓存时间 |
|---------|------|---------|
| HTML | StaleWhileRevalidate | 5 分钟 |
| JS / CSS | CacheFirst | 30 天 |
| 图片 | StaleWhileRevalidate | 1 天 |
| API GET | NetworkFirst | 1 天 |

### 离线支持

- Service Worker 预缓存所有静态资源
- 离线时操作自动入队，恢复连接后自动同步
- PWA 状态通过 localStorage + IndexedDB 持久化
- iOS PWA 后台终止后自动恢复视图状态

### 更新提示

- 每小时检查一次更新
- 发现新版本后显示更新提示
- 用户关闭后 24 小时内不再重复提示

---

## Chrome 浏览器插件

`chrome-extension/` 目录包含 Manifest V3 的 Chrome 插件：

### 功能

- **弹窗设置**：点击插件图标打开设置弹窗，配置服务器地址和 API Token
- **注入浮动按钮**：在当前页面注入浮动操作按钮，支持保存选中文字和提取整页正文
- **右键菜单保存**：选中文字或图片 → 右键 → 保存到 Beaver
- **一键保存网页**：保存当前页面标题和 URL
- **图片保存**：右键保存图片到随想笔记

### 安装

1. 打开 Chrome → `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `chrome-extension/` 目录

### 配置

点击插件图标，在弹窗中填写：
- **服务器地址**：`https://your-domain.com`（不要带 /api）
- **API Token**：在 Beaver 设置中生成

---

## iOS 捷径

`frontend/public/Beaver.shortcut` 是 iOS 快捷指令：

### 功能

- 一键保存 Safari 中选中的文字
- 保存当前页面 URL
- 保存图片到 Beaver

### 安装

1. 在 iPhone 上打开 `https://your-domain.com/shortcut.html`
2. 点击「下载 iOS 捷径」
3. 在弹出的快捷指令中点击「添加快捷指令」
4. 在捷径设置中填入服务器地址和 API Token

---

## 前端路由

| 路径 | 组件 | 认证 | 说明 |
|------|------|------|------|
| `/setup` | SetupPage | ❌ | 首次初始化（创建管理员） |
| `/login` | LoginPage | ❌ | 登录页 |
| `/s/:shareToken` | SharePage | ❌ | 公开分享页 |
| `/` | MainArea | ✅ | 首页（随想笔记 / 文档编辑器） |
| `/d/:documentId` | MainArea | ✅ | 文档编辑页 |
| `/search` | SearchResultsPage | ✅ | 搜索结果页 |

### 移动端布局

屏幕宽度 < 768px 时自动切换为移动端布局：

| Tab | 内容 |
|-----|------|
| 随想 | MemoHome（随想笔记列表） |
| 日记 | DiaryCalendar（日历视图） |
| 文件 | FileTreeView（文件夹/文档树） |
| 收藏 | StarredView（收藏的文档） |
| 新建 + | NewMenuPopup（大纲笔记/普通笔记/待办/文件夹/API Token） |

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATABASE_URL` | `sqlite:///./data/app.db` | 数据库连接字符串 |
| `SECRET_KEY` | *(硬编码，建议覆盖)* | JWT 签名密钥 |

**生产环境建议覆盖 SECRET_KEY：**

```bash
# docker-compose.yml
environment:
  - SECRET_KEY=your-random-secret-key-here
```

生成随机密钥：
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

---

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────┐
│                      Nginx                          │
│              (反向代理 + 静态资源)                     │
│                                                     │
│   ┌─────────────┐          ┌─────────────────┐     │
│   │   Frontend   │          │    Backend      │     │
│   │  (React SPA) │  ──API── │   (FastAPI)     │     │
│   │   Nginx:80   │          │  Uvicorn:8000   │     │
│   └─────────────┘          └────────┬────────┘     │
│                                      │              │
│                              ┌───────▼───────┐      │
│                              │    SQLite      │      │
│                              │   (WAL 模式)   │      │
│                              └───────────────┘      │
└─────────────────────────────────────────────────────┘
```

### 前端状态管理

```
AuthContext (认证状态)
    │
DocumentContext (文档列表)
    │
DiaryContext (日记数据)
    │
SearchContext (搜索状态)
    │
MobileToolbarContext (移动端工具栏)
    │
saveStateManager (保存状态机 + 离线队列)
```

### 保存状态机

```
idle → pending → saving → saved
                    ↓
                  error → retry
                    ↓
offline → queue → sync on reconnect
```

### 命令模式（撤销/重做）

```
Command {
  description: string
  execute: () => Promise<void>
  undo: () => Promise<void>
}

commands.createUpdateContentCommand(id, oldContent, newContent)
commands.createTogglePropertyCommand(id, property, newValue)
commands.createBatchTogglePropertyCommand(ids, property, newValue)
commands.createMoveNodeCommand(id, oldParent, newParent, oldSort, newSort)
commands.createDeleteNodeCommand(node)
commands.createInsertNodeCommand(node)
```

### 离线支持架构

```
用户操作 → saveStateManager.markPending()
    │
    ├── 在线 → API 调用 → markSaving → markSaved
    │
    └── 离线 → 入队 (localStorage) → 等待恢复连接
                                          │
                                   syncOfflineOperations()
                                          │
                                   逐个重放 → 成功/重试(指数退避)
```

---

## License

MIT License

---

## 致谢

- [Excalidraw](https://excalidraw.com/) — 画布绘图引擎
- [simple-mind-map](https://github.com/wanglin2/mind-map) — 思维导图组件
- [Turndown](https://github.com/mixmark-io/turndown) — HTML → Markdown 转换
- [Lucide](https://lucide.dev/) — 图标库
- [Workbox](https://developers.google.com/web/tools/workbox) — Service Worker 工具库
