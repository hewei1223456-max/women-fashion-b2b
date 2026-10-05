import type { Store } from '../../core/db';
import { pageOf } from '../../core/db';
import type { Router } from '../../core/server';
import { Errors } from '../../core/server';
import { landmarkDetail, landmarkView } from './service';

/* =========================================================================
 * 地标大店路由（docs/API.md 第 5 节）
 * 注意：/api/landmark/list 必须先注册，避免被 /api/landmark/:id 抢占
 * ========================================================================= */

export function registerLandmarkModule(router: Router, store: Store) {
  router.get(
    '/api/landmark/list',
    (ctx) => {
      const user = ctx.auth();
      const { page, pageSize } = ctx.pagination(10);
      const city = ctx.str('city');
      const keyword = ctx.str('keyword');
      const sort = ctx.str('sort', { fallback: 'follower' });
      const rows = [...store.landmarks.values()]
        .filter((l) => (city ? l.city.includes(city) : true))
        .filter((l) => (keyword ? `${l.shopName}${l.styleDescription}`.includes(keyword) : true))
        .map((l) => landmarkView(store, l, user.id))
        .sort((a, b) =>
          sort === 'revenue'
            ? Number(String(b.annualRevenue).replace(/[^\d]/g, '')) - Number(String(a.annualRevenue).replace(/[^\d]/g, ''))
            : sort === 'periods'
              ? b.periods - a.periods
              : b.followerCount - a.followerCount,
        );

      const cities = Array.from(new Set([...store.landmarks.values()].map((l) => l.city)));
      return { ...pageOf(rows, page, pageSize), cities, sort };
    },
    { summary: '地标大店列表' },
  );

  router.get(
    '/api/landmark/:id',
    (ctx) => {
      const user = ctx.auth();
      const id = ctx.num('id', { required: true });
      if (!store.landmarks.has(id)) throw Errors.notFound('大店不存在');
      return landmarkDetail(store, id, user.id);
    },
    { summary: '大店主页：信息 + 方法论 + 关注态' },
  );

  router.get(
    '/api/landmark/by-user/:userId',
    (ctx) => {
      const user = ctx.auth();
      const userId = ctx.num('userId', { required: true });
      const lm = [...store.landmarks.values()].find((l) => l.userId === userId);
      if (!lm) throw Errors.notFound('该用户还不是地标大店');
      return landmarkDetail(store, lm.id, user.id);
    },
    { summary: '按用户查大店主页' },
  );
}
