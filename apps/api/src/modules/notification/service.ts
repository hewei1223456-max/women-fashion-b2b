import type { Notification, NotificationType, TargetType } from '@wfb/shared-types';
import { NOTIFICATION_LABELS } from '@wfb/shared-types';
import type { BehaviorRow, NotificationRow, Store } from '../../core/db';
import { all, byTimeDesc, nextId, pageOf } from '../../core/db';
import { toUserBrief } from '../../core/security';

/* =========================================================================
 * 通知 / 埋点 公共服务（notification 域）
 *
 * content / interaction / message 三个模块的写操作统一调用这里，
 * 保证「每次写操作都产生通知 + 一条行为埋点」的口径只有一份实现：
 *   点赞 → 作者        评论 → 作者        回复 → 父评论作者
 *   @   → 被提及者     关注 → 被关注者    私信 → 接收方
 * ========================================================================= */

export const nowIso = () => new Date().toISOString();

export interface PushNotificationInput {
  userId: number;
  type: NotificationType;
  title?: string;
  body?: string;
  actorId?: number;
  targetType?: TargetType;
  targetId?: number;
  /** 审核 / 系统类通知允许发给自己；默认跳过「自己触发自己」的通知 */
  allowSelf?: boolean;
}

/** 写一条通知。返回 null 表示按规则跳过（给自己点赞、给自己评论等噪音） */
export function pushNotification(store: Store, input: PushNotificationInput): NotificationRow | null {
  if (!input.userId) return null;
  if (!input.allowSelf && input.actorId && input.actorId === input.userId) return null;
  const id = nextId(store, 'notifications');
  const row: NotificationRow = {
    id,
    userId: input.userId,
    type: input.type,
    title: input.title ?? NOTIFICATION_LABELS[input.type] ?? '系统通知',
    body: input.body ?? '',
    // 种子里 actor 只存了 { id }，这里保持同一形状，出参时统一补成 UserBrief
    actor: input.actorId ? ({ id: input.actorId } as never) : undefined,
    targetType: input.targetType,
    targetId: input.targetId,
    isRead: false,
    createdAt: nowIso(),
  };
  store.notifications.set(id, row);
  return row;
}

/** 通知出参：actor 补全为 UserBrief（绝不把 User 原样返回） */
export function toNotificationDto(store: Store, row: NotificationRow): Notification {
  return {
    ...row,
    actor: row.actor?.id ? toUserBrief(store.users.get(row.actor.id)) : undefined,
  };
}

export function listNotifications(
  store: Store,
  userId: number,
  q: { type?: NotificationType; unreadOnly?: boolean; page: number; pageSize: number },
) {
  const rows = all(store.notifications)
    .filter((n) => n.userId === userId)
    .filter((n) => !q.type || n.type === q.type)
    .filter((n) => !q.unreadOnly || !n.isRead)
    .sort(byTimeDesc);
  const paged = pageOf(rows, q.page, q.pageSize);
  return { ...paged, list: paged.list.map((r) => toNotificationDto(store, r)) };
}

export function countUnreadNotifications(store: Store, userId: number): number {
  let n = 0;
  for (const row of store.notifications.values()) if (row.userId === userId && !row.isRead) n++;
  return n;
}

/* ------------------------------ 行为埋点 ------------------------------ */

export type BehaviorAction = BehaviorRow['action'];

export interface RecordBehaviorInput {
  userId: number;
  action: BehaviorAction;
  targetType: string;
  targetId: number;
  styleTag?: string;
  keyword?: string;
}

/** 写一条行为埋点（推荐引擎 / 用户画像的输入） */
export function recordBehavior(store: Store, input: RecordBehaviorInput): BehaviorRow {
  const id = nextId(store, 'behaviors');
  const row: BehaviorRow = {
    id,
    userId: input.userId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    keyword: input.keyword,
    styleTag: input.styleTag,
    createdAt: nowIso(),
  };
  store.behaviors.set(id, row);
  return row;
}

/**
 * 关注埋点。
 * 注意：共享契约 `BehaviorRow['action']` 字典目前只有 view/like/collect/comment/share/contact/publish/search/tool，
 * 没有 follow。这里保留语义直接落 'follow'（推荐侧按 action 聚合时不受影响），
 * 已在交付说明中同步给 Lead，后续可在 shared-types 里补进字典。
 */
export function recordFollowBehavior(store: Store, userId: number, targetUserId: number, styleTag?: string): BehaviorRow {
  return recordBehavior(store, {
    userId,
    action: 'follow' as unknown as BehaviorAction,
    targetType: 'user',
    targetId: targetUserId,
    styleTag,
  });
}
