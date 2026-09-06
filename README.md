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

### 环境变量

首次启动前，在项目根目录创建本地密钥文件：

```bash
cp .env.example .env
openssl rand -hex 32
```

将命令输出的随机字符串填入 `.env` 的 `SECRET_KEY`。`.env` 只保存在本机或服务器上，不要提交到 Git。更换密钥后，已有登录会话会失效，需要重新登录。

### Docker 部署

需要安装 Docker 和 Docker Compose：

```bash
docker compose up -d --build
```

这会构建后端、前端并启动 Nginx。启动后访问 <http://127.0.0.1:8080>；服务器部署时，将 `127.0.0.1` 换成服务器地址。

## 部署与升级

### 首次部署（服务器构建）

将项目上传或克隆到服务器，例如 `/opt/beaver`，然后执行：

```bash
cd /opt/beaver
mkdir -p backend/data
# 首次部署时创建 .env，并填入随机 SECRET_KEY
docker compose up -d --build
docker compose ps
```

应用数据保存在 `backend/data/`，后端 API 默认仅供容器内部使用，外部入口是 Nginx 的 `8080` 端口。

### 日常升级（源码部署）

升级前先备份数据库和附件，再更新代码并重新构建：

```bash
cd /opt/beaver
cp backend/data/app.db backend/data/app.db.bak-$(date +%Y%m%d%H%M%S)
tar -czf /tmp/beaver-data-$(date +%Y%m%d%H%M%S).tar.gz backend/data
git pull --ff-only
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 backend
```

后端启动时会自动执行数据库迁移。不要用仓库中的旧数据库覆盖 `backend/data/app.db`，也不要执行 `docker compose down -v`。

### 推荐升级（预构建镜像）

服务器构建较慢时，在本地仓库根目录生成部署包和完整镜像包：

```bash
# 已有基础部署包时，更新 deploy-package-new.tar.gz
scripts/package-deploy.sh --verify fast

# 必须同时构建后端和前端镜像
docker compose build backend frontend
docker save -o docker-images.tar beaver-backend:latest beaver-frontend:latest
gzip -f docker-images.tar
```

将 `deploy-package-new.tar.gz` 和 `docker-images.tar.gz` 上传到服务器。部署目录以 `/opt/beaver` 为例：

```bash
mkdir -p /opt/beaver/data
tar -xzf /tmp/deploy-package-new.tar.gz --strip-components=1 -C /opt/beaver
# 首次部署时在 /opt/beaver/.env 中配置 SECRET_KEY
gzip -dc /tmp/docker-images.tar.gz | docker load
cd /opt/beaver
docker compose up -d
docker compose ps
```

预构建镜像已经加载后不要加 `--build`。部署包不会包含服务器数据，升级时必须保留 `data/app.db`、`data/uploads/`、`data/excalidraw/` 和 `data/skill/`。

### 回滚

代码回滚到旧版本后重新构建即可；如果使用预构建镜像，加载上一份 `docker-images.tar.gz` 后执行 `docker compose up -d`。数据库需要从对应的备份文件恢复，再启动服务。

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
