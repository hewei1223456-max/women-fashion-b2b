import type { Store } from '../../core/db';
import { pageOf } from '../../core/db';
import type { Router } from '../../core/server';
import { Errors } from '../../core/server';
import { adminUserRows, buildOverview, reseedStore, reviewCert, reviewContent } from './service';

/* =========================================================================
 * 管理后台路由（docs/API.md 第 15 节）—— 仅 admin 角色可访问
 * ========================================================================= */

export function registerAdminModule(router: Router, store: Store) {
  router.get(
    '/api/admin/overview',
    (ctx) => {
      ctx.role('admin');
      return buildOverview(store);
    },
    { summary: '概览（含第十三篇核心指标 KPI）' },
  );

  router.get(
    '/api/admin/users',
    (ctx) => {
      ctx.role('admin');
      const { page, pageSize } = ctx.pagination(20);
      const rows = adminUserRows(store, {
        role: ctx.str('role'),
        certStatus: ctx.str('certStatus'),
        keyword: ctx.str('keyword'),
      });
      return {
        ...pageOf(rows, page, pageSize),
        roles: Array.from(new Set([...store.users.values()].map((u) => u.role))),
        pendingCert: [...store.users.values()].filter((u) => u.certStatus === 'pending').length,
      };
    },
    { summary: '用户列表（角色 / 认证 / 关键词筛选）' },
  );

  router.post(
    '/api/admin/cert/:userId',
    (ctx) => {
      ctx.role('admin');
      const userId = ctx.num('userId', { required: true });
      const action = ctx.str('action', { required: true });
      if (!['approve', 'reject'].includes(action)) throw Errors.badRequest('action 必须是 approve / reject');
      const reason = ctx.str('reason', { max: 200 });
      const user = reviewCert(store, userId, action as 'approve' | 'reject', reason);
      return { id: user.id, nickname: user.nickname, certStatus: user.certStatus, role: user.role, reviewedAt: new Date().toISOString() };
    },
    { summary: '认证审批' },
  );

  router.post(
    '/api/admin/content/:id/review',
    (ctx) => {
      ctx.role('admin');
      const id = ctx.num('id', { required: true });
      const action = ctx.str('action', { required: true });
      if (!['pass', 'reject'].includes(action)) throw Errors.badRequest('action 必须是 pass / reject');
      const reason = ctx.str('reason', { max: 200 });
      const article = reviewContent(store, id, action as 'pass' | 'reject', reason);
      return {
        id: article.id,
        title: article.title,
        auditStatus: article.auditStatus,
        reviewedAt: new Date().toISOString(),
        reason: reason || undefined,
      };
    },
    { summary: '内容复审' },
  );

  router.get(
    '/api/admin/audit-queue',
    (ctx) => {
      ctx.role('admin');
      const { page, pageSize } = ctx.pagination(20);
      const rows = [...store.auditLogs.values()]
        .filter((l) => (ctx.str('reviewStatus') ? l.reviewStatus === ctx.str('reviewStatus') : l.reviewStatus === 'manual_pending'))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map((l) => ({
          ...l,
          articleTitle: l.bizId ? store.articles.get(l.bizId)?.title : undefined,
          authorNickname: l.bizId ? store.users.get(store.articles.get(l.bizId)?.authorId ?? 0)?.nickname : undefined,
        }));
      return pageOf(rows, page, pageSize);
    },
    { summary: '人工复审队列（运营视角）' },
  );

  router.post(
    '/api/admin/seed',
    (ctx) => {
      ctx.role('admin');
      const counts = reseedStore(store);
      return { ok: true, message: '演示数据已重置', counts };
    },
    { summary: '重置演示数据' },
  );
}
