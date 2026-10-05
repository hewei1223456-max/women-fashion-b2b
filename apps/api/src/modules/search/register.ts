import type { Store } from '../../core/db';
import type { Ctx, Router } from '../../core/server';
import { Errors } from '../../core/server';
import { HOT_WINDOW_DAYS, hotKeywords, searchAll } from './service';

/* =========================================================================
 * 搜索模块控制器（docs/API.md 第 13 节）
 *   GET /api/search?keyword=碎花 → SearchResult（资讯 + 货源 + 厂家，带 scoreBreakdown）
 *   GET /api/search/hot-keywords → [{ keyword, heat }]
 * ========================================================================= */

function parseBoard(ctx: Ctx): 'all' | 'info' | 'source' {
  const raw = ctx.str('board', { fallback: 'all' });
  if (raw !== 'all' && raw !== 'info' && raw !== 'source') throw Errors.badRequest('board 只能是 all / info / source');
  return raw;
}

export function registerSearchModule(router: Router, store: Store) {
  router.get(
    '/api/search',
    (ctx) => {
      const keyword = ctx.str('keyword', { required: true, max: 50 });
      const { page, pageSize } = ctx.pagination(10, 50);
      return searchAll(store, {
        keyword,
        board: parseBoard(ctx),
        style: ctx.str('style') || undefined,
        priceBand: ctx.str('priceBand') || undefined,
        shipFrom: ctx.str('shipFrom') || undefined,
        page,
        pageSize,
        userId: ctx.user?.id,
      });
    },
    { summary: '综合搜索（资讯 + 货源 + 厂家，含 scoreBreakdown 四项分解分）' },
  );

  router.get(
    '/api/search/hot-keywords',
    (ctx) => {
      const limit = Math.min(20, Math.max(1, ctx.num('limit', { fallback: 10 })));
      // 契约：data 为 [{ keyword, heat }]，额外带 count/source 便于「热搜词来源」可视化
      return hotKeywords(store, limit).map((r) => ({
        keyword: r.keyword,
        heat: r.heat,
        count: r.count,
        source: r.source,
        windowDays: HOT_WINDOW_DAYS,
      }));
    },
    { summary: '热搜词（搜索埋点时间衰减加权，无埋点时回落内容热词）' },
  );
}
