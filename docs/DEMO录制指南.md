# DEMO 录制指南

本指南帮助你快速录制截图与 GIF 动图，用于 README 展示或社交媒体分享。

## 推荐素材与文件名
- docs/assets/screenshot-home.png
- docs/assets/screenshot-import.png
- docs/assets/screenshot-browse-demo.png
- docs/assets/demo-import.gif（15-30 秒）

## 演示脚本建议（15-30 秒）
1. 打开首页（展示顶部导入工具栏、模式按钮）
2. 点击“📄 导入 Word/PDF/文本”，选择一个包含 2-5 题的示例文件
3. 看到“识别 X 条题目”的提示
4. 切换“浏览模式”，在搜索框输入关键字，看到新题（如【Demo】）
5. 点开其中一题，切到“练习模式”，展示作答与显示答案
6. 可选：点击“📤 导出覆盖层”，展示下载的 JSON 文件名

## 截图建议
- Home 截图：顶部工具栏 + 练习模式头部信息
- Import 截图：文件选择器打开状态（或导入成功提示）
- Browse 截图：浏览模式 + 搜索结果列表
- 尺寸：1280×720 或 1440×900；PNG 格式

## 录制工具（任选其一）
- macOS：
  - 内置屏幕录制（Command+Shift+5）录制为 .mov → 用 Kap/ttystudio 转为 GIF
  - Kap（开源）录制为 GIF：https://getkap.co/
- Windows：
  - ScreenToGif（免费开源）录制为 GIF：https://www.screentogif.com/
  - Xbox Game Bar（Win+G）录制为 MP4 → 用 ezgif 转为 GIF
- Linux：
  - Peek（开源）录制为 GIF：https://github.com/phw/peek

## GIF 压缩与优化
- 目标大小：1-5MB，时长 15-30 秒
- 工具：
  - https://ezgif.com/（在线压缩、裁剪）
  - gifsicle（命令行）：`gifsicle -O3 input.gif -o output.gif`

## 隐私与安全
- 演示用题库请避免包含个人信息
- 录屏前关闭包含敏感数据的窗口

录制完成后：将文件放入 docs/assets/，文件名与 README 中示例一致，即可直接展示。
