# 架构与开发规范

> 本文件是**所有开发者（含 AI Agent）的强制约定**。开始写代码前必须读完。
> 契约以 `packages/shared-types/src/` 与 `docs/API.md` 为唯一来源。

## 1. 仓库结构

```
women-fashion-b2b/
├── apps/
│   ├── api/          # 后端 API（Node HTTP + TypeScript，零原生依赖）
│   ├── miniapp/      # Taro 4.3 多端（微信/抖音/支付宝小程序 + H5）
│   └── admin/        # Next.js 16 管理后台（运营 + 厂家后台）
├── packages/
│   ├── shared-types/ # 契约源：枚举字典 + 实体 + 请求/响应类型
│   ├── shared-utils/ # 纯函数：CES 评分、打散、搜索权重、格式化
│   └── shared-api/   # 可插拔 API 客户端（Taro/Web 共用同一份接口定义）
├── docker/           # docker-compose（MySQL/Redis/RabbitMQ/ES）
├── scripts/          # 验收脚本
└── docs/             # 本目录
```

**端口约定（重要）**：API 用 **3100**（3000 被本机 `one-api` 占用），Taro H5 devServer 用 **10086**，管理后台用 **3101**。

## 2. 后端开发规范（apps/api）

### 2.1 为什么不用 NestJS 装饰器

需求文档指定 NestJS。本 Demo 采用**同构的模块化架构**但去掉装饰器与 `reflect-metadata`：
Node 26 + pnpm 严格依赖布局下，装饰器元数据链（`emitDecoratorMetadata` + peer 解析）是最大的安装/运行风险源，
而业务价值在模块本身。控制器写法与 NestJS 一一对应：

| NestJS | 本项目 |
|---|---|
| `@Controller('info')` + `@Get()` | `router.get('/api/info/feed', handler)` |
| `@Query() q: FeedQuery` | `ctx.str('styleTags')` / `ctx.pagination()` |
| `@Param('id') id` | `ctx.num('id')`（`/api/info/detail/:id` 自动注入 params） |
| `@Body() dto: Dto` | `ctx.str()` / `ctx.arr()` / `ctx.obj()` |
| `@UseGuards(JwtAuthGuard)` | 路由第三参数 `{ auth: false }` 声明公开；默认需登录 |
| `HttpException` | `throw Errors.notFound('内容不存在')` |
| `Interceptor` 统一信封 | `ctx.json(data)` → 自动包成 `{ code, message, data }` |
| `AppModule imports: []` | `src/main.ts` 的 `MODULES` 数组 |
| Swagger | `/api/routes` 内置路由表 |

### 2.2 模块目录规范

```
apps/api/src/modules/<模块名>/
├── register.ts   # 必需：export function registerXxxModule(router: Router, store: Store)
├── service.ts    # 业务逻辑（纯函数或类，不碰 ctx）
└── README.md     # 可选：模块说明
```

**关键约束**：
- `register.ts` 只做「路由声明 + 参数校验 + 调用 service + 返回数据」，业务逻辑放 `service.ts`。
- 不要自己 `res.end()`；直接 `return data`，框架统一包信封。
- 需要登录用 `ctx.auth()`；需要角色用 `ctx.role('manufacturer')`。
- 分页统一 `ctx.pagination()` + `pageOf(rows, page, pageSize)`（`core/db.ts`）。
- 对外返回用户信息必须用 `toUserBrief(user)`（`core/security.ts`），**禁止把 User 原样返回给他人**（含手机号/openid）。
- 新增模块后在 `main.ts` 的 `MODULES` 里注册。

### 2.3 数据访问

所有数据在 `Store`（`core/db.ts`）的 Map 里，演示数据由 `core/seed.ts` 播种。
- 新增表：在 `core/db.ts` 的 `Store` 接口加 Map、在 `createStore` 初始化、在 `syncSequences` 登记。
- 取 ID 一律 `nextId(store, '表名')`。
- 排序/分页用 `core/db.ts` 的 `all/byId/pageOf/byTimeDesc`。

### 2.4 响应式示例

```ts
// modules/info/register.ts
import type { Router } from '../../core/server';
import { Errors } from '../../core/server';
import type { Store } from '../../core/db';
import { pageOf } from '../../core/db';
import { toUserBrief } from '../../core/security';
import { buildInfoFeed } from './service';

export function registerInfoModule(router: Router, store: Store) {
  router.get('/api/info/feed', (ctx) => {
    const { page, pageSize } = ctx.pagination(10);
    const styleTags = ctx.arr<string>('styleTags');
    const rows = buildInfoFeed(store, { page, pageSize, styleTags });
    return { ...rows, strategy: '风格匹配 → CES 热度 → 探索打散', coldStart: false, visitCount: 1 };
  }, { summary: '资讯推荐流' });

  router.get('/api/info/detail/:id', (ctx) => {
    const id = ctx.num('id', { required: true });
    const row = store.articles.get(id);
    if (!row || row.deleted) throw Errors.notFound('内容不存在或已删除');
    return { ...row, author: toUserBrief(store.users.get(row.authorId)) };
  }, { summary: '内容详情' });
}
```

## 3. 前端开发规范（apps/miniapp · Taro）

### 3.1 跨端红线（违反即编译或运行报错）

1. **只用 `@tarojs/components` 的组件**：`View Text Image ScrollView Swiper SwiperItem Input Textarea Button Picker Video Canvas WebView RichText`。
   **禁止** 任何 DOM 标签（`div/span/img/p/h1`）与非 Taro 依赖的 UI 库。
2. **事件用 Taro 的**：`onClick` `onInput` `onChange`，不写 `onMouseDown` / `onKeyDown`。
3. **API 用 `Taro.*`**：`Taro.navigateTo` / `showToast` / `showModal` / `setClipboardData` / `chooseImage` / `request`。
   不要用 `window` / `document` / `localStorage` / `location`。
4. **样式只写 SCSS + 全局工具类**（`src/styles/common.scss`）。Taro 按 750 设计稿把 `px` 转 `rpx`，
   所以样式里写 `px` 就用设计稿数值（例如 `font-size: 28px`）。
   禁止 `:hover`、`::before` 之外的高级选择器与 `position: sticky`。
5. **每个页面 4 件套**：`index.tsx` + `index.config.ts`（`definePageConfig`）+ `index.scss`（可选）+ 在 `app.config.ts` 的 `pages` 注册。
6. **图片用 `mode="aspectFill"`**，网络图必须写死宽高，避免小程序布局抖动。

### 3.2 数据请求

```tsx
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/request';

const { data, isLoading } = useQuery({ queryKey: ['info-feed'], queryFn: () => api.info.feed({ page: 1 }) });
```

- 所有接口只能通过 `@/services/request` 的 `api.*` 调用（已封装 token、错误提示、信封解包）。
- 登录态读 `useAppStore()`（`@/store/app`）。
- 写操作后 `queryClient.invalidateQueries({ queryKey: [...] })` 刷新。

### 3.3 设计系统

- 变量：`@import '@/styles/variables.scss'`（`$brand` `$text-1` `$radius` `$gap` 等）。
- 工具类（全局可用，无需引入）：`page` `page-safe` `card` `row` `row-between` `col` `flex-1`
  `t1/t2/t3` `f-xs/f-sm/f-md/f-lg/f-xl/f-xxl` `bold` `ellipsis` `ellipsis-2`
  `btn btn-primary/btn-accent/btn-ghost/btn-plain btn-sm btn-block` `tag tag-accent/tag-gray/tag-success/tag-outline`
  `avatar avatar-sm avatar-lg` `divider` `empty` `loading` `field` `field-label` `input` `textarea`
  `waterfall waterfall-col` `fixed-bottom` `safe-bottom`。
- 底部导航统一用 `@/components/TabBar`，传 `current`。

### 3.4 页面清单（页面路径 = 目录路径，`app.config.ts` 必须注册）

```
pages/index/index                 首页（三大模块聚合入口）
pages/source/index                货源首页
pages/tools/index                 功能首页
pages/profile/index               我的
pages/info/detail                 资讯详情
pages/info/distillation           游学资料库
pages/info/course                 课程列表
pages/landmark/list               地标大店列表
pages/landmark/detail             大店主页
pages/source/detail               款详情
pages/source/search               搜索
pages/source/groupbuy             拼单广场
pages/source/groupbuy-create      发起拼单
pages/source/groupbuy-detail      拼单详情
pages/source/ordering-fair        订货会专区
pages/source/manufacturer         厂家主页
pages/content/publish             发布（图文/视频/款卡片）
pages/content/publish-success     发布成功
pages/content/draft               草稿箱
pages/content/my-content          我的内容
pages/content/content-manage      内容管理
pages/content/content-analytics   内容数据看板
pages/content/comment-manage      评论管理
pages/interaction/message-center  消息中心
pages/interaction/conversation    私信会话
pages/interaction/comment-list    评论列表
pages/interaction/like-list       点赞列表
pages/interaction/follower-list   粉丝/关注列表
pages/profile/edit                编辑资料
pages/profile/settings            设置（通知/隐私/黑名单）
pages/profile/collection          我的收藏
pages/topic/index                 话题榜
pages/topic/detail                话题聚合
pages/tools/rewrite               文案改写
pages/tools/watermark             去水印
pages/tools/trending              爆款选题
pages/tools/account-analysis      账号分析
pages/tools/account-diagnosis     账号诊断
pages/tools/teleprompter          提词器
pages/tools/ai-image              AI 配图
pages/tools/video-edit            视频剪辑
pages/tools/remove-bg             图片去背景
pages/tools/operation-advice      运营建议
pages/manufacturer/admin          厂家数据看板
pages/manufacturer/publish        发布款
pages/manufacturer/contact-list   主动私信管理
pages/manufacturer/sub-account    子账号管理
pages/auth/login                  登录（演示账号一键登录）
pages/auth/certify                认证提交
```

## 4. 管理后台规范（apps/admin · Next.js）

- App Router + 客户端组件（数据来自 API，浏览器直连 `NEXT_PUBLIC_API_BASE`）。
- 用 `@wfb/shared-api` 的 `createApiClient` + `createFetchAdapter`，与小程序共用同一份接口定义。
- 页面：登录、概览（KPI 仪表盘）、内容复审队列、用户管理、认证审批、厂家管理、加微看板、推荐策略可视化。
- 样式用 Tailwind 3（后台不涉及小程序，可以用 Tailwind）。

## 5. 提交前自检

```bash
pnpm --filter "./packages/*" run build   # 契约包必须先编译（apps 依赖 dist）
pnpm --filter @wfb/api run build         # 后端类型检查 + 编译
pnpm --filter @wfb/miniapp run typecheck # 前端类型检查
pnpm --filter @wfb/miniapp run build:weapp  # 微信小程序必须编译通过
pnpm --filter @wfb/miniapp run build:h5     # H5 必须编译通过
node scripts/smoke-api.mjs               # 后端接口冒烟
```

**任何一端编译失败都不算完成。** 结束前必须实际运行上面的命令并把结果写进任务交付说明。
