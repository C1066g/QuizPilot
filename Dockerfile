# 使用官方 Python 镜像作为基础镜像
FROM python:3.9-slim

# 设置工作目录
WORKDIR /app

# 复制项目文件到容器
COPY . /app/

# 暴露端口 8000
EXPOSE 8000

# 启动 HTTP 服务器
CMD ["python", "-m", "http.server", "8000", "--bind", "0.0.0.0"]
