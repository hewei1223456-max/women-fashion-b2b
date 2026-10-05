import type { Store } from '../../core/db';
import { pageOf } from '../../core/db';
import type { Router } from '../../core/server';
import { buildTopics, topicDetail } from './service';

/* =========================================================================
 * 话题榜 / 话题聚合（docs/API.md 第 11 节）
 * ========================================================================= */

export function registerTopicModule(router: Router, store: Store) {
  router.get(
    '/api/topic/list',
    (ctx) => {
      ctx.auth();
      const { page, pageSize } = ctx.pagination(20);
      const hot = ctx.bool('hot');
      const keyword = ctx.str('keyword');
      const all = buildTopics(store, 100, keyword);
      // hot=true 只看近 3 天有新增的话题
      const rows = hot ? all.filter((t) => t.recentCount > 0) : all;
      return {
        ...pageOf(rows, page, pageSize),
        // 榜单可视化：Top3 热度占比
        top3: rows.slice(0, 3).map((t) => ({ tag: t.tag, heat: t.heat, percent: rows[0]?.heat ? Math.round((t.heat / rows[0].heat) * 100) : 0 })),
      };
    },
    { summary: '话题榜（按出现频次与热度实算）' },
  );

  router.get(
    '/api/topic/detail/:tag',
    (ctx) => {
      ctx.auth();
      const tag = ctx.str('tag', { required: true, max: 40 });
      return topicDetail(store, tag);
    },
    { summary: '话题聚合（资讯 + 货源）' },
  );

  router.get(
    '/api/topic/hot',
    (ctx) => {
      ctx.auth();
      const limit = ctx.num('limit', { fallback: 6, min: 1, max: 20 });
      const rows = buildTopics(store, limit);
      return rows.map((t, i) => ({ rank: i + 1, tag: t.tag, name: t.name, heat: t.heat, contentCount: t.contentCount }));
    },
    { summary: '热门话题 Top N（首页橱窗）' },
  );
}
