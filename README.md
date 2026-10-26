# 帧序 FrameFlow

短剧创作工作台。前端使用 React、Vite 和 tRPC，服务端使用 Express、Drizzle 和 MySQL。项目可保存创作草稿、生成分集方案、记录版本与点数；登录、模型生成和订阅功能依赖外部服务。

## 本地准备

- Node.js 22，pnpm 10.18.0
- MySQL 数据库
- Manus 项目及其 OAuth、API 配置；没有这些配置时无法登录或生成内容
- 订阅功能另需 Stripe 密钥和 webhook

```bash
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
# 在 .env 中填写自己的配置，不要提交该文件
pnpm db:migrate
pnpm dev
```

访问 `http://localhost:3000`。`GET /api/health` 可检查服务进程。首次迁移前需创建数据库并填写 `DATABASE_URL`。

## 验证与构建

```bash
pnpm check
pnpm test
pnpm build
pnpm start
```

`pnpm build` 输出服务端文件到 `dist/`，静态页面到 `dist/public/`。生产环境请使用 HTTPS，并在服务端配置环境变量，不能把密钥放入 `VITE_` 变量或前端代码。Dockerfile 也使用同一套构建命令。

## 目录

| 目录 | 用途 |
| --- | --- |
| `client/` | React 页面与公共资源 |
| `server/` | API、登录、生成与支付逻辑 |
| `shared/` | 前后端共享类型和常量 |
| `drizzle/` | 数据库结构和迁移 |
| `patches/` | pnpm 依赖补丁 |

## 配置与使用边界

`.env.example` 列出所需变量，空值只是占位。Manus 服务、MySQL 和 Stripe 均须使用自己的有效配置，仓库本身不提供这些服务。`MANUS_API_BROWSER_KEY` 是供浏览器使用的公开值，其他服务密钥只应留在服务端。Stripe 结算与 webhook 需要单独配置和验证，页面显示的套餐信息不等于已开通收款。

部署前还应检查对应服务的回调地址、域名和 webhook 地址。项目中有平台专用的登录与存储代码，脱离 Manus 环境部署需要替换这些集成。
