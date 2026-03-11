# 小胡同学 To-do List

一个简洁的本地待办事项管理应用，支持三种类型的待办管理。

## 功能特点

- **无限期待办**：没有时间限制的任务
- **周待办**：本周内需要完成的任务，未完成自动顺延并标记延迟
- **日待办**：按每天管理的任务，支持周一到周五和周末分组

## 使用方法

### 开发模式运行

```bash
# 安装依赖
npm install

# 启动应用
npm start
```

### 打包成 Windows 安装包

```bash
# 安装依赖（如果还没安装）
npm install

# 打包
npm run build
```

打包完成后，安装包会生成在 `dist` 目录下。

## 数据存储

所有数据存储在浏览器本地存储（localStorage）中，不会上传到任何服务器。

## 技术栈

- Electron
- 原生 HTML/CSS/JavaScript
- localStorage
