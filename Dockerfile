# 多阶段构建 - 第一阶段：构建应用
FROM node:18-alpine AS builder
# 设置工作目录
WORKDIR /app
# 复制 package.json 和 lock 文件
COPY package*.json ./
# 设置 npm 淘宝源加速
RUN npm config set registry https://registry.npmmirror.com
# 跳过 postinstall 钩子，因为项目中已包含 scrcpy-server 文件
RUN npm ci --ignore-scripts
# 复制源代码
COPY . .
# 修改 vite 配置，将 base 改为根路径（用于 Docker 部署）
RUN sed -i "s|base: '/panda-web-scrcpy/',|base: '/',|g" vite.config.ts
# 构建应用
RUN npm run build

# 多阶段构建 - 第二阶段：部署到 nginx
FROM nginx:alpine
# 复制构建产物到 nginx 目录
COPY --from=builder /app/dist /usr/share/nginx/html
# 复制 nginx 配置文件
COPY nginx.conf /etc/nginx/nginx.conf
# 暴露端口
EXPOSE 3000
# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]
