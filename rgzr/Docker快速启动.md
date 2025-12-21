# 🐳 Docker 快速启动指南

## 📋 前置要求

- ✅ 已安装 Docker Desktop
- ✅ 已安装 Docker Compose（Docker Desktop 自带）

---

## 🚀 快速启动（3步）

### 步骤 1：构建镜像

打开命令行，进入项目目录：

```bash
cd d:\桌面\qimofuxi
docker-compose build
```

**说明：**
- 第一次构建会下载 Python 镜像（约 100MB）
- 之后会很快
- 构建完成后会显示 `Successfully built`

### 步骤 2：启动容器

```bash
docker-compose up -d
```

**说明：**
- `-d` 表示后台运行
- 容器会自动启动
- 如果电脑重启，容器也会自动启动

### 步骤 3：访问应用

**在电脑上：**
```
http://localhost:8001
```

**在手机上（同一Wi-Fi）：**
```
http://<你的电脑IP>:8001
```

例如：`http://<你的电脑IP>:8001`

---

## 🎮 常用命令

### 查看容器状态
```bash
docker-compose ps
```

### 查看容器日志
```bash
docker-compose logs -f ai-review-app
```

### 停止容器
```bash
docker-compose stop
```

### 启动容器
```bash
docker-compose start
```

### 重启容器
```bash
docker-compose restart
```

### 删除容器
```bash
docker-compose down
```

### 删除镜像和容器
```bash
docker-compose down --rmi all
```

---

## 🔍 故障排查

### 问题 1：端口被占用

如果 8001 端口被占用，修改 `docker-compose.yml`：

```yaml
ports:
  - "8002:8000"  # 改为 8002
```

然后重启：
```bash
docker-compose down
docker-compose up -d
```

### 问题 2：容器无法启动

查看日志：
```bash
docker-compose logs ai-review-app
```

### 问题 3：手机无法访问

1. 确认电脑和手机在同一 Wi-Fi
2. 确认防火墙允许 8001 端口
3. 确认容器正在运行：`docker-compose ps`

---

## ✅ 验证部署成功

### 方法 1：查看容器状态
```bash
docker-compose ps
```

应该显示：
```
NAME                COMMAND                  SERVICE             STATUS              PORTS
ai-review-app       "python -m http.ser…"   ai-review-app       Up 2 minutes        0.0.0.0:8001->8000/tcp
```

### 方法 2：访问应用
在浏览器中打开 `http://localhost:8001`，应该看到 AI 复习小程序的界面。

### 方法 3：查看日志
```bash
docker-compose logs ai-review-app
```

应该显示：
```
Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/) ...
```

---

## 🔐 与 TrendRadar 隔离

### 端口分配

- **TrendRadar**：使用默认端口（或自定义端口）
- **AI 复习小程序**：使用端口 **8001**

两个项目使用不同的端口，完全独立，不会相互影响。

### 网络隔离

- 使用独立的 Docker 网络 `ai-review-network`
- 与 TrendRadar 的网络完全隔离
- 不会竞争系统资源

---

## 💡 使用建议

### 长期运行

如果想让应用一直在后台运行：

```bash
docker-compose up -d
```

- 容器会后台运行
- 电脑重启后自动启动
- 不影响其他应用

### 临时测试

如果只是临时测试：

```bash
docker-compose up
```

- 前台运行，可以看到日志
- 按 `Ctrl+C` 停止

### 停止运行

```bash
docker-compose stop
```

- 容器停止，但不删除
- 再次运行 `docker-compose start` 可以继续

---

## 📊 资源占用

- **内存**：10-20MB
- **CPU**：几乎不占用（只在有请求时）
- **磁盘**：约 150MB（包括 Python 镜像）

---

## 🎯 总结

| 操作 | 命令 |
|------|------|
| 首次启动 | `docker-compose build && docker-compose up -d` |
| 查看状态 | `docker-compose ps` |
| 查看日志 | `docker-compose logs -f` |
| 停止运行 | `docker-compose stop` |
| 启动运行 | `docker-compose start` |
| 完全删除 | `docker-compose down --rmi all` |

**祝你使用愉快！** 🚀
