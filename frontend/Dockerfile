# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# 使用阿里云镜像源加速
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# Copy package files first for better layer caching
COPY package.json package-lock.json* ./

# 使用淘宝 npm 镜像加速
RUN npm install --registry=https://registry.npmmirror.com

# Copy source code
COPY . .

# Build the application (increase Node.js heap size for low-memory servers)
ENV NODE_OPTIONS=--max-old-space-size=2048
RUN npm run build

# Production stage
FROM nginx:alpine

# 使用阿里云镜像源加速
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# Install curl for health checks
RUN apk add --no-cache curl

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
