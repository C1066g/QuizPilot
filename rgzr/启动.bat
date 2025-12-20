@echo off
REM AI 复习小程序启动脚本

echo.
echo ========================================
echo   AI 知识复习小程序 - 启动
echo ========================================
echo.

REM 检查 Python 是否安装
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误：未检测到 Python
    echo 请先安装 Python
    echo 下载地址：https://www.python.org/
    pause
    exit /b 1
)

echo ✅ Python 已安装

REM 启动服务器
echo.
echo 正在启动服务器...
echo.

python -m http.server 8001

pause
