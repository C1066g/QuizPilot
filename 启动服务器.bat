@echo off
REM AI 复习小程序 - Node.js 服务器启动脚本

echo.
echo ========================================
echo   AI 知识复习小程序 - 服务器启动
echo ========================================
echo.

REM 检查 Node.js 是否安装
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误：未检测到 Node.js
    echo.
    echo 请先安装 Node.js
    echo 下载地址：https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo ✅ Node.js 已安装

REM 启动服务器
echo.
echo 正在启动服务器...
echo.

node server.js

pause
