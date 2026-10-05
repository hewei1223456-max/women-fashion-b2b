import type { PublishContentDto } from '@wfb/shared-types';
import type { Ctx, Router } from '../../core/server';
import type { Store } from '../../core/db';
import {
  contentAnalytics,
  deleteDraft,
  draftList,
  myContent,
  publishContent,
  removeContent,
  restoreContent,
  saveDraft,
  topContent,
  updateContent,
} from './service';

/* =========================================================================
 * 内容发布与管理模块（docs/API.md 第 8 节）
 * 控制器只做「路由声明 + 参数校验 + 调 service」，业务逻辑全在 service.ts
 * ========================================================================= */

/** 判断入参是否显式传入（body > params > query），未传的字段保持 undefined，支持部分更新 */
function has(ctx: Ctx, key: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(ctx.body ?? {}, key) ||
    Object.prototype.hasOwnProperty.call(ctx.params ?? {}, key) ||
    Object.prototype.hasOwnProperty.call(ctx.query ?? {}, key)
  );
}

/** PublishContentDto：显式走 ctx 读取，body 与 query 两种传参都能用；未传字段不下发默认值 */
function dtoOf(ctx: Ctx): PublishContentDto {
  const dto: Record<string, unknown> = {};
  for (const key of ['contentType', 'board', 'title', 'content', 'videoUrl', 'coverUrl', 'visibility', 'priceRange', 'location', 'scheduledAt', 'publishAs']) {
    if (has(ctx, key)) dto[key] = ctx.str(key);
  }
  for (const key of ['images', 'styleTags', 'topics']) {
    if (has(ctx, key)) dto[key] = ctx.arr<string>(key);
  }
  for (const key of ['productId', 'moq', 'period']) {
    if (has(ctx, key)) dto[key] = ctx.num(key);
  }
  if (has(ctx, 'attachments')) {
    const rawAttachments = (ctx.body ?? {}).attachments;
    dto.attachments = Array.isArray(rawAttachments)
      ? (rawAttachments as { name?: unknown; url?: unknown; size?: unknown }[]).map((a) => ({
          name: String(a?.name ?? '附件'),
          url: String(a?.url ?? ''),
          size: a?.size ? String(a.size) : undefined,
        }))
      : [];
  }
  return dto as unknown as PublishContentDto;
}

export function registerContentModule(router: Router, store: Store) {
  router.post('/api/content/publish', (ctx) => publishContent(store, ctx.auth(), dtoOf(ctx)), {
    summary: '发布内容（同步文本审核 + 异步媒体任务号）',
  });

  router.put('/api/content/:id', (ctx) => updateContent(store, ctx.auth(), ctx.num('id', { required: true }), dtoOf(ctx)), {
    summary: '编辑内容（发布后 7 天内，超时 403）',
  });

  router.del('/api/content/:id', (ctx) => removeContent(store, ctx.auth(), ctx.num('id', { required: true })), {
    summary: '软删除内容（返回 restorableUntil，30 天）',
  });

  router.post('/api/content/:id/restore', (ctx) => restoreContent(store, ctx.auth(), ctx.num('id', { required: true })), {
    summary: '恢复已删除内容',
  });

  router.get(
    '/api/content/my',
    (ctx) => {
      const { page, pageSize } = ctx.pagination(10);
      return myContent(store, ctx.auth(), { board: ctx.str('board'), sort: ctx.str('sort'), page, pageSize });
    },
    { summary: '我的内容（board=info|source, sort=time|view|interaction）' },
  );

  router.put('/api/content/:id/top', (ctx) => topContent(store, ctx.auth(), ctx.num('id', { required: true })), {
    summary: '置顶 / 取消置顶（最多 3 条）',
  });

  router.get('/api/content/:id/analytics', (ctx) => contentAnalytics(store, ctx.auth(), ctx.num('id', { required: true })), {
    summary: '内容数据看板（流量来源占比 + 近 7 天趋势）',
  });

  router.post('/api/content/draft', (ctx) => saveDraft(store, ctx.auth(), dtoOf(ctx), ctx.num('id')), {
    summary: '保存草稿（传 id 为更新）',
  });

  router.get('/api/content/draft', (ctx) => draftList(store, ctx.auth()), { summary: '草稿列表' });

  router.del('/api/content/draft/:id', (ctx) => deleteDraft(store, ctx.auth(), ctx.num('id', { required: true })), {
    summary: '删除草稿',
  });
}
