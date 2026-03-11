@echo off
chcp 65001 >nul
title 小胡同学 To-do List - 打包工具

echo.
echo ========================================
echo   小胡同学 To-do List - 打包工具
echo ========================================
echo.
echo 正在创建独立可执行文件...
echo.

REM 检查是否存在 index.html
if not exist "index.html" (
    echo [错误] 找不到 index.html 文件！
    pause
    exit /b 1
)

REM 创建临时 VBS 文件
echo Set objShell = CreateObject("WScript.Shell") > temp_launcher.vbs
echo Set objFSO = CreateObject("Scripting.FileSystemObject") >> temp_launcher.vbs
echo strScriptPath = objFSO.GetParentFolderName(WScript.ScriptFullName) >> temp_launcher.vbs
echo strHtmlPath = strScriptPath ^& "\index.html" >> temp_launcher.vbs
echo If Not objFSO.FileExists(strHtmlPath) Then >> temp_launcher.vbs
echo     MsgBox "找不到 index.html 文件！", vbCritical, "错误" >> temp_launcher.vbs
echo     WScript.Quit >> temp_launcher.vbs
echo End If >> temp_launcher.vbs
echo objShell.Run """" ^& strHtmlPath ^& """", 1, False >> temp_launcher.vbs

REM 使用 IExpress 创建自解压 EXE
echo [STRINGS] > config.sed
echo AppLaunched=wscript.exe temp_launcher.vbs >> config.sed
echo TargetName=%%TEMP%%\xiaohutodo >> config.sed
echo FriendlyName=小胡同学To-do List >> config.sed
echo [SETUP] >> config.sed
echo Prompt= >> config.sed
echo DisplayLicense= >> config.sed
echo FinishMessage= >> config.sed
echo TargetName=小胡同学Todo.exe >> config.sed
echo AppLaunched=cmd /c wscript.exe temp_launcher.vbs >> config.sed
echo PostInstallCmd=^<None^> >> config.sed
echo AdminQuietInstCmd= >> config.sed
echo UserQuietInstCmd= >> config.sed
echo FILE0="index.html" >> config.sed
echo FILE1="temp_launcher.vbs" >> config.sed
echo [VERSION] >> config.sed
echo Class=IEXPRESS >> config.sed
echo SEDVersion=3 >> config.sed
echo [SourceFiles] >> config.sed
echo SourceFiles0=. >> config.sed
echo [SourceFiles0] >> config.sed
echo %%FILE0%%=index.html >> config.sed
echo %%FILE1%%=temp_launcher.vbs >> config.sed

echo.
echo [提示] Windows 自带的 IExpress 工具有限制，无法完美打包。
echo.
echo 推荐方案：
echo 1. 直接双击 index.html 使用（最简单）
echo 2. 右键 index.html -^> 发送到 -^> 桌面快捷方式
echo 3. 双击 启动应用.vbs 启动
echo.
echo 如需真正的独立 EXE，请：
echo - 安装 Node.js 后使用 Electron 方案
echo - 或安装 .NET SDK 后使用 WebView2 方案
echo.

REM 清理临时文件
if exist temp_launcher.vbs del temp_launcher.vbs
if exist config.sed del config.sed

pause
