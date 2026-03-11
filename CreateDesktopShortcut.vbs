Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

strScriptPath = objFSO.GetParentFolderName(WScript.ScriptFullName)
strHtmlPath = strScriptPath & "\index.html"
strIconPath = strScriptPath & "\icon.ico"

If Not objFSO.FileExists(strHtmlPath) Then
    MsgBox "Cannot find index.html!", vbCritical, "Error"
    WScript.Quit
End If

strDesktop = objShell.SpecialFolders("Desktop")

Set objShortcut = objShell.CreateShortcut(strDesktop & "\XiaoHuTodo.lnk")
objShortcut.TargetPath = strHtmlPath
objShortcut.WorkingDirectory = strScriptPath
objShortcut.Description = "XiaoHu Todo List"
If objFSO.FileExists(strIconPath) Then
    objShortcut.IconLocation = strIconPath & ",0"
End If
objShortcut.Save

MsgBox "Desktop shortcut created successfully!" & vbCrLf & vbCrLf & "You can now double-click the 'XiaoHuTodo' icon on your desktop to launch the app.", vbInformation, "Success"
