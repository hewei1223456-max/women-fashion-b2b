import type { CreateGroupBuyDto, GroupBuy, User } from '@wfb/shared-types';
import type { Store } from '../../core/db';
import { nextId } from '../../core/db';
import { Errors } from '../../core/server';
import { toUserBrief } from '../../core/security';
import { pushNotification, toProduct, trackBehavior } from '../../gateway/platform';

/* =========================================================================
 * 拼单（docs/API.md 第 11 节）
 * 成团规则：currentCount >= targetCount → status = formed
 * ========================================================================= */

export function groupBuyView(store: Store, g: GroupBuy, viewerId?: number): GroupBuy {
  if (!g) return g;
  const members = [...store.groupBuyMembers.values()].filter((m) => m.groupBuyId === g.id);
  return {
    ...g,
    currentCount: Math.max(g.currentCount, 0),
    initiator: toUserBrief(store.users.get(g.initiatorId)),
    product: g.productId ? toProduct(store, store.products.get(g.productId)) : undefined,
    joined: viewerId ? members.some((m) => m.userId === viewerId) : false,
  };
}

export function memberCount(store: Store, groupBuyId: number): number {
  return [...store.groupBuyMembers.values()].filter((m) => m.groupBuyId === groupBuyId).length;
}

export function createGroupBuy(store: Store, user: User, dto: CreateGroupBuyDto): GroupBuy {
  const title = String(dto.title ?? '').trim();
  if (title.length < 4) throw Errors.badRequest('拼单标题至少 4 个字');
  const targetCount = Number(dto.targetCount);
  if (!Number.isFinite(targetCount) || targetCount < 2) throw Errors.badRequest('成团人数至少 2 人');
  if (targetCount > 500) throw Errors.badRequest('成团人数不能超过 500');
  const deadlineAt = dto.deadlineAt ? new Date(dto.deadlineAt) : new Date(Date.now() + 7 * 86_400_000);
  if (Number.isNaN(deadlineAt.getTime())) throw Errors.badRequest('截止时间格式不正确');
  if (dto.productId && !store.products.get(dto.productId)) throw Errors.notFound('关联的款不存在');

  const id = nextId(store, 'groupBuys');
  const g: GroupBuy = {
    id,
    initiatorId: user.id,
    productId: dto.productId || undefined,
    title,
    description: String(dto.description ?? '').slice(0, 1000),
    targetCount,
    currentCount: 1,
    status: 'recruiting',
    styleTag: (dto.styleTag ?? '韩系') as never,
    market: dto.market,
    deadlineAt: deadlineAt.toISOString(),
    createdAt: new Date().toISOString(),
    initiator: toUserBrief(user) as never,
    joined: true,
  };
  store.groupBuys.set(id, g);

  const mid = nextId(store, 'groupBuyMembers');
  store.groupBuyMembers.set(mid, { id: mid, groupBuyId: id, userId: user.id, createdAt: new Date().toISOString() });

  trackBehavior(store, { userId: user.id, action: 'publish', targetType: 'groupbuy', targetId: id, styleTag: g.styleTag });
  return groupBuyView(store, g, user.id);
}

export function joinGroupBuy(store: Store, user: User, id: number): GroupBuy {
  const g = store.groupBuys.get(id);
  if (!g) throw Errors.notFound('拼单不存在');
  if (g.status === 'cancelled') throw Errors.badRequest('该拼单已取消');
  if (g.status === 'completed') throw Errors.badRequest('该拼单已完成，无法参团');

  const already = [...store.groupBuyMembers.values()].find((m) => m.groupBuyId === id && m.userId === user.id);
  if (already) return groupBuyView(store, g, user.id); // 幂等

  if (g.currentCount >= g.targetCount) throw Errors.badRequest('该拼单已满员，无法参团');
  if (new Date(g.deadlineAt).getTime() < Date.now()) throw Errors.badRequest('该拼单已过截止时间');

  const mid = nextId(store, 'groupBuyMembers');
  store.groupBuyMembers.set(mid, { id: mid, groupBuyId: id, userId: user.id, createdAt: new Date().toISOString() });
  g.currentCount += 1;
  if (g.currentCount >= g.targetCount) g.status = 'formed';

  trackBehavior(store, { userId: user.id, action: 'view', targetType: 'groupbuy', targetId: id, styleTag: g.styleTag });

  pushNotification(store, {
    userId: g.initiatorId,
    type: 'system',
    title: g.status === 'formed' ? '拼单成团提醒' : '有人加入了你的拼单',
    body:
      g.status === 'formed'
        ? `《${g.title}》已满 ${g.currentCount}/${g.targetCount} 人成团，可以收款下单了`
        : `${user.nickname} 加入了《${g.title}》，当前 ${g.currentCount}/${g.targetCount} 人`,
    actor: user,
    targetType: 'product',
    targetId: g.productId,
  });
  return groupBuyView(store, g, user.id);
}

export function quitGroupBuy(store: Store, user: User, id: number): GroupBuy {
  const g = store.groupBuys.get(id);
  if (!g) throw Errors.notFound('拼单不存在');
  const member = [...store.groupBuyMembers.values()].find((m) => m.groupBuyId === id && m.userId === user.id);
  if (!member) return groupBuyView(store, g, user.id); // 幂等：本来就没参团

  store.groupBuyMembers.delete(member.id);
  g.currentCount = Math.max(0, g.currentCount - 1);
  if (g.status === 'formed' && g.currentCount < g.targetCount) g.status = 'recruiting';
  if (g.currentCount === 0 && g.initiatorId === user.id) g.status = 'cancelled';

  pushNotification(store, {
    userId: g.initiatorId,
    type: 'system',
    title: '有人退出了你的拼单',
    body: `${user.nickname} 退出了《${g.title}》，当前 ${g.currentCount}/${g.targetCount} 人`,
    actor: user,
    targetType: 'product',
    targetId: g.productId,
  });
  return groupBuyView(store, g, user.id);
}
