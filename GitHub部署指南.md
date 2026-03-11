# 部署到 GitHub Pages 的步骤（10分钟完成）

## 📦 准备工作
所有文件已经准备好了，就在当前目录 `d:\cursor\cursor_workspace`

## 🚀 部署步骤

### 第一步：注册 GitHub 账号

1. 访问：https://github.com
2. 点击右上角 "Sign up"
3. 填写邮箱、密码、用户名
4. 验证邮箱

### 第二步：创建仓库

1. 登录 GitHub 后，点击右上角 "+" → "New repository"
2. 填写信息：
   - Repository name: `xiaohutodo`（或其他名字）
   - 选择 "Public"（公开）
   - ✅ 勾选 "Add a README file"
3. 点击 "Create repository"

### 第三步：上传文件

1. 在仓库页面，点击 "Add file" → "Upload files"
2. 把以下文件拖拽到网页上：
   - `index.html`（必须）
   - `icon.ico`（如果有）
   - 其他文件可选
3. 点击 "Commit changes"

### 第四步：启用 GitHub Pages

1. 在仓库页面，点击 "Settings"（设置）
2. 左侧菜单找到 "Pages"
3. 在 "Source" 下拉菜单选择：
   - Branch: `main`
   - Folder: `/ (root)`
4. 点击 "Save"
5. 等待 1-2 分钟，页面会显示你的 URL：
   ```
   https://你的用户名.github.io/xiaohutodo/
   ```

### 第五步：测试访问

1. 复制上面的 URL
2. 在浏览器中打开，确认应用正常运行
3. 把这个 URL 填入飞书后台的"桌面端主页"

---

## 🔄 更新应用

如果以后需要更新代码：
1. 进入仓库页面
2. 点击要修改的文件
3. 点击编辑按钮（铅笔图标）
4. 修改后点击 "Commit changes"
5. 等待 1-2 分钟自动部署

---

## 💡 提示

- **URL 格式**：`https://用户名.github.io/仓库名/`
- **部署时间**：首次部署约 1-2 分钟
- **完全免费**：GitHub Pages 永久免费
- **HTTPS 支持**：自动提供 HTTPS

---

## ❓ 遇到问题？

### 问题1：404 错误
- 等待 2-3 分钟，GitHub Pages 需要时间部署
- 确认 Settings → Pages 中已启用

### 问题2：页面空白
- 检查 `index.html` 是否在根目录
- 确认文件名是小写的 `index.html`

### 问题3：找不到 Pages 设置
- 确认仓库是 Public（公开）
- 免费账号只能为公开仓库启用 Pages

---

## 📞 完成后

部署完成后，把 URL 告诉我，我会帮你：
1. 配置飞书多维表格 API
2. 修改数据存储逻辑
3. 确保一切正常工作
