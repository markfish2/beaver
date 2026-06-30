FROM python:3.11-slim

WORKDIR /app

# 使用阿里云镜像源加速
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y \
    gcc \
    sqlite3 \
    curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# Copy application code
COPY app/ ./app/
COPY start.sh /app/start.sh
COPY migrate_from_old.sh /app/migrate_from_old.sh
COPY migrate_excalidraw.py /app/migrate_excalidraw.py

# Set permissions (data directory created by volume mount at runtime)
RUN chmod +x /app/start.sh /app/migrate_from_old.sh

EXPOSE 8000

CMD ["/app/start.sh"]
