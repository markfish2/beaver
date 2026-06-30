#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$SCRIPT_DIR"

echo "打包后端..."
rm -rf backend && mkdir -p backend
cp -r "$PROJECT_DIR/backend/app" backend/
cp "$PROJECT_DIR/backend/Dockerfile" "$PROJECT_DIR/backend/requirements.txt" "$PROJECT_DIR/backend/start.sh" backend/
cp "$PROJECT_DIR/backend"/migrate_*.py "$PROJECT_DIR/backend"/migrate_*.sh "$PROJECT_DIR/backend"/migrate_*.sql backend/ 2>/dev/null || true

echo "打包前端..."
rm -rf frontend && mkdir -p frontend
cp -r "$PROJECT_DIR/frontend/src" "$PROJECT_DIR/frontend/public" frontend/
cp "$PROJECT_DIR/frontend/package.json" "$PROJECT_DIR/frontend/package-lock.json" frontend/ 2>/dev/null || true
cp "$PROJECT_DIR/frontend/vite.config.ts" "$PROJECT_DIR/frontend/tsconfig.json" "$PROJECT_DIR/frontend/index.html" "$PROJECT_DIR/frontend/Dockerfile" "$PROJECT_DIR/frontend/nginx.conf" frontend/
cp "$PROJECT_DIR/frontend/tsconfig.app.json" "$PROJECT_DIR/frontend/tsconfig.node.json" "$PROJECT_DIR/frontend/postcss.config.js" "$PROJECT_DIR/frontend/eslint.config.js" frontend/ 2>/dev/null || true

echo "复制数据..."
mkdir -p data
cp "$PROJECT_DIR/backend/data/app.db" data/ 2>/dev/null && echo "  ✓ app.db"
cp -r "$PROJECT_DIR/backend/data/uploads" data/ 2>/dev/null && echo "  ✓ uploads/"

echo "完成: $(du -sh . --exclude=.git --exclude=node_modules | cut -f1)"
