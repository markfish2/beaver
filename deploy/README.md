# MiniFlowy (Beaver) 部署

## 部署步骤

### 1. 上传 deploy/ 到服务器

```bash
scp -r deploy/ root@服务器IP:/opt/miniflowy/
```

### 2. 启动

```bash
cd /opt/miniflowy/deploy
docker compose up -d --build
```

Docker 内 nginx 监听 8080 端口，由服务器 nginx 处理 SSL 后转发。

### 3. 服务器 nginx 配置

在服务器的 nginx 中添加：

```nginx
server {
    listen 443 ssl http2;
    server_name flowy.arcbox.top;

    ssl_certificate     /path/to/your/cert.pem;
    ssl_certificate_key /path/to/your/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

然后 `nginx -t && systemctl reload nginx`

## 常用命令

```bash
docker compose up -d --build   # 构建并启动
docker compose down             # 停止
docker compose logs -f          # 查看日志
docker compose restart          # 重启
```

## 数据备份

```bash
tar czf backup-$(date +%Y%m%d).tar.gz data/
```
