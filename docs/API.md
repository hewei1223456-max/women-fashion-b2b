# API 契约说明书（Demo 版）

> 这是全仓库**唯一的接口事实来源**。后端实现必须严格匹配，前端只按此调用。
> 类型定义在 `packages/shared-types/src/`，客户端在 `packages/shared-api/src/client.ts`。
> 改动流程：**先改 shared-types → 再改 backend → 再改前端**。

## 0. 通用约定

- **Base URL**：本地 `http://localhost:3000`；H5 端通过 `TARO_APP_API` 注入。
- **统一信封**：所有接口都返回 `{ code, message, data }`，`code === 0` 为成功。
  - 失败示例：`{ "code": 401, "message": "请先登录", "data": null }`
  - HTTP 状态码保持语义化（200/400/401/403/404/500），业务错误以 `code` 为准。
- **鉴权**：`Authorization: Bearer <token>`。除标注 `[公开]` 的接口外均需登录。
- **分页**：统一 `{ list, page, pageSize, total, hasMore }`。
- **时间**：ISO 8601 字符串（`2026-10-05T12:00:00.000Z`）。
- **图片**：Demo 用 `https://picsum.photos/seed/<seed>/600/800` 这类稳定外链；生产替换为 OSS URL。
- **演示账号**：`GET /api/auth/demo-accounts` 返回种子用户，`POST /api/auth/login { demoUserId }` 一键登录。

## 1. 系统

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | `[公开]` 健康检查：`{ status, driver, uptime, version, time }` |
| GET | `/api/system/stats` | 各表行数统计 |

## 2. 认证 / 用户

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/auth/demo-accounts` | `[公开]` 演示账号列表（店主/厂家/大店/讲师/运营） |
| POST | `/api/auth/login` | `[公开]` `LoginDto` → `LoginResult`。支持 `phone+code` / `demoUserId` / `platform+loginCode` |
| GET | `/api/auth/me` | 当前用户 |
| POST | `/api/auth/logout` | 退出 |
| POST | `/api/auth/certify` | 提交认证 `CertifyDto` → `CertifyResult`（OCR→身份证→人脸→对公打款四步流转） |
| GET | `/api/auth/certify/status` | 认证进度与步骤 |

## 3. 个人主页

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/profile/:userId` | `ProfileDetail` |
| PUT | `/api/profile` | `UpdateProfileDto` → `User` |
| GET | `/api/profile/:userId/content` | 作品（`?tab=works\|draft`） |
| GET | `/api/profile/:userId/collect` | 收藏 |
| GET | `/api/profile/:userId/likes` | 喜欢 |
| GET | `/api/profile/:userId/followers` | 粉丝 |
| GET | `/api/profile/:userId/following` | 关注 |

## 4. 资讯板块

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/info/feed` | `FeedQuery` → `FeedResult<ArticleSummary>`，含 `strategy/coldStart/visitCount` |
| GET | `/api/info/detail/:id` | `ArticleDetail`（含 `relatedProducts` 资讯→货源联动、`toolEntries` 联动入口） |
| GET | `/api/info/distillation` | `?period=5` 游学蒸馏资料，按期数分类 |
| GET | `/api/info/course/list` | `?category=组货` 课程列表 |
| GET | `/api/info/course/:id` | 课程详情 |
| GET | `/api/info/search` | `?keyword=陈列` → `SearchResult` |

**FeedQuery**：`tab=recommend|follow|city|style|topic`、`styleTags=韩系,法式`、`topic`、`city`、`type`、`keyword`、`page`、`pageSize`。

## 5. 地标大店

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/landmark/list` | `?city=杭州` |
| GET | `/api/landmark/:id` | 大店主页：信息 + 方法论列表 + 关注态 |

## 6. 货源板块

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/source/feed` | `SourceFeedQuery` → `FeedResult<Product>` |
| GET | `/api/source/detail/:id` | 款详情（含 `related` 相似款、`toolEntries` 一键生成海报入口） |
| GET | `/api/source/search` | `?keyword=碎花&style=法式&priceBand=200-500&shipFrom=杭州` |
| GET | `/api/source/manufacturers` | 厂家列表（带 `productCount` / `contactRate`） |
| POST | `/api/manufacturer/product/publish` | 厂家发布款 `PublishProductDto`（受版本可发布款数限制） |
| GET | `/api/manufacturer/product/my` | 我的款 |
| PUT/DELETE | `/api/manufacturer/product/:id` | 编辑 / 删除 |

## 7. 加微与厂家看板

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/contact/log` | 店主点击「加微信」→ 记录 + 返回微信号与后续动作建议 |
| GET | `/api/contact/preference` | 店主接收偏好 |
| PUT | `/api/contact/preference` | 保存接收偏好（风格/价格带/每日上限/黑名单） |
| GET | `/api/manufacturer/contact/dashboard` | `DashboardAnalytics`（曝光/加微/转化率/漏斗/趋势/配额） |
| POST | `/api/manufacturer/contact/send` | 厂家主动私信（受每日配额限制，超限返回 `sent:false` + `reason`） |
| GET | `/api/manufacturer/contact/list` | 加微记录列表（可改跟进状态） |
| GET/POST/DELETE | `/api/manufacturer/sub-account/*` | 子账号管理（受版本子账号数限制） |

## 8. 内容发布与管理（两板块通用）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/content/publish` | `PublishContentDto` → `PublishResult`（同步文本审核 + 异步媒体任务号） |
| PUT | `/api/content/:id` | 编辑（7 天内可编辑，否则 `code=403`） |
| DELETE | `/api/content/:id` | 软删除，返回 `restorableUntil`（30 天） |
| POST | `/api/content/:id/restore` | 恢复 |
| GET | `/api/content/my` | `?board=info\|source&sort=time\|view\|interaction` |
| PUT | `/api/content/:id/top` | 置顶（最多 3 条） |
| GET | `/api/content/:id/analytics` | `ContentAnalytics` 数据看板 |
| POST/GET | `/api/content/draft` | 保存 / 获取草稿 |
| DELETE | `/api/content/draft/:id` | 删除草稿 |

## 9. 互动组件

| 方法 | 路径 | 说明 |
|---|---|---|
| POST/DELETE | `/api/interaction/like` | `LikeDto` → `InteractionState` |
| POST | `/api/interaction/comment` | 评论 / 回复（`parentId`）/ 带图 / `mentions` |
| DELETE | `/api/interaction/comment/:id` | 删除评论 |
| GET | `/api/interaction/comments/:type/:id` | 评论列表（`?sort=hot\|time`，二级回复内联） |
| POST/DELETE | `/api/interaction/collect` | 收藏 / 取消（支持 `folderName`） |
| POST | `/api/interaction/share` | 转发记录（`channel: wechat\|moments\|group\|link`） |
| POST/DELETE | `/api/interaction/follow` | 关注 / 取消 |
| GET | `/api/interaction/likes/:type/:id` | 点赞列表 |

## 10. 私信与通知

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/message/conversations` | 会话列表（带未读数） |
| GET | `/api/message/conversation/:id` | 会话详情 + 消息 |
| POST | `/api/message/send` | 发消息（text/image/video/product_card） |
| PUT | `/api/message/read/:id` | 标记已读 |
| DELETE | `/api/message/conversation/:id` | 删除会话 |
| GET | `/api/notification/list` | 通知列表（`?type=like&unreadOnly=true`） |
| PUT | `/api/notification/read/:id` | 标记已读 |
| PUT | `/api/notification/read-all` | 全部已读 |
| GET | `/api/notification/unread-count` | `{ notification, message, total }` |

## 11. 拼单 / 订货会 / 话题

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/groupbuy/create` | 发起拼单 |
| GET | `/api/groupbuy/list` | 广场（`?styleTag=韩系`） |
| GET | `/api/groupbuy/detail/:id` | 详情 |
| POST | `/api/groupbuy/join/:id` | 参团 |
| POST | `/api/groupbuy/quit/:id` | 退团 |
| GET | `/api/groupbuy/mine` | 我的拼单 |
| GET | `/api/ordering-fair/list` | 订货会专区（`?city=杭州`） |
| GET | `/api/ordering-fair/detail/:id` | 详情 |
| POST | `/api/ordering-fair/create` | 发布订货会（高级版以上） |
| POST | `/api/ordering-fair/signup/:id` | 报名 |
| GET | `/api/topic/list` | 话题榜 |
| GET | `/api/topic/detail/:tag` | 话题聚合（资讯 + 货源） |

## 11.5 组局（参考「闪动」）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/meetup/list` | 组局列表（`?kind=sourcing\|production\|study\|exchange`、`city`、`status`） |
| GET | `/api/meetup/detail/:id` | 组局详情（含关联的资讯流内容 `article`） |
| POST | `/api/meetup/create` | 发起组局（**同时发一条资讯流内容**，让组局能被首页推荐到） |
| POST | `/api/meetup/join/:id` | 报名（校验人数上限与是否已结束；幂等） |
| POST | `/api/meetup/quit/:id` | 取消报名（发起人不能退，需取消组局） |
| GET | `/api/meetup/mine` | 我发起的 + 我报名的 |

**组局与拼单的区别**：拼单只凑量压价，组局是**线下一起行动**，因此 `Meetup` 必须带齐：
`city` / `venue` / `gatheringPoint`（集合点）/ `startAt` / `endAt` / `signupMethod`（报名方式）/
`signupRequirement`（报名条件）/ `capacity` / `joinedCount` / `fee` / `targetAudience`。

## 11.6 身份标识与偏好画像

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/auth/preference` | 读取当前用户偏好画像（未填过返回 `null`） |
| POST | `/api/auth/preference` | 提交「想跟谁学 / 想看什么内容 / 想要什么货源 / 想要什么厂家」四组多选 |
| POST | `/api/auth/switch` | **Demo 专用**：切换身份，返回新的 `{token, user}`（普通用户不可切到 admin） |

**身份标识**：`UserBrief.badges` 由后端 `buildBadges()` 统一计算，前端只负责渲染。
「认证」与「付费」是两个独立维度，可以叠加（蓝 + 金）：

| 标识 | 触发条件 | 颜色 |
|---|---|---|
| 游客 guest | 未认证且未付费 | 灰 |
| 认证店主 certified_owner | `role=shop_owner` 且 `certStatus=approved` | 蓝 |
| 付费店主 paid_owner | 且 `memberLevel ∈ {elite, shark, tour}` | 金 |
| 认证厂家 certified_manufacturer | `role=manufacturer` 且已认证 | 蓝 |
| 付费厂家 paid_manufacturer | 且 `memberLevel` 命中厂家付费版本 | 金 |
| 地标大店 landmark / 内容讲师 lecturer | `role` 命中 | 紫 |
| 官方 official | `role=admin` | 橙 |

> ⚠️ `badges` 挂在 **UserBrief** 上（列表作者、评论区、个人主页的 `user` 字段），
> 登录返回的完整 `User` 不含；「我的」页请用 `api.profile.detail(userId).user.badges`。

## 12. 功能板块（10 个工具）

全部返回 `ToolResult`。**未配置 `AI_API_KEY` 时自动降级为本地规则引擎**，`aiPowered:false`，流程与 UI 完全可用。
AI 网关支持 DeepSeek / GLM / MiniMax 切换，含 Token 计量、语义缓存、错误重试、超时控制、模型降级。

| 方法 | 路径 | 免费额度/日 |
|---|---|---|
| POST | `/api/tools/rewrite` | 3 |
| POST | `/api/tools/remove-watermark` | 3 |
| POST | `/api/tools/trending` | 3 |
| POST | `/api/tools/account-analysis` | 1 |
| POST | `/api/tools/account-diagnosis` | 0（会员/按次） |
| POST | `/api/tools/generate-image` | 1 |
| POST | `/api/tools/remove-bg` | 3 |
| POST | `/api/tools/operation-advice` | 0（会员） |
| POST | `/api/tools/teleprompter` | 不限 |
| POST | `/api/tools/video-edit` | 0（按次） |
| GET | `/api/tools/quota` | 今日各工具用量 |

超额度返回 `{ code: 429, message: "今日免费额度已用完，开通会员可无限使用" }`。

## 13. 推荐 / 搜索

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/recommend/feed` | `?board=info\|source` 规则引擎结果 |
| GET | `/api/recommend/meta` | 当前策略说明（冷启动/探索打散规则） |
| GET | `/api/search` | 综合搜索（资讯 + 货源 + 厂家），带 `scoreBreakdown` |
| GET | `/api/search/hot-keywords` | 热搜词 |

**资讯推荐**：风格匹配 → CES 热度加权（评论35% 收藏28% 完读18% 分享12% 点赞7%）→ 每 10 条至少 2 条不同风格。
**货源推荐**：风格+价格带+拿货地匹配 → 加微转化率加权 → 每 10 条至少 2 个不同风格 + 1 个不同发货地。
**冷启动**：前 3 次访问混合 3-5 种风格，第 4 次起收敛；无行为新用户走「近 7 日加微转化率最高」热门通道。

## 14. 内容安全审核

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/audit/content` | `[公开]` 同步文本审核 `{ text, scene }` |
| GET | `/api/audit/queue` | 人工复审队列 |
| POST | `/api/audit/review` | 复审结论（pass/reject + 原因） |
| POST | `/api/audit/callback` | `[公开]` 微信 `mediaCheckAsync` / `msgSecCheck` V2 回调入口（支持明文与 AES 加密） |
| GET | `/api/audit/callback` | `[公开]` 微信服务器 URL 校验（回显 `echostr`） |

审核流转：`pending` → 文本同步通过 → 媒体异步回调 → `approved` / `rejected`（进人工复审）。

## 15. 管理后台

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/overview` | `AdminOverview`（含第十三篇核心指标 KPI 达成情况） |
| GET | `/api/admin/users` | 用户列表（角色/认证状态/关键词筛选） |
| POST | `/api/admin/cert/:userId` | 认证审批 `{ action: approve\|reject, reason? }` |
| POST | `/api/admin/content/:id/review` | 内容复审 |
| POST | `/api/admin/seed` | 重置演示数据 |

## 16. 智谱式降级说明（Demo 友好性设计）

| 依赖 | 缺失时的行为 |
|---|---|
| MySQL | `DATA_DRIVER=memory` 使用内置演示数据（默认），无需任何外部服务 |
| AI API Key | 功能板块走本地规则引擎，`aiPowered:false`，UI/流程完整 |
| Redis | 配额计数降级为进程内 Map，`/api/health` 中标注 |
| 微信/抖音/支付宝凭证 | 登录走 `demoUserId` 通道；内容安全走 `mock` 供应商 |
| OSS | 上传走本地 `uploads/` 目录并由 API 静态托管 |
