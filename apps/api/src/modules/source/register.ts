import type { PublishProductDto, StyleTag } from '@wfb/shared-types';
import { parseTags } from '@wfb/shared-utils';
import type { Store } from '../../core/db';
import type { Router } from '../../core/server';
import { toProduct } from '../../gateway/platform';
import { articleDetail, infoFeed, manufacturerList, myProducts, productDetail, publishProduct, deleteProduct, sourceFeed, updateProduct } from './service';

/* =========================================================================
 * 资讯首页流 / 货源板块读接口（docs/API.md 第 4、6 节）
 *
 * 排序复用 recommend 模块的规则引擎，本模块只做过滤条件映射与详情聚合。
 * 注意：/api/source/feed 必须先于 /api/source/detail/:id 注册不冲突（段数不同）。
 * ========================================================================= */

export function registerSourceModule(router: Router, store: Store) {
  /* ------------------------------ 资讯首页流 ------------------------------ */
  router.get(
    '/api/info/feed',
    (ctx) => {
      const { page, pageSize } = ctx.pagination(10, 50);
      return infoFeed(store, {
        tab: ctx.str('tab', { fallback: 'recommend' }),
        styleTags: parseTags(ctx.arr<string>('styleTags')) as StyleTag[],
        topic: ctx.str('topic'),
        city: ctx.str('city'),
        type: ctx.str('type', { fallback: 'all' }),
        keyword: ctx.str('keyword'),
        page,
        pageSize,
        user: ctx.user ?? undefined,
        visitCountHeader: ctx.headers['x-visit-count'] === undefined ? undefined : String(ctx.headers['x-visit-count']),
      });
    },
    { summary: '资讯首页流（FeedResult<ArticleSummary>，含 strategy/冷启动）' },
  );

  router.get(
    '/api/info/detail/:id',
    (ctx) => {
      const id = ctx.num('id', { required: true });
      return articleDetail(store, id, ctx.user ?? undefined);
    },
    { summary: '资讯详情（含资讯→货源联动与工具入口）' },
  );

  /* ------------------------------ 货源首页流 ------------------------------ */
  router.get(
    '/api/source/feed',
    (ctx) => {
      const { page, pageSize } = ctx.pagination(10, 50);
      return sourceFeed(store, {
        tab: ctx.str('tab', { fallback: 'recommend' }),
        styleTags: parseTags(ctx.arr<string>('styleTags')) as StyleTag[],
        priceBand: ctx.str('priceBand'),
        shipFrom: ctx.str('shipFrom'),
        keyword: ctx.str('keyword'),
        page,
        pageSize,
        user: ctx.user ?? undefined,
        visitCountHeader: ctx.headers['x-visit-count'] === undefined ? undefined : String(ctx.headers['x-visit-count']),
      });
    },
    { summary: '货源首页流（FeedResult<Product>，含加微转化率加权）' },
  );

  router.get(
    '/api/source/detail/:id',
    (ctx) => {
      const id = ctx.num('id', { required: true });
      return productDetail(store, id, ctx.user ?? undefined);
    },
    { summary: '款详情（含相似款、加微转化率、工具入口）' },
  );

  router.get(
    '/api/source/manufacturers',
    (ctx) => {
      const { page, pageSize } = ctx.pagination(10, 50);
      return manufacturerList(
        store,
        { keyword: ctx.str('keyword'), styleTag: ctx.str('styleTag'), city: ctx.str('city') },
        page,
        pageSize,
      );
    },
    { summary: '厂家列表（带 productCount / contactRate）' },
  );

  router.get(
    '/api/source/search',
    (ctx) => {
      const keyword = ctx.str('keyword', { required: true, max: 60 });
      const { page, pageSize } = ctx.pagination(10, 50);
      return sourceFeed(store, {
        tab: 'recommend',
        styleTags: parseTags(ctx.arr<string>('styleTags')) as StyleTag[],
        priceBand: ctx.str('priceBand'),
        shipFrom: ctx.str('shipFrom'),
        keyword,
        page,
        pageSize,
        user: ctx.user ?? undefined,
      });
    },
    { summary: '货源搜索（推荐引擎排序 + 关键词过滤）' },
  );

  /* ------------------------------ 厂家：我的款（docs/API.md 第 6 节） ------------------------------ */

  // 注意顺序：/my 在 /:id 之前注册（同为 4 段路径，靠注册顺序决定命中）
  router.get(
    '/api/manufacturer/product/my',
    (ctx) => {
      const mf = ctx.role('manufacturer');
      const { page, pageSize } = ctx.pagination(10, 50);
      const data = myProducts(store, mf, { status: ctx.str('status'), keyword: ctx.str('keyword') }, page, pageSize);
      return { ...data, list: data.list.map((p) => toProduct(store, p)) };
    },
    { summary: '我的款（支持 status 过滤 + 版本配额剩余）' },
  );

  router.post(
    '/api/manufacturer/product/publish',
    (ctx) => {
      const mf = ctx.role('manufacturer');
      const dto: PublishProductDto = {
        title: ctx.str('title', { required: true, max: 80 }),
        images: ctx.arr<string>('images'),
        videoUrl: ctx.str('videoUrl') || undefined,
        priceRange: ctx.str('priceRange', { required: true, max: 20 }),
        moq: ctx.num('moq', { required: true, min: 1, max: 100000 }),
        styleTag: ctx.str('styleTag', { fallback: '韩系' }) as never,
        shipFrom: ctx.str('shipFrom', { fallback: '广州', max: 20 }),
        description: ctx.str('description', { max: 2000 }),
      };
      return publishProduct(store, mf, dto);
    },
    { summary: '厂家发布款（受版本可发布款数限制）' },
  );

  router.put(
    '/api/manufacturer/product/:id',
    (ctx) => {
      const mf = ctx.role('manufacturer');
      const id = ctx.num('id', { required: true });
      const patch: Partial<PublishProductDto> = {};
      if (ctx.body.title !== undefined) patch.title = ctx.str('title', { max: 80 });
      if (ctx.body.description !== undefined) patch.description = ctx.str('description', { max: 2000 });
      if (ctx.body.images !== undefined) patch.images = ctx.arr<string>('images');
      if (ctx.body.priceRange !== undefined) patch.priceRange = ctx.str('priceRange', { max: 20 });
      if (ctx.body.moq !== undefined) patch.moq = ctx.num('moq', { min: 1, max: 100000 });
      if (ctx.body.styleTag !== undefined) patch.styleTag = ctx.str('styleTag') as never;
      if (ctx.body.shipFrom !== undefined) patch.shipFrom = ctx.str('shipFrom', { max: 20 });
      if (ctx.body.videoUrl !== undefined) patch.videoUrl = ctx.str('videoUrl');
      return updateProduct(store, mf, id, patch);
    },
    { summary: '编辑我的款（同受版本可发布款数限制）' },
  );

  router.del(
    '/api/manufacturer/product/:id',
    (ctx) => {
      const mf = ctx.role('manufacturer');
      const id = ctx.num('id', { required: true });
      return deleteProduct(store, mf, id);
    },
    { summary: '删除我的款' },
  );
}
