# 腾讯云部署包打包流程

使用根目录脚本打包：

```bash
scripts/package-deploy.sh
```

默认模式是 `--verify fast`，只做固定、轻量的发布检查：

- 从现有 `deploy-package-new.tar.gz` 解出临时 staging；
- 只覆盖白名单源码：`backend/app`、后端 Docker/requirements/start/migrate 文件、`frontend/src`、`frontend/public`、`frontend/scripts`、前端 Docker/package/tsconfig/vite/nginx 配置；
- 不修改仓库里的 `deploy/`；
- 不复制 `backend/data/app.db`、uploads、`.git`、`__pycache__`、`.pyc`；
- 检查最近一次提交或当前未提交改动中，属于打包范围的文件是否已经进入包；
- 检查关键入口和迁移脚本存在。

需要完整镜像验证时再显式执行：

```bash
scripts/package-deploy.sh --verify full
```

`full` 会额外执行：

- `docker compose config`
- 后端 Docker build
- 前端 Docker build

日常只要求“打包新镜像”时，默认使用 fast 模式，避免每次重复跑完整 Docker 构建。只有改 Dockerfile、依赖、构建脚本、迁移流程，或明确要求完整验证时，才使用 full 模式。
