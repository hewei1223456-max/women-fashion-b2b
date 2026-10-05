import type { StyleTag } from '@wfb/shared-types';
import type { Store } from '../../core/db';
import type { Router } from '../../core/server';
import { Errors } from '../../core/server';
import { parseTags } from '@wfb/shared-utils';
import { buildInfoFeed, buildRecommendMeta, buildSourceFeed } from './service';
import type { RecommendQuery } from './service';

/* =========================================================================
 * 推荐模块控制器（docs/API.md 第 13 节）
 *   GET /api/recommend/feed?board=info|source → FeedResult<ArticleSummary|Product>
 *   GET /api/recommend/meta                   → RecommendMeta
 *
 * 只做「路由声明 + 参数校验 + 调用 service」，业务逻辑在 service.ts。
 * ========================================================================= */

/** 组装 service 入参：显式 query 优先，缺省时回落到登录用户画像 */
function buildQuery(ctx: import('../../core/server').Ctx, store: Store, board: 'info' | 'source'): RecommendQuery {
  const user = ctx.user ?? undefined;
  const { page, pageSize } = ctx.pagination(10, 50);

  const queryTags = parseTags(ctx.arr<string>('styleTags')) as StyleTag[];
  const profileTags = (user?.styleTags ?? []) as StyleTag[];
  const styleTags = queryTags.length ? queryTags : profileTags;

  const priceBand = ctx.str('priceBand') || user?.priceBand || undefined;
  const shipFrom = ctx.str('shipFrom') || user?.sourcingCities?.[0] || undefined;

  return {
    board,
    styleTags,
    priceBand,
    shipFrom,
    page,
    pageSize,
    userId: user?.id,
    memberLevel: user?.memberLevel,
    role: user?.role,
    // Demo 可直接用请求头模拟「第 N 次访问」，无需真实埋点
    visitCountHeader: ctx.headers['x-visit-count'] === undefined ? undefined : String(ctx.headers['x-visit-count']),
  };
}

export function registerRecommendModule(router: Router, store: Store) {
  router.get(
    '/api/recommend/feed',
    (ctx) => {
      const board = ctx.str('board', { required: true });
      if (board !== 'info' && board !== 'source') throw Errors.badRequest('board 只能是 info 或 source');
      const query = buildQuery(ctx, store, board);
      return board === 'info' ? buildInfoFeed(store, query) : buildSourceFeed(store, query);
    },
    { summary: '推荐流（资讯/货源规则引擎，含 strategy/冷启动/打散实测）' },
  );

  router.get(
    '/api/recommend/meta',
    (ctx) => {
      const user = ctx.user ?? undefined;
      const queryTags = parseTags(ctx.arr<string>('styleTags')) as StyleTag[];
      const styleTags = queryTags.length ? queryTags : ((user?.styleTags ?? []) as StyleTag[]);
      return buildRecommendMeta(store, {
        styleTags,
        priceBand: ctx.str('priceBand') || user?.priceBand || undefined,
        shipFrom: ctx.str('shipFrom') || user?.sourcingCities?.[0] || undefined,
        userId: user?.id,
        memberLevel: user?.memberLevel,
        role: user?.role,
        visitCountHeader: ctx.headers['x-visit-count'] === undefined ? undefined : String(ctx.headers['x-visit-count']),
      });
    },
    { summary: '当前推荐策略说明（冷启动状态 + 打散规则 + 权重）' },
  );
}
