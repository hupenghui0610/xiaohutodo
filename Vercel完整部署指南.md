# 部署到 Vercel 完整指南（含飞书 API）

## 🎯 目标
将应用完整部署到 Vercel，包括前端和后端 API，连接飞书多维表格。

---

## 📋 第一步：准备飞书多维表格

1. **打开飞书多维表格**：https://feishu.cn
2. **创建数据表**（如果还没创建）：
   - 在你的多维表格 `tblZKtePBKg6T21x` 中
   - 创建一个数据表，记下表的 ID（或使用默认表）
3. **创建以下字段**：
   - `id`（文本）- 待办唯一标识
   - `type`（文本）- A/B/C 类型
   - `title`（文本）- 待办标题
   - `done`（复选框）- 是否完成
   - `date`（日期）- 日期（C类用）
   - `weekStart`（日期）- 周起始（B类用）
   - `delayed`（复选框）- 是否延迟（B类用）
   - `createdAt`（日期时间）- 创建时间

---

## 📋 第二步：部署到 Vercel

### 1. 注册/登录 Vercel

访问：https://vercel.com
- 点击 "Sign Up"
- **用你的 GitHub 账号登录**（最方便）

### 2. 导入 GitHub 仓库

1. 登录后，点击 "Add New..." → "Project"
2. 选择 "Import Git Repository"
3. 找到并选择 `xiaohutodo` 仓库
4. 点击 "Import"

### 3. 配置项目

在配置页面：
- **Framework Preset**: 选择 "Other"
- **Root Directory**: 保持默认 `./`
- **Build Command**: 留空
- **Output Directory**: 留空
- 点击 "Deploy"

### 4. 等待部署完成

- 大约 30-60 秒
- 完成后会显示你的新 URL，例如：`https://xiaohutodo-xxx.vercel.app`

---

## 📋 第三步：配置环境变量（重要！）

1. 部署完成后，点击项目名称进入项目页面
2. 点击顶部 "Settings" 标签
3. 左侧菜单点击 "Environment Variables"
4. 添加环境变量：
   - **Name**: `FEISHU_APP_SECRET`
   - **Value**: `wgWrVSmfxVfk3HDbqsk1khnAoTG5wWI4`（你的新 Secret）
   - **Environment**: 全选（Production, Preview, Development）
5. 点击 "Save"

### 5. 重新部署

配置环境变量后需要重新部署：
1. 点击顶部 "Deployments" 标签
2. 找到最新的部署，点击右侧的 "..." 菜单
3. 选择 "Redeploy"
4. 等待重新部署完成

---

## 📋 第四步：更新飞书应用配置

1. 访问飞书开放平台：https://open.feishu.cn/app
2. 找到你的应用
3. 更新"桌面端主页"为新的 Vercel URL：
   ```
   https://xiaohutodo-xxx.vercel.app
   ```

---

## 📋 第五步：配置飞书权限

1. 在飞书开放平台，进入你的应用
2. 点击"权限管理"
3. 添加以下权限：
   - `bitable:app` - 获取多维表格信息
   - `bitable:app:readonly` - 查看多维表格
   - `bitable:app:readwrite` - 编辑多维表格

4. 点击"版本管理与发布"
5. 创建版本并发布

---

## ✅ 测试

1. 访问你的 Vercel URL
2. 尝试添加待办
3. 检查飞书多维表格是否有数据

---

## 🔄 以后如何更新

### 方法 1：通过 GitHub（推荐）

1. 修改 GitHub 仓库中的文件
2. Vercel 会自动检测并重新部署
3. 等待 1-2 分钟即可

### 方法 2：直接在 Vercel 上传

1. 进入 Vercel 项目页面
2. 点击 "Deployments"
3. 点击 "Upload"
4. 上传修改后的文件

---

## ❓ 常见问题

### Q: API 调用失败？
A: 检查：
1. 环境变量是否正确配置
2. 飞书应用权限是否添加
3. 多维表格 ID 是否正确

### Q: 数据没有保存到飞书？
A: 检查：
1. 浏览器控制台是否有错误
2. 飞书多维表格字段是否创建完整
3. API 是否返回错误信息

### Q: 部署后页面空白？
A: 检查：
1. index.html 是否在根目录
2. 浏览器控制台是否有错误
3. 等待 2-3 分钟再试

---

## 📞 完成后

部署完成并测试通过后，**记得重置你的 App Secret**！

因为 Secret 已经在聊天记录中暴露了，建议重置后更新 Vercel 的环境变量。
