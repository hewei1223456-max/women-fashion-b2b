# 女装B2B行业平台 · 全栈 Demo

> **认知基础设施 + 连接引擎 + 效率工具**
> 以七叔 IP 的行业认知为起点，把「地标大店方法论 + 源头厂家货源 + 店主同频组局」整合成一个多端平台。
> **不碰交易**，收入驻费 + 功能费。

按 V6.0 PRD 实现的**可运行 Demo**：三大核心模块（资讯 / 货源 / 功能）+ UGC 内容社区与互动体系 +
规则推荐引擎 + 内容安全审核 + 运营后台，一套代码编译到微信小程序 / 抖音小程序 / 支付宝小程序 / H5 / PC Web。

---

## 一、5 分钟跑起来（零外部依赖）

```bash
# 1) 安装依赖（Node ≥ 20，仓库用 pnpm 11；已配置国内镜像）
corepack enable
pnpm install

# 2) 编译契约包（apps 依赖它们的 dist）
pnpm --filter "./packages/*" run build

# 3) 启动后端 API（默认 3100；Demo 模式内置演示数据，不需要 MySQL/Redis）
pnpm dev:api
#   → 健康检查 http://localhost:3100/api/health
#   → 路由总览 http://localhost:3100/api/routes

# 4) 启动 H5 / PC Web 用户端（浏览器直接打开）
pnpm dev:h5
#   → http://localhost:10086
#   （H5 devServer 已把 /api 代理到 3100）

# 5) 启动运营后台（另一个终端）
pnpm dev:admin
#   → http://localhost:3101  → 用「七叔（平台运营）」一键登录
```

**验收自测**：
```bash
node scripts/smoke-api.mjs          # 后端全链路冒烟（约 80 个用例）
```

> ⚠️ 本机 3000 端口已被其它服务占用，所以本项目统一用 **3100**（API）/ **10086**（H5）/ **3101**（后台）。

---

## 二、编译到各端

```bash
pnpm --filter @wfb/miniapp run build:weapp    # 微信小程序 → apps/miniapp/dist/weapp
pnpm --filter @wfb/miniapp run build:tt       # 抖音小程序 → dist/tt
pnpm --filter @wfb/miniapp run build:alipay   # 支付宝小程序 → dist/alipay
pnpm --filter @wfb/miniapp run build:h5       # H5 / PC Web → dist/h5
```

- **微信**：用微信开发者工具「导入项目」指向 `apps/miniapp/dist/weapp`。
  真机调试需在 `config/index.ts` 通过 `TARO_APP_API` 注入已备案的 https 域名，
  或在开发者工具里勾选「不校验合法域名」（本地联调）。
- **抖音 / 支付宝**：分别用抖音开发者工具、支付宝小程序开发者工具导入 `dist/tt`、`dist/alipay`。
- **H5 / PC Web**：`dist/h5` 是纯静态目录，可直接丢到 Nginx / OSS / Vercel。
  宽屏下 `app.scss` 会把内容限制在 750px 居中，移动 H5 与 PC Web 同一套产物。

---

## 三、仓库结构

```
women-fashion-b2b/
├── apps/
│   ├── api/          # 后端 API：三大模块 + UGC + 推荐 + 审核 + 后台接口
│   │   └── src/
│   │       ├── core/       # HTTP 框架、Store（数据层）、演示数据播种、JWT
│   │       ├── modules/    # 业务模块（auth/content/source/tools/recommend/...）
│   │       └── gateway/    # AI 网关（DeepSeek/GLM/MiniMax 可切换，无 Key 自动降级）
│   ├── miniapp/      # Taro 4.3 多端：小程序 + H5 + PC Web（一套代码）
│   └── admin/        # Next.js 16 运营后台（复审/用户/认证/加微看板/推荐可视化）
├── packages/
│   ├── shared-types/ # ★ 契约源：枚举字典 + 实体 + 请求/响应类型
│   ├── shared-utils/ # CES 评分、探索打散、搜索权重、格式化（前后端共用）
│   └── shared-api/   # 可插拔 API 客户端（Taro 与 Web 共用同一份接口定义）
├── docker/           # MySQL 8 建表脚本（22 表 + 2 视图）+ Compose + Nginx
├── scripts/          # smoke-api.mjs（后端真实验收）
└── docs/             # PRD / 接口契约 / 架构规范 / 部署指南 / 交付对照
```

**分层原则**：契约（`shared-types`）→ 实现（api / miniapp / admin）。
改字段先改契约包，三端同时受类型保护；`shared-types` 的 `domain.ts` 里
`MANUFACTURER_PLANS` / `TOOL_FREE_QUOTA` / `CES_WEIGHTS` 等常量前后端共用一份，杜绝口径不一致。

---

## 四、三大模块与联动

| 模块 | 回答的问题 | 关键实现 |
|---|---|---|
| **资讯** | 我该怎么干 | 行业早报 / 游学蒸馏资料库 / 大店方法论 / 找厂家攻略 / 讲师课程 / 踩坑案例 + UGC 发布与内容管理 |
| **货源** | 我该找谁拿货 | 厂家款瀑布流 / 款详情 / 主动私信（版本配额）/ 接收偏好 / 拼单广场 / 订货会专区 / 加微追踪看板 / 子账号 |
| **功能** | 我该怎么拍怎么写怎么剪 | 10 个工具：文案改写 / 去水印 / 爆款选题 / 账号分析 / 账号诊断 / 提词器 / AI 配图 / 视频剪辑 / 去背景 / 运营建议 |

**三模块闭环**（PRD 19.5，接口层面已打通）：
```
资讯详情 ──relatedProducts──▶ 货源详情 ──contact.log──▶ 弹微信号 + suggestions
   ▲                                                        │
   └────────── recommendedArticles ◀── 工具结果 ◀── toolEntries（一键生成海报）
```

---

## 五、推荐与搜索（Phase 1 规则引擎，真算不是写死）

- **资讯流三层**：风格标签匹配度 → CES 热度（评论 35% / 收藏 28% / 完读 18% / 分享 12% / 点赞 7%）→ 每 10 条至少 2 种风格。
- **货源流三层**：风格 + 价格带 + 拿货地匹配 → 加微转化率加权 → 每 10 条至少 2 个不同风格 + 1 个不同发货地。
- **冷启动**：前 3 次访问混合 3-5 种风格，第 4 次起收敛；无行为新用户走「近 7 日加微转化率最高」热门通道。
- **搜索排序**：基础信息完整度 25% + 历史表现 35% + 反馈 25% + 整体表现 15%，接口返回四项分解分。

接口会返回 `strategy` 字段说明本次实际生效的规则与数值（例如「风格匹配 0.67 → CES 12.4 → 打散 2/10」），
后台「推荐策略」页把中间结果可视化，方便验证算法确实在跑。

---

## 六、内容安全与合规

- 发布链路：前端敏感词预校验 → 后端同步文本审核 → 图片/视频异步审核（5-30 分钟回调）→ 不通过进人工复审队列。
- 已实现微信 `mediaCheckAsync` / `msgSecCheck` V2 的**回调入口**（含 `echostr` URL 校验与 AES 解密），
  真实接入需在微信公众平台「开发 → 开发设置 → 消息推送」配置服务器地址与 Token（见 `docs/DEPLOY.md`）。
- 隐私设计：对外返回用户信息一律脱敏（不含手机号 / openid / 营业执照）；偏好信号只记录选择结果与动作类型；
  个性化推荐提供关闭开关（`pushEnabled`）；权限按场景动态申请，不做启动时一揽子申请。

---

## 七、降级设计（Demo 友好性）

| 依赖 | 缺失时的行为 |
|---|---|
| MySQL | `DATA_DRIVER=memory` 使用内置演示数据（默认），秒起，无需任何中间件 |
| AI API Key | 10 个工具全部走本地规则引擎，`aiPowered:false` + 「演示模式」提示，结果仍有真实内容 |
| Redis | 配额计数降级为进程内 Map，`/api/health` 中标注 |
| 微信/抖音/支付宝凭证 | 登录走演示账号通道；内容安全走 `mock` 供应商 |
| OSS | 上传走本地 `uploads/` 并由 API 静态托管 |

所以：**一个 `pnpm install` + 两条启动命令就能演示全部功能**，不需要任何云资源。

---

## 八、文档

| 文档 | 内容 |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | V6.0 需求原文（唯一需求依据） |
| [`docs/API.md`](docs/API.md) | 全部接口契约与统一响应约定 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 工程规范、跨端红线、页面清单、提交前自检 |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | 本地 / Docker / 云服务器部署、公网可访问、小程序提审 |
| [`docs/DELIVERY.md`](docs/DELIVERY.md) | PRD 验收标准逐条对照 + 已知边界 |

---

## 九、常用命令

```bash
pnpm install                                  # 安装
pnpm --filter "./packages/*" run build        # 编译契约包（改契约后必跑）
pnpm dev:api                                  # 后端（3100）
pnpm dev:h5                                   # H5/PC Web（10086）
pnpm dev:admin                                # 运营后台（3101）
pnpm build                                    # 全量构建
pnpm typecheck                                # 全量类型检查
node scripts/smoke-api.mjs                    # 后端冒烟验收
```

---

## 十、已知边界（Demo 阶段）

1. **数据是内存态**：重启 API 会回到播种数据；切 MySQL 执行 `docker/schema.sql` 即可持久化。
2. **支付与分账未接真实通道**：DDL、订单/分账表结构与比例约束（企业商户号、服务商分账上限 30%）已落地，
   API 层留待接入微信支付普通服务商模式。
3. **APP 端（iOS/Android）未编译**：Taro RN 需要额外 `apps/mobile` 与 Expo 工程；
   当前 H5 产物可先作为移动端网页交付。
4. **去水印 / 视频剪辑 / 账号分析**依赖外部第三方解析服务与平台开放接口，Demo 用规则引擎给出结构化结果。
5. **AI 相关能力在无 Key 时为降级实现**：接口契约、额度体系、计量与缓存逻辑完整，接入真实 Key 即升级为真实 AI。
