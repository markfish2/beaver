# Beaver

Beaver 是一个自托管的个人知识库，适合整理长期积累的资料、文章和想法。项目支持大纲笔记、Markdown 普通笔记、Memo、日记、待办、全文搜索、思维导图、Excalidraw 画布和 PWA 多端访问。

## 功能

- 大纲笔记：层级组织、折叠、拖拽和节点编辑
- 普通笔记：Markdown、表格、代码块、图片、链接和划线
- Memo、日记、待办、回收站、全文搜索和公开分享
- 思维导图、Excalidraw 画布、深色模式和离线缓存
- Chrome 浏览器插件：保存网页、选中文字和图片

<img width="1370" height="1095" alt="image" src="https://github.com/user-attachments/assets/8b0e8adc-cb1e-426f-b73d-c604f6c58e74" />
<img width="1366" height="1093" alt="image" src="https://github.com/user-attachments/assets/63abb70c-eab9-4d16-8bb6-ae4a372c5056" />
<img width="1362" height="1086" alt="image" src="https://github.com/user-attachments/assets/90a321e0-55d3-4a1f-98d4-4213acf71758" />
<img width="1369" height="1092" alt="image" src="https://github.com/user-attachments/assets/f2ae1755-bf2e-4c9c-af27-55e64e6bcf21" />
<img width="1367" height="1089" alt="image" src="https://github.com/user-attachments/assets/3f9368d6-b522-4ab4-971e-c368ed7e05ce" />



## 部署

### 方式一：使用 GHCR 预构建镜像（推荐）

GitHub Actions 会在 `main` 分支更新或推送 `v*` 标签时，自动发布：

```text
ghcr.io/markfish2/beaver-backend
ghcr.io/markfish2/beaver-frontend
```

首次发布后，请在 GitHub 仓库的 **Packages** 页面将两个镜像设为 `Public`。如果镜像保持私有，服务器需要先使用具有 `read:packages` 权限的 Token 登录 GHCR。

在新服务器上执行：

```bash
export BEAVER_REF=main
mkdir -p /opt/beaver/data
cd /opt/beaver
curl -fsSLo docker-compose.yml "https://raw.githubusercontent.com/markfish2/beaver/${BEAVER_REF}/docker-compose.images.yml"
curl -fsSLo nginx.conf "https://raw.githubusercontent.com/markfish2/beaver/${BEAVER_REF}/nginx/nginx.conf"
curl -fsSLo .env.example "https://raw.githubusercontent.com/markfish2/beaver/${BEAVER_REF}/.env.example"
cp .env.example .env
openssl rand -hex 32
# 将上面生成的随机字符串填入 .env 的 SECRET_KEY
docker compose pull
docker compose up -d
```

服务通过 `8080` 端口访问。升级时保留 `/opt/beaver/data`，执行：

```bash
cd /opt/beaver
docker compose pull
docker compose up -d
```

需要固定版本时，在 `.env` 中设置 `BEAVER_VERSION=v1.0.0`，并使用对应版本的 `BEAVER_REF` 下载配置文件。当前 GHCR 工作流发布目标为 `linux/amd64`。

### 方式二：服务器本地构建镜像

适合需要从源码构建或无法访问 GHCR 的环境：

```bash
git clone https://github.com/markfish2/beaver.git /opt/beaver
cd /opt/beaver
cp .env.example .env
openssl rand -hex 32
# 将随机字符串填入 .env 的 SECRET_KEY
docker compose up -d --build
```

源码部署的数据位于 `backend/data/`；GHCR 部署的数据位于部署目录的 `data/`。两种方式升级前都应备份 `app.db`、上传文件和画布数据，禁止用仓库中的旧数据库覆盖现有数据。

## 本地开发

开发时 Docker 只运行后端，前端使用 Vite 热更新：

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d
cd frontend
npm install
npm run dev
```

浏览器访问 <http://127.0.0.1:8080>。常用检查命令：

```bash
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm test
npm run build
```

## 项目结构

```text
backend/           FastAPI 后端、SQLite 数据库和附件存储
frontend/          React + TypeScript + Vite 前端
excalidraw/        嵌入式画布编辑器
chrome-extension/  Chrome 浏览器插件
nginx/             反向代理配置
deploy/            预打包部署文件（不要直接修改）
```


## License

MIT License
