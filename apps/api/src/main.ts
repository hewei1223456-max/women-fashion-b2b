import type { User } from '@wfb/shared-types';
import { Ctx, Router, createHttpServer } from './core/server';
import { createStore, syncSequences } from './core/db';
import { seedStore } from './core/seed';
import { verifyToken } from './core/security';
import { svgPlaceholder, SVG_RATIOS, type SvgRatio } from './core/placeholder';
import { registerAuthModule } from './modules/auth/register';
import { registerSubAccountModule } from './modules/manufacturer/subaccount';
import { registerRecommendModule } from './modules/recommend/register';
import { registerSearchModule } from './modules/search/register';
import { registerAuditModule } from './modules/audit/register';
import { registerContentModule } from './modules/content/register';
import { registerInteractionModule } from './modules/interaction/register';
import { registerMessageModule } from './modules/message/register';
import { registerNotificationModule } from './modules/notification/register';
// —— 功能板块（AI 网关 + 10 个工具 + 加微/拼单/订货会/话题/大店/课程/管理后台）
import { registerToolsModule } from './modules/tools/register';
import { registerContactModule } from './modules/contact/register';
import { registerGroupBuyModule } from './modules/groupbuy/register';
import { registerFairModule } from './modules/fair/register';
import { registerTopicModule } from './modules/topic/register';
import { registerLandmarkModule } from './modules/landmark/register';
import { registerCourseModule } from './modules/course/register';
import { registerSourceModule } from './modules/source/register';
import { registerMeetupModule } from './modules/meetup/register';
import { registerAdminModule } from './modules/admin/register';

/* =========================================================================
 * 应用装配（等效 NestJS 的 AppModule）
 *
 * 每个业务模块导出一个 registerXxx(router, store) 函数，在 MODULES 中挂载。
 * 模块目录划分见 docs/ARCHITECTURE.md。
 * ========================================================================= */

export interface ModuleRegistration {
  name: string;
  register: (router: Router, store: import('./core/db').Store) => void;
}

/** 模块清单：新增模块只需在这里加一行（与 NestJS imports 数组等价） */
export const MODULES: ModuleRegistration[] = [
  // 认证（含个人主页：registerAuthModule 内部挂载 registerProfileModule）
  { name: 'auth', register: registerAuthModule },
  // 厂家子账号（受版本 subAccounts 配额限制）
  { name: 'manufacturer-sub-account', register: registerSubAccountModule },
  // 推荐规则引擎（资讯/货源三层算分 + 冷启动 + 探索打散）
  { name: 'recommend', register: registerRecommendModule },
  // 综合搜索（资讯 + 货源 + 厂家，searchScore 四项分解分）
  { name: 'search', register: registerSearchModule },
  // 内容安全审核（同步文本审核 + 微信回调 + 人工复审队列）
  { name: 'audit', register: registerAuditModule },
  // 内容发布与管理（发布审核 / 7 天编辑 / 软删除恢复 / 置顶 / 草稿 / 数据看板）
  { name: 'content', register: registerContentModule },
  // 互动组件（点赞 / 评论 / 收藏 / 转发 / 关注，计数双写）
  { name: 'interaction', register: registerInteractionModule },
  // 私信（会话 / 消息 / 已读 / 删除）
  { name: 'message', register: registerMessageModule },
  // 通知（列表 / 已读 / 未读数）
  { name: 'notification', register: registerNotificationModule },
  // 功能板块：10 个工具（AI 网关 + 免费额度 + 功能→资讯联动）
  { name: 'tools', register: registerToolsModule },
  // 加微追踪与厂家看板（加微记录 / 接收偏好 / 主动私信配额）
  { name: 'contact', register: registerContactModule },
  // 拼单
  { name: 'groupbuy', register: registerGroupBuyModule },
  // 订货会（受厂家版本 orderingFair 限制）
  { name: 'ordering-fair', register: registerFairModule },
  // 话题榜与话题聚合
  { name: 'topic', register: registerTopicModule },
  // 地标大店
  { name: 'landmark', register: registerLandmarkModule },
  // 课程 / 游学蒸馏 / 资讯搜索
  { name: 'course', register: registerCourseModule },
  // 资讯/货源首页流与详情（复用 recommend 规则引擎，仅做过滤映射）
  { name: 'feed', register: registerSourceModule },
  // 组局（参考闪动：时间/地点/集合点/报名方式/报名条件）
  { name: 'meetup', register: registerMeetupModule },
  // 管理后台（KPI 仪表盘 / 用户 / 认证 / 复审 / 重置演示数据）
  { name: 'admin', register: registerAdminModule },
];

export function createApp() {
  const store = createStore((process.env.DATA_DRIVER as 'memory' | 'mysql') ?? 'memory');
  seedStore(store);
  syncSequences(store);

  const router = new Router();

  /* ------------------------- 系统级接口 ------------------------- */
  router.get(
    '/api/health',
    () => ({
      status: 'ok',
      driver: store.driver,
      uptime: Math.round(process.uptime()),
      version: '6.0.0-demo',
      time: new Date().toISOString(),
      counts: {
        users: store.users.size,
        products: store.products.size,
        articles: store.articles.size,
        comments: store.comments.size,
        contactLogs: store.contactLogs.size,
      },
      capabilities: {
        ai: !!process.env.AI_API_KEY,
        redis: false,
        mysql: store.driver === 'mysql',
        contentSecurity: process.env.CONTENT_SECURITY_PROVIDER ?? 'mock',
      },
    }),
    { auth: false, summary: '健康检查' },
  );

  router.get(
    '/api/system/stats',
    () => {
      const out: Record<string, number> = {};
      for (const [key, value] of Object.entries(store)) {
        if (value instanceof Map) out[key] = value.size;
      }
      return out;
    },
    { auth: false, summary: '各表数据量统计' },
  );

  /**
   * 演示图片：按 seed 确定性生成 SVG 占位图（**不依赖任何外部 CDN**）。
   * 播种数据里所有 image 字段都指向这里，离线 / 内网 / CDN 不可达时界面依然完整。
   * 上线时把图片换成 OSS 直链，本路由可直接下线。
   *
   * 注意：必须注册在 MODULES 之前、且路径以 /uploads 开头 ——
   * Ctx.raw() 对字符串按 text/plain 发送，浏览器仍会按 SVG 渲染（img 标签不校验 MIME），
   * 但如果命中下面的 staticDirs 静态目录逻辑则会 404，所以这里优先匹配。
   */
  router.get(
    '/uploads/demo/img.svg',
    (ctx) => {
      const seed = ctx.str('seed', { fallback: 'wfb' });
      const label = ctx.str('label');
      const w = ctx.num('w', { fallback: 600, min: 16, max: 2000 });
      const h = ctx.num('h', { fallback: 800, min: 16, max: 2000 });
      const ratio = ctx.str('ratio', { fallback: 'portrait' });
      const safeRatio = (ratio in SVG_RATIOS ? ratio : 'portrait') as SvgRatio;
      ctx.svg(svgPlaceholder(`${seed}|${w}x${h}`, label, safeRatio));
      return null;
    },
    { auth: false, summary: '演示占位图（SVG，无外部依赖）' },
  );

  /* ------------------------- 业务模块 ------------------------- */
  for (const m of MODULES) m.register(router, store);

  const server = createHttpServer(router, {
    resolveUser: (ctx: Ctx): User | null => {
      const header = String(ctx.headers.authorization ?? '');
      const token = header.startsWith('Bearer ') ? header.slice(7) : String(ctx.query.token ?? '');
      if (!token) return null;
      const payload = verifyToken(token);
      if (!payload) return null;
      return store.users.get(payload.sub) ?? null;
    },
    onLog: (line) => {
      if (process.env.API_LOG !== 'off') console.log(`[api] ${line}`);
    },
    staticDirs: [{ prefix: '/uploads', dir: './uploads' }],
  });

  return { server, router, store };
}

if (require.main === module) {
  const port = Number(process.env.PORT ?? 3000);
  const { server, router } = createApp();
  server.listen(port, () => {
    console.log(`\n  女装B2B行业平台 · API 已启动`);
    console.log(`  健康检查   http://localhost:${port}/api/health`);
    console.log(`  路由总览   http://localhost:${port}/api/routes`);
    console.log(`  已挂载模块 ${MODULES.length} 个，路由 ${router.list().length} 条\n`);
  });
}
