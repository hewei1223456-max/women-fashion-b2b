import type { CreateGroupBuyDto } from '@wfb/shared-types';
import type { Store } from '../../core/db';
import { pageOf } from '../../core/db';
import type { Router } from '../../core/server';
import { Errors } from '../../core/server';
import { createGroupBuy, groupBuyView, joinGroupBuy, memberCount, quitGroupBuy } from './service';

/* =========================================================================
 * 拼单路由（docs/API.md 第 11 节）
 * ========================================================================= */

export function registerGroupBuyModule(router: Router, store: Store) {
  router.post(
    '/api/groupbuy/create',
    (ctx) => {
      const user = ctx.auth();
      const dto: CreateGroupBuyDto = {
        title: ctx.str('title', { required: true, max: 80 }),
        description: ctx.str('description', { max: 1000 }),
        productId: ctx.num('productId') || undefined,
        targetCount: ctx.num('targetCount', { required: true, min: 2, max: 500 }),
        styleTag: ctx.str('styleTag', { fallback: '韩系' }) as never,
        market: ctx.str('market') || undefined,
        deadlineAt: ctx.str('deadlineAt', { fallback: new Date(Date.now() + 7 * 86_400_000).toISOString() }),
      };
      return createGroupBuy(store, user, dto);
    },
    { summary: '发起拼单' },
  );

  router.get(
    '/api/groupbuy/list',
    (ctx) => {
      const user = ctx.auth();
      const { page, pageSize } = ctx.pagination(10);
      const styleTag = ctx.str('styleTag');
      const market = ctx.str('market');
      const status = ctx.str('status');
      const keyword = ctx.str('keyword');
      const rows = [...store.groupBuys.values()]
        .filter((g) => (styleTag ? g.styleTag === styleTag : true))
        .filter((g) => (market ? g.market === market : true))
        .filter((g) => (status ? g.status === status : g.status !== 'cancelled'))
        .filter((g) => (keyword ? `${g.title}${g.description}`.includes(keyword) : true))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map((g) => groupBuyView(store, g, user.id));

      // 拼单成功率口径：**全部拼单**（含招募中）里已成团（formed/completed）的占比。
      // 与 /api/admin/overview 的「拼单成功率（全部拼单）」同源，避免两处口径漂移。
      const stats = {
        recruiting: rows.filter((r) => r.status === 'recruiting').length,
        formed: rows.filter((r) => r.status === 'formed').length,
        successRate: rows.length ? Math.round((rows.filter((r) => r.status === 'formed' || r.status === 'completed').length / rows.length) * 1000) / 10 : 0,
        successRateBase: '全部拼单' as const,
      };
      return { ...pageOf(rows, page, pageSize), stats };
    },
    { summary: '拼单广场' },
  );

  router.get(
    '/api/groupbuy/detail/:id',
    (ctx) => {
      const user = ctx.auth();
      const id = ctx.num('id', { required: true });
      const g = store.groupBuys.get(id);
      if (!g) throw Errors.notFound('拼单不存在');
      const members = [...store.groupBuyMembers.values()]
        .filter((m) => m.groupBuyId === id)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map((m) => ({ id: m.id, createdAt: m.createdAt, ...(store.users.get(m.userId) ? { user: { id: m.userId, nickname: store.users.get(m.userId)!.nickname, avatarUrl: store.users.get(m.userId)!.avatarUrl, role: store.users.get(m.userId)!.role } } : {}) }));
      return {
        ...groupBuyView(store, g, user.id),
        memberList: members,
        memberCount: memberCount(store, id),
        remaining: Math.max(0, g.targetCount - g.currentCount),
        progress: Math.min(100, Math.round((g.currentCount / g.targetCount) * 100)),
      };
    },
    { summary: '拼单详情' },
  );

  router.post(
    '/api/groupbuy/join/:id',
    (ctx) => {
      const user = ctx.auth();
      const id = ctx.num('id', { required: true });
      const g = joinGroupBuy(store, user, id);
      return { ...g, joined: true, isNew: memberCount(store, id) > 0 };
    },
    { summary: '参团（幂等）' },
  );

  router.post(
    '/api/groupbuy/quit/:id',
    (ctx) => {
      const user = ctx.auth();
      const id = ctx.num('id', { required: true });
      const g = quitGroupBuy(store, user, id);
      return { ...g, joined: false };
    },
    { summary: '退团' },
  );

  router.get(
    '/api/groupbuy/mine',
    (ctx) => {
      const user = ctx.auth();
      const { page, pageSize } = ctx.pagination(10);
      const myIds = new Set(
        [...store.groupBuyMembers.values()].filter((m) => m.userId === user.id).map((m) => m.groupBuyId),
      );
      const initiated = [...store.groupBuys.values()].filter((g) => g.initiatorId === user.id);
      const joined = [...store.groupBuys.values()].filter((g) => g.initiatorId !== user.id && myIds.has(g.id));
      const rows = [...initiated, ...joined]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map((g) => ({ ...groupBuyView(store, g, user.id), isInitiator: g.initiatorId === user.id }));
      return { ...pageOf(rows, page, pageSize), initiatedCount: initiated.length, joinedCount: joined.length };
    },
    { summary: '我的拼单' },
  );
}
