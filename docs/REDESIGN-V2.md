# 改版规格 v2（按用户反馈）

> 本文件记录 2026-10-06 用户反馈后的改版范围与验收口径。
> 契约以 `packages/shared-types/src/` 为准，接口以 `docs/API.md` 为准。

## 一、用户反馈原文要点 → 对应改动

| # | 用户原话要点 | 改动 |
|---|---|---|
| 1 | 「第一页的资讯里面就只剩下游学了」 | 首页不再是「工具聚合」，改为**资讯信息流**（UGC 社区形态） |
| 2 | 「让用户能够自己生产内容、互动、组局」 | 补 UGC 内容类型：**组局 meetup / 行业吐槽 rant / 拿货实评 review**；补组局一等公民模型 |
| 3 | 「工具放的太置顶了，它应该只属于功能模块」「把快捷工具移到功能那个来，不要占核心位置」 | 首页移除「快捷工具」大区块；工具能力全部收进**功能** Tab，首页只在底部留一行轻量入口 |
| 4 | 「右下角应该是资讯、货源、功能」「把首页改成资讯」 | 底部 Tab 第一项由「首页」改为**资讯** |
| 5 | 「上面还有行业大咖分享，认证店主有专门标识、付费店主、付费厂家、免费厂家、游客都有标识」 | 新增 **UserBadge** 身份标识体系；列表/详情/评论区全部展示 |
| 6 | 「组局参考闪动：时间、地点、集合地点、报名方式、报名条件」 | 新增 **Meetup** 模型（含 gatheringPoint / signupMethod / signupRequirement / capacity） |
| 7 | 「款的照片数量太少了，多生成一些」 | 演示款从 24 条扩到 **60 条**，每条 3-6 张图 |
| 8 | 「价格根本不符合真实」 | 改真实批发价区间；价格带改「拿货价」口径 |
| 9 | 「第一个是拿货价，第二个是起提量价，第三个是否支持拼单，第四个是否有档口」 | Product 新增 `wholesalePrice` / `tierPrices` / `supportsGroupBuy` / `stallType` |
| 10 | 「还有一行叫是否有档口、无档口、纯工厂、纯展厅」「实际视频实拍」 | `stallType`（纯工厂/纯展厅/有档口/工厂+档口）+ `capabilities`（现货/自有版房/可贴牌…） |
| 11 | 「不应该叫发货点，应该叫拿货地或产业带」 | 文案统一改为**拿货地**（`market` 字段承载产业带） |
| 12 | 「浏览器上打开就是这样，需要调整比例」 | 修 H5 根字号缺失导致的 2.4 倍缩小 + PC 端不居中 |
| 13 | 「做登录界面的验证：输出名字、开店城市、店名、上传营业执照、滑块验证、选择想学什么/想看什么/想要什么货源」 | 登录后**引导式认证流程**：基础信息 → 营业执照上传 → 滑块验证 → 偏好选择 |
| 14 | 「我需要单独一个厂家端后台，可以切换视角」 | 新增**视角切换**（店主端 / 厂家端）+ 厂家工作台 |
| 15 | 「厂家后台要演示能发布多少款、上传方式不限」 | 厂家工作台展示**版本配额**（已发布/上限）与发布入口 |

## 二、数据契约变更（已落地在 shared-types）

### 2.1 Product 新增字段

```ts
wholesalePrice: number;          // ① 拿货价（单件起拿单价，元）
tierPrices: TierPrice[];         // ② 起提量价（阶梯价）
supportsGroupBuy: boolean;       // ③ 是否支持拼单拿货/做货
groupBuyMinQty?: number;         //    拼单最小成团件数
supportsDropship: boolean;       //    是否支持一件代发
dropshipPrice?: number;          //    代发价
stallType: StallType;            // ④ 档口形态：factory|showroom|stall|factory_stall
stallAddress?: string;           //    档口/工厂具体位置
capabilities: ProductCapability[]; // 现货/期货/自有版房/可贴牌/支持打样/小批量/快速返单/支持验货
market?: string;                 //    拿货地（产业带）
fabric?: string;                 //    面料成分
sizes?: string[];                //    尺码
colorCount?: number;             //    颜色数
listedAt?: string;               //    上新时间
```

**卡片信息层级（货源列表必须按这个顺序展示）**：
1. 款图 + 款名
2. **拿货价**（醒目，`¥{wholesalePrice} 起`）
3. **起提量价**（`{moq} 件 ¥{price}`，有阶梯价时展示 2-3 档）
4. **是否支持拼单拿货**（支持则显示「可拼单 · {groupBuyMinQty}件成团」）
5. **档口形态**（纯工厂 / 纯展厅 / 有档口 / 工厂+档口）
6. **拿货地**（产业带，如 十三行 / 南油 / 濮院）
7. 实力标签（现货/自有版房/可贴牌…）

筛选栏文案：「拿货地」而不是「发货地」；价格带按拿货价区间。

### 2.2 UserBadge 身份标识

```ts
badges: UserBadge[]; // UserBrief 新增
// key: guest | certified_owner | paid_owner | certified_manufacturer |
//      paid_manufacturer | landmark | lecturer | official
```

规则（后端 `buildBadges(user)` 统一计算，前端只渲染）：
- `role=shop_owner` + `certStatus=approved` → `certified_owner`（蓝）
- 且 `memberLevel ∈ {elite, shark, tour}` → 追加 `paid_owner`（金）
- `role=manufacturer` + `certStatus=approved` → `certified_manufacturer`（蓝）
- 且 `memberLevel ∈ {manufacturer_basic, manufacturer_pro, manufacturer_enterprise}` → 追加 `paid_manufacturer`（金）
- `role=landmark` → `landmark`（紫）；`role=lecturer` → `lecturer`（紫）；`role=admin` → `official`（橙）
- 未认证且无付费 → `guest`（灰）

### 2.3 Meetup（组局）

见 `packages/shared-types/src/models.ts` 的 `Meetup`。必填要素：
`city / venue / gatheringPoint / startAt / endAt / signupMethod / signupRequirement / capacity`。

发布组局时**同时发一条资讯流内容**（`contentType='meetup'`），让组局能被首页推荐到。

### 2.4 BuyerPreference（登录引导偏好）

`learnFrom / contentInterests / sourcingNeeds / manufacturerNeeds` 四组多选。
用于冷启动推荐画像，落 `users.preference`。

## 三、接口变更

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/preference` | 提交偏好画像 |
| GET | `/api/auth/preference` | 读取偏好画像 |
| POST | `/api/auth/switch` | Demo 专用：切换身份，返回新的 token + user |
| GET | `/api/meetup/list` | 组局列表（`kind`/`city`/`status` 过滤） |
| GET | `/api/meetup/detail/:id` | 组局详情 |
| POST | `/api/meetup/create` | 发起组局（同时发资讯流内容） |
| POST | `/api/meetup/join/:id` | 报名（校验 capacity 与 signupRequirement） |
| POST | `/api/meetup/quit/:id` | 取消报名 |
| GET | `/api/meetup/mine` | 我发起的 / 我报名的 |

`GET /api/source/feed` 返回值新增上述 Product 字段；筛选参数新增
`market`（拿货地）、`stallType`、`supportsGroupBuy`、`wholesalePriceMin/Max`。

## 四、前端信息架构（改版后）

```
底部 Tab（4 项）
├── 资讯  pages/index/index       ← 原「首页」，改为资讯信息流
├── 货源  pages/source/index
├── 功能  pages/tools/index       ← 工具全部收在这里
└── 我的  pages/profile/index     ← 含「切换视角」
```

**资讯首页结构（自上而下）**：
1. 顶部问候 + 未读铃铛
2. 行业早报条（1 条）
3. 今日组局条（横滑，展示时间/地点/已报名）
4. 内容流 Tabs：推荐 / 关注 / 同城 / 组局 / 吐槽 / 实评
5. 信息流卡片（瀑布流或单列大卡）：作者身份标识 + 内容 + 互动
6. 底部一行轻量工具入口（不是大区块）

**「我的」页**：
- 顶部身份卡（头像 + 昵称 + **身份标识** + 认证状态）
- **视角切换**：店主端 / 厂家端（切换后底部 Tab 与菜单随之变化）
- 厂家视角额外显示：厂家工作台（版本配额、发布款、主动私信、子账号、加微看板）

**厂家工作台（pages/manufacturer/workbench）**：
- 版本卡片：当前版本 + 可发布款数（已发布 X / 上限 Y，不限则显示「不限」）
- 快捷入口：发布款 / 我的款 / 主动私信 / 子账号 / 加微看板 / 数据看板
- 待办：待复审内容、未读私信、今日加微

## 五、验收口径

1. `pnpm verify` 11 项全绿
2. 货源卡片按第二节的 7 层信息展示，且**拿货地**文案不再是「发货地」
3. 资讯流里能看到 **组局 / 吐槽 / 实评** 三类 UGC，且组局详情含时间地点集合点报名方式报名条件
4. 每条内容与评论都能看到作者**身份标识**
5. 登录后走完整引导：基础信息 → 营业执照 → 滑块验证 → 偏好四选
6. 「我的」页可切换店主端/厂家端，切换后信息架构确实变化
7. PC 端内容居中 750px（`x=345 @1440`），字号正常
