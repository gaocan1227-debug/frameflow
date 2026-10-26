# 帧序商业化闭环实施计划

## 目标
将“帧序”从演示型短剧生成界面升级为可收费 SaaS 基础版：以 Manus OAuth 识别创作者，以托管 MySQL 持久化项目与版本，以 Manus LLM 生成短剧内容，以 ledger 记录点数消耗，并用 Stripe Checkout 订阅解锁 Pro 额度。

## 实施方案

- **认证**：沿用 WebDev starter 的 Manus OAuth 与 `webdev_app_session` 兼容会话，前端用 `auth.me` 初始化、刷新和退出状态；生成、项目、额度、账单路由均走受保护 procedure。
- **数据模型**：在 Drizzle 中增加 `projects`、`projectVersions`、`generationJobs`、`usageLedger`、`subscriptions`、`stripeEvents`；所有业务表以 `userId` 归属，版本保存输入、结构化 AI 输出、模型、消耗点数和时间。
- **AI**：服务端调用 `MANUS_API_URL/v1/chat/completions`，显式选择可用模型，使用严格 JSON schema 优先，失败时按规范回退到普通 JSON 文本并验证；只有成功解析并写入版本后扣点。
- **额度**：新用户初始化免费余额 100 点；每次成功生成按规格扣点，账本以幂等 reference 约束；余额不足返回可升级错误。订阅生效后按月补充 Pro 额度并记录来源。
- **支付**：启用托管 Stripe，服务端创建 Checkout Session，传入当前用户的 `customer_email`、`client_reference_id` 和 metadata；实现 `/api/stripe/webhook` 原始 body 签名校验、事件幂等与订阅 entitlement 更新。
- **前端**：保留现有“帧序”暖白/墨黑视觉，加入登录入口、账户栏、项目输入、生成状态、版本信息、点数概览、定价页和 Stripe 入口；生成后展示历史版本摘要。

## 项目结构

- `client/src/pages/Home.tsx`：创作工作台、项目选择、输入与生成状态。
- `client/src/pages/Pricing.tsx`：免费版 / Pro 定价与 Checkout 入口。
- `client/src/lib/trpc.ts`：类型安全 API 客户端。
- `drizzle/schema.ts`：用户、项目、版本、生成、额度、订阅和 Stripe 幂等表。
- `server/db.ts`：数据库连接、查询、余额和版本持久化。
- `server/routers.ts`：认证、项目、生成、用量和 Checkout procedures。
- `server/ai.ts`：Manus LLM 调用与结构化输出解析。
- `server/stripe.ts`：Checkout、签名校验和 entitlement 更新。
- `server/_core/index.ts`：健康检查与 Stripe webhook 原始 body 路由。
- `public/manus-routes.json`：前端路由清单。

## 设计

候选风格：编辑室现代主义（0.07）——极简纸张、细线分栏，强调创作流程；新粗野主义工作台（0.06）——高对比块面和硬边按钮，强调生产力；电影分镜档案馆（0.08）——暖灰底、胶片编号与节拍标记，强调可拍摄感。

选择 **电影分镜档案馆**。

- **Design Movement**：电影分镜档案馆，把脚本编辑器与拍摄现场的纸质分镜工作流融合。
- **Core Principles**：输入尽量少、状态始终可见、版本可追溯、付费价值具体化。
- **Color Philosophy**：暖纸色作为创作底板，墨黑承载文字，氧化橙用于动作与计费提示，冷蓝仅用于成功状态。
- **Layout Paradigm**：左侧项目胶片栏 + 中央叙事工作台 + 右侧“镜头规格”信息轨，不用居中营销网格。
- **Signature Elements**：帧号标签、竖向分镜刻度、橙色“REC”状态点。
- **Interaction Philosophy**：先保存输入再生成；生成中锁住重复提交；每个结果都能回到版本记录。
- **Animation**：面板以短促淡入和 1px 横向推进表达剪辑节拍；不使用连续炫技动效。
- **Typography System**：中文使用系统无衬线，英文与数字使用 IBM Plex Mono 风格的等宽字形；标题紧凑，元数据小而有层级。
- **Brand Essence**：给短剧创作者一台能把灵感推进到可拍摄分镜的工作台；清楚、克制、可靠。
- **Brand Voice**：CTA 示例：“把灵感推进到第 1 场”；额度提示：“每次生成，都留下可回溯的版本。”
- **Wordmark & Logo**：将“帧”拆成三条递进的横格，最后一格嵌入播放三角，作为帧序标记。
- **Signature Brand Color**：氧化橙 `#D96C3B`。
