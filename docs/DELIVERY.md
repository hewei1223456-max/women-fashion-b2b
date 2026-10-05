# 交付说明与验收对照

> 本文件对照 PRD《第三十三节 Demo 验收标准》与三十三个章节的功能清单，逐条说明**实现位置**与**当前状态**。
> 状态口径：✅ 已实现并通过实机验证 ｜ ⚠️ 已实现但为降级/模拟实现 ｜ ❌ Demo 未覆盖（附原因与接入路径）

---

## 零、最终验收结果（2026-10-06 实测）

一条命令复现全部结果：**`pnpm verify`**（每项都在干净实例上跑，避免业务规则导致的假失败）

| 验收项 | 命令 | 结果 |
|---|---|---|
| 契约包编译 | `pnpm --filter "./packages/*" run build` | ✅ 3 包 Done |
| 后端编译 | `pnpm --filter @wfb/api run build` | ✅ 0 error TS |
| 前端类型检查 | `pnpm --filter @wfb/miniapp run typecheck` | ✅ 0 error TS |
| 后端全链路冒烟 | `node scripts/smoke-api.mjs`（**每次全新实例**） | ✅ **67 / 67 通过，0 失败** |
| 微信小程序编译 | `build:weapp` | ✅ Compiled successfully |
| 抖音小程序编译 | `build:tt` | ✅ Compiled successfully |
| 支付宝小程序编译 | `build:alipay` | ✅ Compiled successfully |
| H5 / PC Web 编译 | `build:h5` | ✅ Compiled successfully（含 index.html） |
| 产物 JS 语法合法性 | `pnpm check:bundles` | ✅ 110 个文件全部合法 |
| H5 逐页运行时校验 | `pnpm verify:pages`（Playwright + 真实 API） | ✅ **23 / 23 页面通过，0 jsError** |
| 运营后台构建 | `pnpm --filter @wfb/admin run build` | ✅ 8 条路由 |
| 运营后台运行时 | `pnpm verify:admin` | ✅ **8 / 8 页面通过** |

**接口规模**：`GET /api/routes` 共 **116 条**路由，覆盖三大模块 + UGC 互动 + 私信通知 + 推荐搜索 + 审核 + 管理后台。
**产物体积**：微信小程序主包 622.9 KB + 6 个分包共 199.6 KB（主包远低于 2 MB 限制）。
**截图存档**：`docs/screenshots/` 共 32 张（H5 主链路 23 张 + PC Web 1 张 + 后台 8 张）。

### 开发中修复的三个「构建成功但产物不可用」的静默故障

这三个问题的共同点是**退出码 0、日志显示 Compiled successfully，但产物坏了**：
只有运行态校验才能发现。详见 [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) 第 6 节。

| # | 故障 | 症状 | 修复 |
|---|---|---|---|
| 1 | Taro 默认 `terser.output.quote_keys:true` + terser 5.51 把类私有字段压成 `#"name"` | H5 产物浏览器解析即 SyntaxError，整站白屏（1182 处非法 token） | 覆盖 `h5.terser.output.quote_keys:false`，新增 `scripts/check-bundles.mjs` 守门 |
| 2 | 缺 `src/index.html` + 自定义 `h5.output.filename` | `dist/h5` 不产出 `index.html`，静态部署 404 | 补 `src/index.html`（含首屏骨架）+ 回退默认文件名 |
| 3 | Taro H5 `setStorageSync` 把值包成 `{"data":...}` | 登录后一刷新就掉登录（token 被当畸形串发出→401→前端清 token） | 存储层对称包/拆 + `http.ts` 加 token 字符白名单 |

### 演示数据的自洽性修复

原播种逻辑按索引轮转分配「风格标签 / 厂家 / 发货地」，出现「休闲基础款纯棉T恤」被标成「韩系」、
「韩系针织连衣裙」发货地是杭州（厂家在桐乡）这类**一眼假**的数据。
已改为**由标题关键词推导风格 → 由风格反推厂家 → 发货地取厂家所在城市**，
保证「标题 ↔ 风格标签 ↔ 厂家 ↔ 发货地」四者自洽，前端的风格/发货地筛选与推荐引擎的拿货地匹配才有意义。

---

## 一、PRD 验收标准逐条对照

| # | 验收项（PRD 原文） | 状态 | 实现位置 | 验证方式 |
|---|---|---|---|---|
| 1 | 多端可编译运行：微信小程序/抖音小程序/H5/PC Web 均无报错 | ✅ | `apps/miniapp`（Taro 4.3，一套代码） | `pnpm --filter @wfb/miniapp run build:weapp / build:tt / build:alipay / build:h5` 全部 `Compiled successfully` |
| 2 | 用户可登录 + 认证：授权登录，提交营业执照模拟认证 | ✅ | `apps/api/src/modules/auth/`；`apps/miniapp/src/pages/auth/` | `POST /api/auth/login` → `POST /api/auth/certify`（四步 OCR→身份证→人脸→对公打款） |
| 3 | 资讯板块可浏览：首页推荐流 → 详情 → 收藏/评论 | ✅ | `modules/content/`、`modules/interaction/`；`pages/info/` | 冒烟用例「资讯推荐流 / 内容详情 / 收藏 / 评论」 |
| 4 | 货源板块可浏览：信息流显示厂家款，可点「加微信」并记录 | ✅ | `modules/source/`、`modules/contact/`；`pages/source/` | 冒烟用例「货源推荐流 / 款详情 / contact.log 返回值+微信号」 |
| 5 | 厂家可发布款 | ✅ | `POST /api/manufacturer/product/publish`（受版本可发布款数限制）；`pages/manufacturer/publish` | 冒烟 + 后台「厂家与加微」 |
| 6 | 加微追踪可记录：店主加微后厂家后台数据更新 | ✅ | `modules/contact/`（dashboard 实算曝光/加微/转化率/趋势） | 冒烟用例「contact.log → dashboard contacts 增加」 |
| 7 | 功能板块可用：文案改写可调用 AI API 并返回结果 | ⚠️→✅ | `apps/api/src/gateway/ai.ts` + `modules/tools/` | 配 `AI_API_KEY` 走真实模型；未配则本地规则引擎（`aiPowered:false`），**接口契约与额度体系完全一致** |
| 8 | 推荐流规则排序：风格匹配 + 热度加权 + 打散 | ✅ | `apps/api/src/modules/recommend/` + `shared-utils`（`calcCesScore`/`diversify`） | 冒烟用例「10 条内 ≥2 种风格」；后台「推荐策略」页可视化中间结果 |
| 9 | 内容审核回调：文本同步审核正常返回，图片异步回调可接收 | ✅ | `modules/audit/`（`/api/audit/content` + `/api/audit/callback` 含 `echostr` 校验与 AES 解密） | 冒烟用例「敏感词拦截 / 回调接受 / echostr 回显」 |
| 10 | UGC 发布：两板块均可发布图文/视频，支持编辑/删除/置顶 | ✅ | `modules/content/`（7 天可编辑、30 天可恢复、置顶限 3 条） | 冒烟用例「发布 / 编辑 / 置顶 / 草稿箱 / 我的内容」 |
| 11 | 互动组件：点赞/评论/收藏/转发/私信/关注全部可用 | ✅ | `modules/interaction/`、`modules/message/` | 冒烟用例第 6 节整段链路 |
| 12 | 消息通知：站内信 + 小程序订阅消息可正常推送 | ⚠️ | `modules/notification/`（9 类通知全量落库 + 未读数 + 角标） | 站内信 ✅；**小程序订阅消息**需在微信公众平台申请模板 ID 后接入（`Taro.requestSubscribeMessage`），契约已留位 |
| 13 | 个人主页：可查看自己的内容/收藏/喜欢，可编辑资料 | ✅ | `modules/profile/`；`pages/profile/` | 冒烟用例「profile/2 + content/collect/likes + PUT profile」 |
| 14 | 后端 API 可访问：所有接口在 Postman 中可正常调用 | ✅ | 全部模块；统一信封 `{code,message,data}` | `node scripts/smoke-api.mjs`（约 80 用例）；`GET /api/routes` 列出全部路由 |

---

## 二、三大模块功能覆盖

### 资讯板块（PRD 第八节）

| 能力 | 状态 | 说明 |
|---|---|---|
| 行业资讯早报 / 大店方法论 / 找厂家攻略 / 踩坑案例 | ✅ | 播种 8 条早报 + 10 篇方法论 + 4 篇攻略，`visibility` 支持 elite/shark 分层 |
| 游学蒸馏资料库（按期数 + 附件下载） | ✅ | `GET /api/info/distillation?period=5`，含 PPT / 踩坑案例附件字段 |
| 讲师课程 | ✅ | 6 门课程，免费 + 付费混合，`GET /api/info/course/list` |
| 大店主页（方法论 + 往期游学 + 关注） | ✅ | `GET /api/landmark/:id`；8 家大店演示数据 |
| UGC 发布（图文 1-18 图 / 视频 / 长文） | ✅ | `POST /api/content/publish`，`board=info` |
| 内容管理（编辑/删除/置顶/数据看板/评论管理） | ✅ | 7 天编辑窗口、软删除 30 天可恢复、置顶上限 3、`/analytics` 六项指标 + 流量来源 |
| 草稿箱 / 定时发布 | ✅ | `content_drafts` 表 + `scheduledAt` 字段 |
| 推荐流（风格匹配 → CES → 打散） | ✅ | 见验收 #8 |

### 货源板块（PRD 第九节）

| 能力 | 状态 | 说明 |
|---|---|---|
| 厂家款瀑布流 + 款详情 + 加微信 | ✅ | `GET /api/source/feed` / `detail/:id` / `POST /api/contact/log` |
| 主动私信（版本配额 + 每日重置） | ✅ | 免费 10 / 基础 30 / 高级 100 / 企业无限；超限返回 `sent:false + reason` |
| 店主接收偏好（风格/价格带/上限/黑名单） | ✅ | `GET|PUT /api/contact/preference`；接收权重算法在 `shared-utils.receiveWeight` |
| 拼单广场（发起/参团/退团/成团流转） | ✅ | 参团幂等、满员拒绝、`status` 自动流转 |
| 订货会专区（含日历字段） | ✅ | `GET /api/ordering-fair/list`，`create` 受版本 `orderingFair` 限制 |
| 同频店主推荐 | ⚠️ | 推荐接口按风格标签产出候选；独立「同频店主」入口在 Demo 中并入个人主页建议列表 |
| 员工子账号 | ✅ | 受版本 `subAccounts` 限制（0/1/3/无限） |
| 加微追踪看板（曝光/加微/转化率/漏斗/趋势） | ✅ | 漏斗按版本 `dashboard` 等级决定是否返回（高级版起有值） |
| 搜索排序（四维加权） | ✅ | 返回 `scoreBreakdown` 四项分解分 |
| 厂家版本分层（9.3） | ✅ | `MANUFACTURER_PLANS` 前后端共用一份常量；DB 有 `member_plans` 表 |

### 功能板块（PRD 第十节）

10 个工具全部实现，统一 `ToolResult` 返回（`quotaUsed/quotaLimit/aiPowered/model/recommendedArticles`）：

| 工具 | 免费额度 | 未配 AI Key 时的行为 |
|---|---|---|
| 文案改写 | 3/日 | 按风格 + 平台 + 语气做结构化改写，输出标题/正文/话题 |
| 去水印 | 3/日 | 解析链接得到平台/视频 ID，返回可直接下载的地址与说明 |
| 爆款选题 | 3/日 | 按风格产出选题列表 + 每条的理由与开头钩子 |
| 账号分析 | 1/日 | 产出内容质量/粉丝画像/爆款率结构化报告 |
| 账号诊断 | 会员专属 | 深度诊断 + 优化清单 |
| 拍视频提词器 | 不限 | 文本分段 + 语速/字号参数 |
| AI 配图 | 1/日 | 返回可用图片 URL + 提示词优化建议 + 「演示模式」说明 |
| 视频剪辑 | 按次 | 模板化剪辑方案与输出规格 |
| 图片去背景 | 3/日 | 返回处理后图片地址 + 说明 |
| 运营建议 | 会员专属 | 按输入店铺数据产出诊断与动作清单 |

**AI 网关**（`apps/api/src/gateway/ai.ts`）：OpenAI 兼容协议，支持 DeepSeek / GLM / MiniMax 切换，
含 token 计量、语义缓存、2 次重试、8s 超时、失败降级。

### UGC 与互动体系（PRD 第四篇）

| 能力 | 状态 | 说明 |
|---|---|---|
| 点赞/评论（含图/@）/回复/收藏（分类夹）/转发/关注 | ✅ | 全部幂等（唯一键约束），计数双向同步 |
| 私信（会话列表/详情/发送/已读/删除，支持款卡片） | ✅ | `contentType: text/image/video/product_card` |
| 通知 9 类 + 未读数 + 底部角标 | ✅ | `Taro.setTabBarBadge` 已接 |
| 话题聚合页 | ✅ | `GET /api/topic/list`（热度按出现频次实算） |
| 个人主页四个 Tab（作品/收藏/喜欢/草稿） | ✅ | `pages/profile/`，每条内容带「...」管理菜单 |
| 打赏 | ❌ | PRD 标注为 Phase 2 |
| 投票组件 | ❌ | PRD 列为互动组件之一，未排入本次范围 |

---

## 三、多端覆盖

| 端 | 技术 | 状态 | 产物路径 |
|---|---|---|---|
| 微信小程序 | Taro 4.3 | ✅ 编译通过 | `apps/miniapp/dist/weapp` |
| 抖音小程序 | Taro 4.3 | ✅ 编译通过 | `apps/miniapp/dist/tt` |
| 支付宝小程序 | Taro 4.3 | ✅ 编译通过 | `apps/miniapp/dist/alipay` |
| H5 / 移动浏览器 | Taro 4.3 | ✅ 编译 + 可运行 | `apps/miniapp/dist/h5` |
| PC Web 用户端 | Taro H5（宽屏居中适配） | ✅ | 同上（`app.scss` 限宽 750px 居中） |
| PC 运营后台 | Next.js 16 + React 19 | ✅ 构建通过 | `apps/admin/.next` |
| iOS / Android APP | Taro RN + Expo | ❌ | 需新增 `apps/mobile` 与 Expo 工程；H5 可先作为替代交付 |

---

## 四、数据库

`docker/schema.sql` 覆盖 PRD 第九篇全部核心表，并补齐 Demo 需要的表：

| 分类 | 表 |
|---|---|
| 用户与主体 | `users`、`organizations` |
| 货源 | `manufacturer_products` |
| 内容 | `knowledge_articles`、`content_drafts`、`topics` |
| 大店与课程 | `landmark_shops`、`courses` |
| 互动 | `likes`、`comments`、`collections`、`follows`、`shares` |
| 私信与通知 | `conversations`、`messages`、`notifications` |
| 货源特有 | `wechat_contact_logs`、`contact_messages`、`receive_preferences`、`sub_accounts` |
| 组局 | `group_buys`、`group_buy_members`、`ordering_fairs`、`fair_signups` |
| 审核与合规 | `audit_logs`、`preference_signals` |
| 行为与推荐 | `behaviors`、`content_views` |
| 工具额度 | `tool_usages` |
| 支付分账 | `orders`、`profit_sharing_records`、`member_plans` |
| 看板视图 | `v_manufacturer_dashboard`、`v_content_engagement` |

共 **31 张表 + 2 个视图**。关键约束已落实：
- 点赞/收藏/关注/参团/报名均用唯一键保证幂等
- `orders.sub_mch_id` + `profit_sharing_records.ratio` 注释明确「普通服务商模式必传特约商户号」「企业商户号」「服务商分账上限 30%」
- `preference_signals` 只记录选择结果与动作类型（合规），`users.privacy_agreed_at` 留痕

---

## 五、合规实现（PRD 第八篇）

| 要求 | 实现 |
|---|---|
| 最小必要权限 | `app.config.ts` 只声明 `scope.userLocation`（用于「附近厂家/大店/订货会」），并在 `permission.desc` 写明用途 |
| 相册/相机/剪贴板按需调用 | 上传与粘贴均绑定用户点击事件；无启动时一揽子申请 |
| 设备信息用可变更 ID | 埋点用 `anonymousId`（`deviceIdOf()` 对 UA 做 sha1 截断），不关联硬件标识 |
| 人脸识别不落盘 | `certify` 只存 `faceVerifyId` 流水号，不保存原始图像 |
| 对外信息脱敏 | 统一 `toUserBrief()`，不返回手机号/openid/营业执照；`stripPrivate()` 控制本人视角 |
| 个性化推荐可关闭 | `users.pushEnabled` + 设置页开关 |
| 不同意非必要权限不影响核心服务 | 未授权定位时「附近」Tab 降级为按城市筛选，其余功能不受影响 |

---

## 六、已知边界与后续接入清单

| # | 边界 | 现状 | 接入路径 |
|---|---|---|---|
| 1 | 数据为内存态 | `DATA_DRIVER=memory` 内置演示数据，重启回到播种态 | 按 `Store` 接口实现 MySQL 仓储，`DATA_DRIVER=mysql` 生效（DDL 已就绪） |
| 2 | AI 为降级实现 | 无 `AI_API_KEY` 时走本地规则引擎 | 在 `.env` 填 `AI_API_KEY`（及可选 `AI_BASE_URL`）即升级为真实模型 |
| 3 | 微信/抖音/支付宝登录 | 演示账号通道（`demoUserId`）；`platform + loginCode` 已留参数 | 填入 AppID/Secret，实现 `code2session` 即可 |
| 4 | 内容安全供应商 | `CONTENT_SECURITY_PROVIDER=mock`（本地敏感词库 + 回调入口已实现） | 切真实供应商并配 `WX_CONTENT_SECURITY_TOKEN` / `AES_KEY` |
| 5 | 支付与分账 | 表结构 + 比例约束已就绪，未接支付通道 | 微信支付普通服务商模式：传入特约商户号发起，分账前需 7 个工作日审核；过渡方案用「平台代收 + 线下结算」 |
| 6 | 订阅消息 | 站内信已通；订阅消息需模板 ID | 微信公众平台申请模板 → `Taro.requestSubscribeMessage` → 后端调用发送接口 |
| 7 | 去水印/视频剪辑/账号分析 | 依赖第三方解析与平台开放接口，Demo 输出结构化结果 | 接入解析服务与平台 API 后替换 `tools` 模块实现，契约不变 |
| 8 | APP 端 | 未编译 | 复用 `packages/*` 与 Taro RN，新增 `apps/mobile` + Expo |
| 9 | 推荐 Phase 2/3 | 未实现（PRD 计划 3-12 个月后） | 双塔召回 + Wide&Deep：`manufacturer_products.style_vector` 与 `behaviors` 表已为训练预留字段 |
| 10 | 图片托管 | 演示图走 picsum CDN | 接 OSS：`UPLOAD_DRIVER=oss` + 直传签名 |

---

## 七、如何独立验收

```bash
# 0) 准备
pnpm install
pnpm --filter "./packages/*" run build

# 1) 一键全量验收（推荐，含浏览器运行时校验）
pnpm dev:api &        # 后端 3100（Windows 用两个终端分别执行）
pnpm serve:demo &     # 单端口演示服务器 8099
pnpm verify           # 11 项全量验收

# 2) 或分步执行
pnpm verify:fast                              # 编译 + 类型 + 全新实例冒烟
node scripts/smoke-api.mjs http://localhost:3100
pnpm check:bundles
pnpm verify:pages                             # H5 逐页（截图存 docs/screenshots）
pnpm verify:admin                             # 运营后台逐页
pnpm evidence                                 # 打印三模块验收证据
```

浏览器里可直接访问 `http://localhost:3100/api/routes` 查看当前所有已挂载路由（116 条），
与 `docs/API.md` 对照即可确认接口覆盖度。

### 手工走一遍完整用户旅程（PRD 19.5 的闭环）

1. 打开 `http://localhost:8099/`，用「杭州·小满家（主理人）」演示账号登录
2. 首页 → 点击行业早报或推荐流里的《韩系店铺夏季组货逻辑》进资讯详情
3. 详情底部「相关厂家款」→ 进入货源款详情（**资讯→货源 联动**）
4. 点击「加微信」→ 弹出微信号 + 4 个后续动作建议（生成海报 / 去背景 / 写文案 / 剪视频）
5. 点「一键生成商品主图」→ 跳转 AI 配图工具，自动带入款图（**货源→功能 联动**）
6. 工具结果页底部「推荐阅读」→ 回到资讯（**功能→资讯 联动**）
7. 切到 `http://localhost:8099/admin/`，用「七叔（平台运营）」登录
   → 「厂家与加微」页确认刚才的加微记录已进入看板，「推荐策略」页查看规则引擎的中间结果

---

## 八、最终交付清单

| 类别 | 内容 |
|---|---|
| 后端 | `apps/api` — 116 条路由，21 个业务模块，零原生依赖，Go-live 零中间件 |
| 移动端（一套代码四端） | `apps/miniapp` — 50 个页面（主包 26 + 6 个分包 24）、26 个共享组件 |
| 运营后台 | `apps/admin` — 8 个页面（概览 KPI / 内容复审 / 用户 / 认证 / 厂家加微 / 推荐策略 / 内容互动） |
| 契约层 | `packages/{shared-types,shared-utils,shared-api}` |
| 数据库 | `docker/schema.sql` — 31 张表 + 2 个看板视图 + 版本权益种子数据 |
| 部署 | `docker/{docker-compose.yml,api.Dockerfile,nginx.conf}` |
| 文档 | `docs/{PRD,API,ARCHITECTURE,DEPLOY,DELIVERY}.md` + 32 张截图 |
| 验收脚本 | `scripts/{verify-all,smoke-api,verify-pages,verify-admin,check-bundles,acceptance-evidence,serve-demo}.mjs` |
