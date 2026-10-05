import type { Router } from '../../core/server';
import { Errors } from '../../core/server';
import type { Store } from '../../core/db';
import {
  collectList,
  contentList,
  followerList,
  followingList,
  likeList,
  profileOf,
  updateProfile,
  type UpdateProfileInput,
} from './service';

/* =========================================================================
 * 个人主页控制器：只做「参数校验 + 调用 service + 返回数据」，业务逻辑在 service.ts
 * 路由清单见 docs/API.md 第 3 节。
 * ========================================================================= */

export function registerProfileModule(router: Router, store: Store) {
  router.get(
    '/api/profile/:userId',
    (ctx) => {
      const userId = ctx.num('userId', { required: true, min: 1 });
      return profileOf(store, userId, ctx.user?.id ?? null);
    },
    { summary: '个人主页详情' },
  );

  router.put(
    '/api/profile',
    (ctx) => {
      const user = ctx.auth();
      /* 局部更新语义：只有请求里真的带了该字段才覆盖 */
      const has = (key: string) =>
        Object.prototype.hasOwnProperty.call(ctx.body, key) && ctx.body[key] !== undefined && ctx.body[key] !== null;

      const input: UpdateProfileInput = {};
      if (has('nickname')) input.nickname = ctx.str('nickname', { required: true, max: 20 });
      if (has('avatarUrl')) input.avatarUrl = ctx.str('avatarUrl', { max: 500 });
      if (has('bio')) input.bio = ctx.str('bio', { max: 100 });
      if (has('styleTags')) input.styleTags = ctx.arr<string>('styleTags');
      if (has('priceBand')) input.priceBand = ctx.str('priceBand');
      if (has('sourcingCities')) input.sourcingCities = ctx.arr<string>('sourcingCities');
      if (has('pushEnabled')) input.pushEnabled = ctx.bool('pushEnabled', user.pushEnabled);

      if (!Object.keys(input).length) throw Errors.badRequest('没有需要更新的字段');
      return updateProfile(store, user, input);
    },
    { summary: '更新个人资料（昵称/头像/简介/风格标签/价格带/拿货地/推送开关）' },
  );

  router.get(
    '/api/profile/:userId/content',
    (ctx) => {
      const userId = ctx.num('userId', { required: true, min: 1 });
      const tab = ctx.str('tab', { fallback: 'works' });
      if (!['works', 'draft'].includes(tab)) throw Errors.badRequest('tab 仅支持 works / draft');
      const { page, pageSize } = ctx.pagination(12);
      return contentList(store, userId, ctx.user?.id ?? null, tab, page, pageSize);
    },
    { summary: '用户作品 / 草稿箱（?tab=works|draft）' },
  );

  router.get(
    '/api/profile/:userId/collect',
    (ctx) => {
      const userId = ctx.num('userId', { required: true, min: 1 });
      const { page, pageSize } = ctx.pagination(12);
      return collectList(store, userId, page, pageSize);
    },
    { summary: '用户收藏（文章 + 款）' },
  );

  router.get(
    '/api/profile/:userId/likes',
    (ctx) => {
      const userId = ctx.num('userId', { required: true, min: 1 });
      const { page, pageSize } = ctx.pagination(12);
      return likeList(store, userId, page, pageSize);
    },
    { summary: '用户喜欢（文章 + 款）' },
  );

  router.get(
    '/api/profile/:userId/followers',
    (ctx) => {
      const userId = ctx.num('userId', { required: true, min: 1 });
      const { page, pageSize } = ctx.pagination(20);
      return followerList(store, userId, page, pageSize);
    },
    { summary: '粉丝列表' },
  );

  router.get(
    '/api/profile/:userId/following',
    (ctx) => {
      const userId = ctx.num('userId', { required: true, min: 1 });
      const { page, pageSize } = ctx.pagination(20);
      return followingList(store, userId, page, pageSize);
    },
    { summary: '关注列表' },
  );
}
