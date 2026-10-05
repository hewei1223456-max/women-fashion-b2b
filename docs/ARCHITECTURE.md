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
pnpm verify            # 一键全量验收（11 项，见下）
pnpm verify:fast       # 只跑编译 + 类型检查 + 后端冒烟
pnpm smoke             # 后端冒烟（需已有实例在 3100）
pnpm check:bundles     # 产物 JS 语法合法性
pnpm verify:pages      # H5 逐页浏览器运行时校验（需 3100 + 8099 在跑）
pnpm evidence          # 打印三模块验收证据
```

`pnpm verify` 的 11 项：契约包编译 / 后端编译 / 前端 typecheck / 后端冒烟（**每次全新实例**）/
四端编译（weapp、tt、alipay、h5）/ 产物语法校验 / H5 逐页运行时校验 / 后台构建。

**任何一端编译失败都不算完成。** 结束前必须实际运行上面的命令并把结果写进任务交付说明。

---

## 6. 踩过的坑（都是「看起来成功其实坏了」的静默故障，务必保留这些防护）

这三类问题共同特点是：**构建退出码 0、日志说 Compiled successfully，但产物不可用**。
它们不会被常规 CI 的「编译通过」发现，只有运行态校验或产物解析才能抓到。

### 6.1 Terser 把类私有字段压成非法语法

- **现象**：`dist/h5` 的 JS 里出现 `#"e"` 这种 token，浏览器解析即 `SyntaxError`，整个 H5 应用起不来；
  而 `build:h5` 返回 0 且显示 `Compiled successfully`。
- **根因**：Taro 4.3 的 `H5BaseConfig` 给 terser 传默认 `output.quote_keys: true`
  （见 `@tarojs/webpack5-runner/dist/webpack/H5BaseConfig.js`），
  在 terser 5.51.x 下会把**类私有字段名**也加引号；`@tanstack/query-core` 大量使用 `#private` 字段。
- **修复**：`apps/miniapp/config/index.ts` 的 `h5.terser` 覆盖 `output.quote_keys: false` /
  `keep_quoted_props: false`（`mini` 端不受影响，无需改）。
- **防护**：`scripts/check-bundles.mjs` —— 用真正的 JS 解析器逐个解析产物。
  ⚠️ 不要用 `node --check` 替代：小程序产物是 CJS，用它会有噪声误报。

### 6.2 H5 构建不产出 index.html

- **现象**：`dist/h5` 只有 `js/ css/ chunk/`，没有 `index.html`，静态部署直接 404。
- **根因（两个叠加）**：
  1. Taro 只在 `src/index.html` 存在时才注册 HtmlWebpackPlugin
     （`H5WebpackPlugin.js`：`fs.existsSync(path.join(sourceDir, 'index.html'))`）——缺失时静默跳过；
  2. 自定义 `h5.output.filename` / `miniCssExtractPluginOption.filename` 会让
     HtmlWebpackPlugin 匹配不到唯一 chunk，同样静默不产出 HTML。
- **修复**：新增 `apps/miniapp/src/index.html`（含首屏骨架 + 自动移除），
  并且**不再覆盖** h5 的 output / miniCssExtract 文件名。

### 6.3 H5 存储包裹导致「登录后一刷新就掉登录」

- **现象**：登录成功，刷新页面后 token 消失、所有接口 401。
- **根因**：Taro 的 H5 实现在 `setStorageSync` 时把值写成 `{"data": <原值>}`（小程序端是原生字符串）。
  读的时候如果不拆包裹，拿到的就是 `'{"data":"eyJ..."}'`——
  它被当成 Bearer token 发出去 → 后端 401 → 前端的 401 分支把 token 删掉。
- **修复**：`apps/miniapp/src/services/request.ts` 的 `taroStorage` 做**对称的包/拆**处理
  （同时兼容历史裸值），并在 `packages/shared-api/src/http.ts` 加了 token 字符白名单，
  拒绝把畸形串当 header 发出去。
- **防护**：`scripts/verify-pages.mjs` 里写入登录态时必须用 Taro 的包裹格式
  `localStorage.setItem('wfb_token', JSON.stringify({ data: token }))`；
  另外 **Taro H5 是 hash 路由**，页面地址要写成 `/#/pages/xxx/yyy`，
  直接请求 `/pages/xxx/yyy` 只会拿到壳（这两点都曾导致「所有页面看起来都是首页」的假象）。

---

## 7. monorepo 的两个约定

1. **契约包要先编译**：`apps/*` 通过 `main: dist/index.js` 引用 `packages/*`（Taro 的 bundler 不处理
   工作区内的 TS 源码），但 `types` 指向 `src/index.ts`，所以类型检查永远看最新源码。
   改了 `packages/*` 之后先跑 `pnpm --filter "./packages/*" run build`。
2. **Windows 上调 pnpm 要用 `pnpm.cmd`**，并且 Node ≥ 20 在 `shell: false` 下不能 spawn `.cmd`
   （会 `EINVAL`）——`scripts/verify-all.mjs` 已封装好这个差异。
