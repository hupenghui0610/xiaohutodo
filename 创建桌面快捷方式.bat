@echo off
chcp 65001 >nul

echo.
echo 正在创建桌面快捷方式...
echo.

set "SCRIPT=%TEMP%\create_shortcut.vbs"
set "TARGET=%~dp0index.html"
set "ICON=%~dp0icon.ico"
set "DESKTOP=%USERPROFILE%\Desktop"

echo Set objShell = CreateObject("WScript.Shell") > "%SCRIPT%"
echo Set objFSO = CreateObject("Scripting.FileSystemObject") >> "%SCRIPT%"
echo Set objShortcut = objShell.CreateShortcut("%DESKTOP%\XiaoHuTodo.lnk") >> "%SCRIPT%"
echo objShortcut.TargetPath = "%TARGET%" >> "%SCRIPT%"
echo objShortcut.WorkingDirectory = "%~dp0" >> "%SCRIPT%"
echo objShortcut.Description = "XiaoHu Todo List" >> "%SCRIPT%"
echo If objFSO.FileExists("%ICON%") Then >> "%SCRIPT%"
echo     objShortcut.IconLocation = "%ICON%,0" >> "%SCRIPT%"
echo End If >> "%SCRIPT%"
echo objShortcut.Save >> "%SCRIPT%"

cscript //nologo "%SCRIPT%"
del "%SCRIPT%"

echo.
echo 桌面快捷方式创建成功！
echo 请查看桌面上的 "XiaoHuTodo" 图标
echo.
pause
