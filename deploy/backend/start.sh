#!/bin/bash
set -e

echo "Starting Flowy Backend..."
mkdir -p /app/data /app/data/uploads

if [ -f "/app/data/appback.db" ] && [ ! -f "/app/data/.migrated" ]; then
    echo "发现旧数据库文件，开始迁移..."
    chmod +x /app/migrate_from_old.sh
    /app/migrate_from_old.sh
fi

echo "Running idempotent database migrations..."
python3 -m app.migrations /app/data/app.db

echo "Running excalidraw data migration..."
python3 /app/migrate_excalidraw.py

echo "Starting uvicorn server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
