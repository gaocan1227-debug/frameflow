# 帧序｜短剧创作工作台

这是帧序当前版本的完整项目安装包。它不是签名的 macOS 原生 `.dmg` 应用，而是可在 Mac 上运行和部署的 Web 项目源码包。

## 运行环境

- macOS 12 或更高版本
- Node.js 22
- pnpm 10.18.0
- 可用的 MySQL 数据库
- Manus 项目运行环境（用于 OAuth 与内置大模型）

## 本地运行

1. 安装 Node.js：<https://nodejs.org/>
2. 安装 pnpm：

   ```bash
   corepack enable
   corepack prepare pnpm@10.18.0 --activate
   ```

3. 在 Terminal 中进入项目目录并安装依赖：

   ```bash
   cd frameflow
   pnpm install --frozen-lockfile
   ```

4. 按照项目平台的环境变量配置数据库、OAuth、Manus Service API 和 Stripe。密钥不要写入前端代码，也不要提交到 Git。
5. 初始化数据库并启动：

   ```bash
   pnpm db:migrate
   pnpm dev
   ```

6. 用浏览器打开 `http://localhost:3000`。

## 生产构建

```bash
pnpm check
pnpm build
pnpm start
```

此压缩包在当前环境尚未重新完成 TypeScript 检查和生产构建。由于 OAuth、云数据库、内置大模型和 Stripe 都需要平台运行时配置，双击压缩包不能直接离线启动。
