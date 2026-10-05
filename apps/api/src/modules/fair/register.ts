import type { CreateFairDto } from '@wfb/shared-types';
import { planOf } from '@wfb/shared-types';
import type { Store } from '../../core/db';
import { pageOf } from '../../core/db';
import type { Router } from '../../core/server';
import { Errors } from '../../core/server';
import { createFair, fairStatus, fairView, signupFair } from './service';

/* =========================================================================
 * 订货会路由（docs/API.md 第 11 节）
 * ========================================================================= */

export function registerFairModule(router: Router, store: Store) {
  router.get(
    '/api/ordering-fair/list',
    (ctx) => {
      const user = ctx.auth();
      const { page, pageSize } = ctx.pagination(10);
      const city = ctx.str('city');
      const styleTag = ctx.str('styleTag');
      const status = ctx.str('status');
      const rows = [...store.fairs.values()]
        .filter((f) => (city ? f.city.includes(city) : true))
        .filter((f) => (styleTag ? f.styleTags.includes(styleTag as never) : true))
        .filter((f) => (status ? fairStatus(f) === status : true))
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
        .map((f) => ({ ...fairView(store, f, user.id), status: fairStatus(f), daysLeft: Math.ceil((new Date(f.startAt).getTime() - Date.now()) / 86_400_000) }));

      const cities = Array.from(new Set([...store.fairs.values()].map((f) => f.city)));
      return { ...pageOf(rows, page, pageSize), cities };
    },
    { summary: '订货会专区' },
  );

  router.get(
    '/api/ordering-fair/detail/:id',
    (ctx) => {
      const user = ctx.auth();
      const id = ctx.num('id', { required: true });
      const f = store.fairs.get(id);
      if (!f) throw Errors.notFound('订货会不存在');
      const signups = [...store.fairSignups.values()].filter((s) => s.fairId === id);
      return {
        ...fairView(store, f, user.id),
        status: fairStatus(f),
        signupList: signups.slice(0, 20).map((s) => {
          const u = store.users.get(s.userId);
          return { id: s.id, userId: s.userId, nickname: u?.nickname ?? '匿名店主', avatarUrl: u?.avatarUrl ?? '', createdAt: s.createdAt };
        }),
      };
    },
    { summary: '订货会详情' },
  );

  router.post(
    '/api/ordering-fair/create',
    (ctx) => {
      const user = ctx.role('manufacturer', 'landmark');
      const dto: CreateFairDto = {
        title: ctx.str('title', { required: true, max: 80 }),
        city: ctx.str('city', { required: true, max: 30 }),
        venue: ctx.str('venue', { max: 80 }),
        startAt: ctx.str('startAt', { required: true }),
        endAt: ctx.str('endAt', { required: true }),
        theme: ctx.str('theme', { max: 200 }),
        signup: ctx.str('signup', { fallback: '加微信报名', max: 200 }),
        styleTags: ctx.arr<string>('styleTags') as never,
        coverUrl: ctx.str('coverUrl') || undefined,
      };
      const row = createFair(store, user, dto);
      return { ...row, plan: planOf(user.memberLevel).label, orderingFair: planOf(user.memberLevel).orderingFair };
    },
    { summary: '发布订货会（高级版以上）' },
  );

  router.post(
    '/api/ordering-fair/signup/:id',
    (ctx) => {
      const user = ctx.auth();
      const id = ctx.num('id', { required: true });
      const f = signupFair(store, user, id);
      return { ...f, signedUp: true, signupCount: f.signupCount };
    },
    { summary: '订货会报名（幂等）' },
  );

  router.get(
    '/api/ordering-fair/permission',
    (ctx) => {
      const user = ctx.auth();
      const plan = planOf(user.memberLevel);
      return {
        memberLevel: user.memberLevel,
        planLabel: plan.label,
        orderingFair: plan.orderingFair,
        canCreate: plan.orderingFair || user.role === 'admin',
        upgradeHint: plan.orderingFair ? undefined : '升级「高级版 ¥9800/年」即可发布订货会',
      };
    },
    { summary: '订货会发布权限（版本分层）' },
  );

  router.get(
    '/api/ordering-fair/upcoming',
    (ctx) => {
      ctx.auth();
      const rows = [...store.fairs.values()]
        .filter((f) => fairStatus(f) !== 'ended')
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
        .slice(0, 3)
        .map((f) => ({ id: f.id, title: f.title, city: f.city, startAt: f.startAt, venue: f.venue }));
      return rows;
    },
    { summary: '近期订货会（首页/货源页橱窗）' },
  );

  router.get(
    '/api/ordering-fair/mine',
    (ctx) => {
      const user = ctx.auth();
      if (user.role !== 'manufacturer' && user.role !== 'admin') throw Errors.forbidden('仅厂家可查看自己的订货会');
      const hosted = [...store.fairs.values()].filter((f) => f.hostId === user.id);
      const joined = [...store.fairSignups.values()]
        .filter((s) => s.userId === user.id)
        .map((s) => store.fairs.get(s.fairId))
        .filter(Boolean)
        .map((f) => fairView(store, f!, user.id));
      return { hosted: hosted.map((f) => fairView(store, f, user.id)), joined };
    },
    { summary: '我发布 / 报名的订货会' },
  );
}
