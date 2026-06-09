@echo off
REM AI 复习小程序 Docker 停止脚本

echo.
echo ========================================
echo   QuizPilot - Docker 停止
echo ========================================
echo.

echo 正在停止容器...
docker-compose stop

if errorlevel 1 (
    echo ❌ 停止失败
    pause
    exit /b 1
)

echo ✅ 容器已停止

echo.
echo ========================================
echo   停止完成！
echo ========================================
echo.
echo 💡 要重新启动，请运行：启动.bat
echo.

pause
