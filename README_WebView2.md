# 小胡同学 To-do List - 轻量版

一个简洁的本地待办事项管理应用，使用 WebView2 技术，体积小巧。

## 功能特点

- **无限期待办**：没有时间限制的任务
- **周待办**：本周内需要完成的任务，未完成自动顺延并标记延迟
- **日待办**：按每天管理的任务，支持周一到周五和周末分组

## 系统要求

- Windows 10 或 Windows 11
- WebView2 Runtime（Windows 11 自带，Windows 10 可能需要安装）

## 构建方法

### 方法 1：使用 Visual Studio（推荐）

1. 安装 Visual Studio 2022（Community 版免费）
2. 安装时选择 ".NET 桌面开发" 工作负载
3. 打开 `XiaoHuTodo.csproj`
4. 点击"生成" -> "发布"

### 方法 2：使用命令行

如果已安装 .NET 6.0 SDK：

```bash
# 发布为单文件可执行程序
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true

# 生成的 exe 文件在：
# bin\Release\net6.0-windows\win-x64\publish\小胡同学Todo.exe
```

### 方法 3：直接使用浏览器（最简单）

如果不想构建客户端，直接双击 `index.html` 用浏览器打开即可使用。

## 下载 .NET SDK（如果需要）

访问：https://dotnet.microsoft.com/zh-cn/download/dotnet/6.0

下载并安装 .NET 6.0 SDK（x64）

## 下载 WebView2 Runtime（如果需要）

访问：https://developer.microsoft.com/zh-cn/microsoft-edge/webview2/

下载 Evergreen Standalone Installer

## 数据存储

所有数据存储在浏览器本地存储（localStorage）中，不会上传到任何服务器。
