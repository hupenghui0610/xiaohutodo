Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' 获取当前脚本所在目录
strScriptPath = objFSO.GetParentFolderName(WScript.ScriptFullName)
strHtmlPath = strScriptPath & "\index.html"

' 检查 index.html 是否存在
If Not objFSO.FileExists(strHtmlPath) Then
    MsgBox "找不到 index.html 文件！" & vbCrLf & "请确保此脚本与 index.html 在同一目录。", vbCritical, "错误"
    WScript.Quit
End If

' 使用默认浏览器打开，并尝试全屏模式
objShell.Run """" & strHtmlPath & """", 1, False

' 提示信息
MsgBox "小胡同学 To-do List 已启动！" & vbCrLf & vbCrLf & _
       "提示：" & vbCrLf & _
       "• 按 F11 可以切换全屏模式" & vbCrLf & _
       "• 数据保存在浏览器本地存储中" & vbCrLf & _
       "• 建议添加到浏览器书签以便下次使用", vbInformation, "启动成功"
