import type { NotificationType } from '@wfb/shared-types';
import { NOTIFICATION_TYPES } from '@wfb/shared-types';
import type { Router } from '../../core/server';
import { Errors } from '../../core/server';
import type { Store } from '../../core/db';
import { countUnreadNotifications, listNotifications } from './service';
import { unreadMessageCount } from '../message/service';

/* =========================================================================
 * 通知模块（docs/API.md 第 10 节下半）
 *   GET /api/notification/list          列表（type / unreadOnly）
 *   PUT /api/notification/read/:id      单条已读
 *   PUT /api/notification/read-all      全部已读
 *   GET /api/notification/unread-count  { notification, message, total }
 * ========================================================================= */

function typeOf(raw: string): NotificationType | undefined {
  const value = String(raw ?? '').trim();
  if (!value) return undefined;
  if (!(NOTIFICATION_TYPES as readonly string[]).includes(value)) throw Errors.badRequest(`type 不合法，可选：${NOTIFICATION_TYPES.join(' / ')}`);
  return value as NotificationType;
}

export function registerNotificationModule(router: Router, store: Store) {
  router.get(
    '/api/notification/list',
    (ctx) => {
      const me = ctx.auth();
      const { page, pageSize } = ctx.pagination(20);
      return listNotifications(store, me.id, { type: typeOf(ctx.str('type')), unreadOnly: ctx.bool('unreadOnly'), page, pageSize });
    },
    { summary: '通知列表（type / unreadOnly）' },
  );

  router.put(
    '/api/notification/read/:id',
    (ctx) => {
      const me = ctx.auth();
      const row = store.notifications.get(ctx.num('id', { required: true }));
      if (!row || row.userId !== me.id) throw Errors.notFound('通知不存在');
      row.isRead = true;
      return { ok: true };
    },
    { summary: '通知标记已读' },
  );

  router.put(
    '/api/notification/read-all',
    (ctx) => {
      const me = ctx.auth();
      let count = 0;
      for (const row of store.notifications.values()) {
        if (row.userId === me.id && !row.isRead) {
          row.isRead = true;
          count++;
        }
      }
      return { ok: true, count };
    },
    { summary: '全部通知标记已读' },
  );

  router.get(
    '/api/notification/unread-count',
    (ctx) => {
      const me = ctx.auth();
      const notification = countUnreadNotifications(store, me.id);
      const message = unreadMessageCount(store, me.id);
      return { notification, message, total: notification + message };
    },
    { summary: '未读数 { notification, message, total }' },
  );
}
