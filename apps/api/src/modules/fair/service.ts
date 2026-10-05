import type { CreateFairDto, OrderingFair, User } from '@wfb/shared-types';
import { planOf } from '@wfb/shared-types';
import type { Store } from '../../core/db';
import { nextId } from '../../core/db';
import { Errors } from '../../core/server';
import { toUserBrief } from '../../core/security';
import { pushNotification, trackBehavior } from '../../gateway/platform';

/* =========================================================================
 * 订货会（PRD 9.3 厂家版本分层：orderingFair 权限）
 * ========================================================================= */

export function fairView(store: Store, f: OrderingFair, viewerId?: number): OrderingFair {
  if (!f) return f;
  return {
    ...f,
    host: toUserBrief(store.users.get(f.hostId)),
    signedUp: viewerId ? [...store.fairSignups.values()].some((s) => s.fairId === f.id && s.userId === viewerId) : false,
  };
}

export function fairStatus(f: OrderingFair): 'upcoming' | 'ongoing' | 'ended' {
  const now = Date.now();
  const start = new Date(f.startAt).getTime();
  const end = new Date(f.endAt).getTime();
  if (now < start) return 'upcoming';
  if (now <= end) return 'ongoing';
  return 'ended';
}

export function createFair(store: Store, user: User, dto: CreateFairDto): OrderingFair {
  const plan = planOf(user.memberLevel);
  if (!plan.orderingFair && user.role !== 'admin') {
    throw Errors.forbidden(`发布订货会需要「高级版（¥9800/年）」及以上版本，当前版本：${plan.label}`);
  }
  const title = String(dto.title ?? '').trim();
  if (title.length < 4) throw Errors.badRequest('订货会名称至少 4 个字');
  if (!dto.startAt || !dto.endAt) throw Errors.badRequest('请填写开始与结束时间');
  const start = new Date(dto.startAt);
  const end = new Date(dto.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw Errors.badRequest('时间格式不正确');
  if (end.getTime() <= start.getTime()) throw Errors.badRequest('结束时间必须晚于开始时间');

  const id = nextId(store, 'fairs');
  const row: OrderingFair = {
    id,
    hostId: user.id,
    title,
    city: String(dto.city ?? '').trim() || '未填写',
    venue: String(dto.venue ?? '').trim() || '待定',
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    theme: String(dto.theme ?? '').slice(0, 200),
    signup: String(dto.signup ?? '加微信报名').slice(0, 200),
    coverUrl: dto.coverUrl || `https://picsum.photos/seed/fair-new-${id}/800/450`,
    styleTags: (dto.styleTags ?? []) as never,
    signupCount: 0,
    signedUp: false,
    host: toUserBrief(user) as never,
  };
  store.fairs.set(id, row);
  trackBehavior(store, { userId: user.id, action: 'publish', targetType: 'fair', targetId: id, styleTag: row.styleTags[0] as string });
  return fairView(store, row, user.id);
}

export function signupFair(store: Store, user: User, id: number): OrderingFair {
  const f = store.fairs.get(id);
  if (!f) throw Errors.notFound('订货会不存在');
  if (fairStatus(f) === 'ended') throw Errors.badRequest('该订货会已结束');
  const existing = [...store.fairSignups.values()].find((s) => s.fairId === id && s.userId === user.id);
  if (!existing) {
    const sid = nextId(store, 'fairSignups');
    store.fairSignups.set(sid, { id: sid, fairId: id, userId: user.id, createdAt: new Date().toISOString() });
    f.signupCount += 1;
    pushNotification(store, {
      userId: f.hostId,
      type: 'system',
      title: '订货会有新报名',
      body: `${user.nickname} 报名了《${f.title}》，当前报名 ${f.signupCount} 人`,
      actor: user,
      targetId: f.id,
    });
    trackBehavior(store, { userId: user.id, action: 'view', targetType: 'fair', targetId: id, styleTag: f.styleTags[0] as string });
  }
  return fairView(store, f, user.id);
}
