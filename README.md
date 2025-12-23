# QuizPilot · AI Study & Quiz App

AI 驱动的现代化学习与刷题应用（中英双语）。快速跳题、覆盖层校对、严格 CSP、防注入与性能优化。

[![Stars](https://img.shields.io/github/stars/C1066g/QuizPilot?style=social)](https://github.com/C1066g/QuizPilot/stargazers)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![CSP](https://img.shields.io/badge/Security-Strict%20CSP-success)
![JSON Schema](https://img.shields.io/badge/Validation-JSON%20Schema-informational)

一个轻量、离线可用的刷题小程序。支持题库覆盖层（Overlay）自动导入、Word/PDF/TXT/MD 一键导入题库、错题与收藏管理、严格 CSP 与离线使用。

## 功能特性
- 覆盖层自动导入：
  - 前端合并 `rgzr/custom/*.json` 与浏览器 `localStorage` 覆盖层
  - 支持 upsert（按 `id` 或题干归一化合并）
- 一键导入 Word/PDF/TXT/MD：
  - 内置 `mammoth`（docx）与 `pdf.js`（pdf）离线解析
  - 导入后自动转换为覆盖层并合并
- 基础题型支持：判断、单选、多选、简答
- UI/UX：练习/浏览/收藏/错题/统计，快捷键，乱序选项，自动下一题
- 安全基线：CSP、XFO、COOP/CORP、Referrer-Policy、nosniff；路径穿越防护
- 运行方式：本地 Node 或 Docker，手机与电脑同网访问

## 快速开始（本地）
```bash
# 进入服务目录
cd rgzr

# 启动（跨平台，默认 0.0.0.0:8001）
npm start
# 打开 http://localhost:8001

# 如需修改端口：
# mac/Linux (bash/zsh)
PORT=8002 npm start
# Windows CMD
set PORT=8002 && npm start
# Windows PowerShell
$env:PORT=8002; npm start
```

Windows 也可使用：`npm run start:win`

手机访问：`http://<你的电脑IP>:8001`

## Docker 启动
```bash
# 在仓库根目录
docker build -t quizpilot ./rgzr
# 运行
docker run --rm -p 8001:8001 -e HOST=0.0.0.0 -e PORT=8001 quizpilot
# 打开 http://localhost:8001
```
或使用 docker-compose：
```bash
docker compose up --build
```

## 题库导入（覆盖层 Overlay）
- 放置到 `rgzr/custom/`：刷新即自动识别 `/custom/index.json` 并合并
- 浏览器本地：点击“📥 导入覆盖层（本地）”选择 JSON
- 上传到服务器：点击“⤴️ 上传覆盖层（到服务器）”（仅本机）
- JSON 格式与合并规则：见 `docs/覆盖层使用指南.md`

## 直接导入 Word/PDF/TXT/MD
- 顶部工具栏点击“📄 导入 Word/PDF/文本”
- 解析后会提示识别到的题目数量，并立即合并应用
- 建议随后“📤 导出覆盖层”并“⤴️ 上传覆盖层（到服务器）”以持久化

## 目录结构
```
QuizPilot/
├─ rgzr/                     # 前端与本地 Node 服务
│  ├─ server.js              # 本地服务（含 /custom/index.json /custom/upload）
│  ├─ index.html, app.js     # 前端应用
│  ├─ lib/                   # mammoth、pdf.js 等离线依赖
│  └─ custom/                # 覆盖层目录（含 .gitignore 与模板）
├─ docs/
│  └─ 覆盖层使用指南.md       # 覆盖层说明
├─ .github/                  # 开源模板与 CI
├─ LICENSE                   # 开源许可证（MIT）
└─ README.md
```

## 截图与演示
在 `docs/assets/` 放置截图与 GIF，README 将引用这些资源：

- 首页界面：`docs/assets/screenshot-home.png`
- 导入工具栏与文件选择：`docs/assets/screenshot-import.png`
- 浏览模式 Demo（关键词过滤）：`docs/assets/screenshot-browse-demo.png`
- 导入演示动图：`docs/assets/demo-import.gif`

占位符已创建，可直接替换文件名。录制步骤见 `docs/DEMO录制指南.md`。

示例引用（资源准备好后可取消注释）：

<!-- ![Home](docs/assets/screenshot-home.png)
![Import](docs/assets/screenshot-import.png)
![Browse Demo](docs/assets/screenshot-browse-demo.png)
![Demo GIF](docs/assets/demo-import.gif) -->

## 常见问题（FAQ）
- 端口被占用：
  - 修改环境变量 `PORT` 后再启动（见上文）
  - 或关闭占用 8001 的进程：
    - mac：`lsof -nP -iTCP:8001 | grep LISTEN` → `kill -9 <PID>`
    - Windows：`netstat -ano | findstr :8001` → `taskkill /PID <PID> /F`
- 上传失败：`/custom/upload` 仅本机可用；请在运行服务的机器浏览器执行
- PDF/Word 解析失败：请将文档导出为 TXT 再导入，或检查文档是否为扫描版

## 贡献
见 `CONTRIBUTING.md` 与 `CODE_OF_CONDUCT.md`。欢迎 Issue 与 PR！

## 许可证
本项目采用 MIT 许可证。题库数据请确保符合所在学校/课程的版权政策；本仓库默认不附带第三方受版权保护的数据集。
