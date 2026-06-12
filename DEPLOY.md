# MiniFlowy 腾讯云 Docker 部署指南

## 前置要求

- 腾讯云 CVM/Lighthouse 实例（推荐 2C4G 或以上）
- 操作系统：Ubuntu 22.04 / CentOS 8 / Debian 11（x86_64）
- 已安装 Docker 和 Docker Compose

## 一、服务器初始化

### 1. 安装 Docker（如未安装）

```bash
# Ubuntu / Debian
curl -fsSL https://get.docker.com | bash -s docker
sudo usermod -aG docker $USER
newgrp docker

# 安装 Docker Compose V2
sudo apt-get install -y docker-compose-plugin
```

```bash
# CentOS
curl -fsSL https://get.docker.com | bash -s docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER
newgrp docker
```

### 2. 验证安装

```bash
docker --version
docker compose version
```

## 二、部署项目

### 1. 上传项目文件

将整个项目目录上传到服务器：

```bash
# 方式一：scp 上传
scp -r ./miniflowy2.1 root@your-server-ip:/opt/miniflowy

# 方式二：rsync（推荐，支持增量同步）
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'backend/venv' \
  ./miniflowy2.1/ root@your-server-ip:/opt/miniflowy/
```

### 2. 上传数据库（如有本地数据）

```bash
# 上传本地数据库文件
scp ./backend/data/app.db root@your-server-ip:/opt/miniflowy/backend/data/app.db
```

### 3. 构建并启动

```bash
cd /opt/miniflowy

# 构建镜像（云端编译，首次约 5-10 分钟）
docker compose build --no-cache

# 启动服务
docker compose up -d

# 查看启动状态
docker compose ps
docker compose logs -f
```

## 三、配置防火墙

### 腾讯云安全组

在腾讯云控制台 → 安全组中放行以下端口：

| 协议 | 端口 | 用途 |
|------|------|------|
| TCP | 80 | HTTP 访问 |
| TCP | 443 | HTTPS 访问（如配置 SSL） |
| TCP | 22 | SSH 远程登录 |

### 服务器防火墙

```bash
# Ubuntu / Debian (ufw)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable

# CentOS (firewalld)
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --reload
```

## 四、访问应用

- HTTP 访问：`http://your-server-ip`
- 首次访问会进入注册页面，创建管理员账号

## 五、配置域名和 SSL（可选）

### 1. 绑定域名

在腾讯云控制台将域名解析到服务器 IP。

### 2. 申请 SSL 证书

在腾讯云控制台 → SSL 证书管理申请免费证书，下载 Nginx 格式。

### 3. 配置证书

```bash
# 创建 SSL 目录
mkdir -p nginx/ssl

# 上传证书文件
cp your-domain.crt nginx/ssl/
cp your-domain.key nginx/ssl/
```

### 4. 修改 nginx.conf

取消 `nginx.conf` 中 HTTPS server 块的注释，修改域名为你的实际域名：

```bash
# 编辑 nginx 配置
vim nginx/nginx.conf

# 取消 HTTPS server 块注释，修改 server_name
```

### 5. 重启 nginx

```bash
docker compose restart nginx
```

## 六、数据备份

### 手动备份

```bash
# 备份数据库
cp ./backend/data/app.db ./backend/data/app.db.backup.$(date +%Y%m%d_%H%M%S)

# 备份整个 data 目录
tar -czf /tmp/miniflowy-backup-$(date +%Y%m%d).tar.gz ./backend/data/
```

### 自动备份（推荐）

```bash
# 添加定时任务
crontab -e

# 每天凌晨 3 点自动备份
0 3 * * * cd /opt/miniflowy && cp ./backend/data/app.db ./backend/data/app.db.backup.$(date +\%Y\%m\%d_\%H\%M\%S) && find ./backend/data -name "app.db.backup.*" -mtime +7 -delete
```

## 七、常用运维命令

```bash
# 查看容器状态
docker compose ps

# 查看实时日志
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f nginx

# 重启所有服务
docker compose restart

# 重启单个服务
docker compose restart backend

# 停止服务
docker compose down

# 停止并删除数据卷（慎用！会删除数据库）
docker compose down -v

# 进入后端容器
docker compose exec backend bash

# 查看资源占用
docker stats
```

## 八、更新部署

```bash
cd /opt/miniflowy

# 1. 备份数据库
cp ./backend/data/app.db ./backend/data/app.db.backup.$(date +%Y%m%d_%H%M%S)

# 2. 上传新代码（覆盖除 backend/data 外的文件）
rsync -avz --exclude 'backend/data' --exclude 'node_modules' --exclude '.git' \
  ./miniflowy2.1/ /opt/miniflowy/

# 3. 重新构建并部署
docker compose down
docker compose build --no-cache
docker compose up -d

# 4. 检查状态
docker compose ps
docker compose logs -f
```

## 九、回滚操作

```bash
# 1. 停止服务
docker compose down

# 2. 恢复数据库备份
cp ./backend/data/app.db.backup.YYYYMMDD_HHMMSS ./backend/data/app.db

# 3. 恢复代码（如有 git）
git checkout <previous-commit>

# 4. 重新构建并启动
docker compose build --no-cache
docker compose up -d
```

## 十、性能优化（可选）

### 1. 配置 Swap（低内存服务器）

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 2. 限制容器资源

在 `docker-compose.yml` 中添加资源限制：

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

## 故障排查

### 容器无法启动

```bash
# 查看详细日志
docker compose logs backend
docker compose logs frontend

# 检查端口占用
sudo netstat -tlnp | grep -E ':(80|443) '
```

### 数据库锁定

```bash
# 进入后端容器检查
docker compose exec backend bash
sqlite3 /app/data/app.db "PRAGMA integrity_check;"
```

### 内存不足

```bash
# 查看内存使用
free -h
docker stats --no-stream
```
