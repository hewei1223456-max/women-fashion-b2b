import type { Store } from '../../core/db';
import { pageOf } from '../../core/db';
import type { Router } from '../../core/server';
import { Errors } from '../../core/server';
import { courseDetail, courseList, distillation, infoSearch } from './service';

/* =========================================================================
 * 资讯板块扩展：课程 / 游学蒸馏 / 资讯搜索（docs/API.md 第 4 节）
 * ========================================================================= */

export function registerCourseModule(router: Router, store: Store) {
  router.get(
    '/api/info/course/list',
    (ctx) => {
      ctx.auth();
      const { page, pageSize } = ctx.pagination(10);
      const category = ctx.str('category');
      const keyword = ctx.str('keyword');
      const sort = ctx.str('sort', { fallback: 'hot' });
      const freeParam = ctx.str('free');
      const rows = courseList(store, {
        category,
        keyword,
        sort,
        free: freeParam === '' ? undefined : freeParam === 'true' || freeParam === '1',
      });
      const categories = Array.from(new Set([...store.courses.values()].map((c) => c.category)));
      return { ...pageOf(rows, page, pageSize), categories };
    },
    { summary: '课程列表' },
  );

  router.get(
    '/api/info/course/:id',
    (ctx) => {
      ctx.auth();
      const id = ctx.num('id', { required: true });
      if (!store.courses.has(id)) throw Errors.notFound('课程不存在');
      return courseDetail(store, id);
    },
    { summary: '课程详情（含章节目录与讲师其他课程）' },
  );

  router.get(
    '/api/info/distillation',
    (ctx) => {
      ctx.auth();
      const { page, pageSize } = ctx.pagination(10);
      const period = ctx.num('period');
      const data = distillation(store, period || undefined);
      return { ...pageOf(data.list, page, pageSize), groups: data.groups, periods: data.periods, totalGroups: data.groups.length };
    },
    { summary: '游学蒸馏资料（按期数倒序）' },
  );

  router.get(
    '/api/info/search',
    (ctx) => {
      ctx.auth();
      const keyword = ctx.str('keyword', { required: true, max: 60 });
      const limit = ctx.num('limit', { fallback: 10, min: 1, max: 30 });
      return infoSearch(store, keyword, limit);
    },
    { summary: '资讯搜索（含内容 + 货源 + 厂家联动）' },
  );
}
