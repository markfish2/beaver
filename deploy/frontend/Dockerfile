# 如果 dist/ 已存在则跳过构建，直接用预编译产物
# 否则执行完整构建流程

# Build stage（仅在无 dist/ 时执行）
FROM node:20-alpine AS builder
WORKDIR /app
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories
COPY package.json package-lock.json* ./
RUN npm install --registry=https://registry.npmmirror.com
COPY . .
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN if [ ! -d "dist" ]; then npm run build; fi

# Production stage
FROM nginx:alpine
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories
RUN apk add --no-cache curl
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
