@echo off
chcp 65001 >nul
echo.
echo ========================================
echo   小胡同学 To-do List - 启动器
echo ========================================
echo.
echo 正在启动应用...
echo.

start "" "%~dp0index.html"

echo 应用已在浏览器中打开！
echo.
echo 提示：
echo - 数据保存在浏览器本地存储中
echo - 建议将此页面添加到浏览器书签
echo - 或创建桌面快捷方式方便下次使用
echo.
pause
