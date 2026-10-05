import type { ContactLogResult, ContactSendResult, DashboardAnalytics, StyleTag, User } from '@wfb/shared-types';
import { MANUFACTURER_PLANS, planOf } from '@wfb/shared-types';
import type { ReceivePreferenceRow, Store, WechatContactLog } from '../../core/db';
import { nextId } from '../../core/db';
import { Errors } from '../../core/server';
import { toUserBrief } from '../../core/security';
import {
  dateKey,
  dayKeyOf,
  lastNDates,
  nextResetAt,
  pushNotification,
  round,
  stableNumber,
  trackBehavior,
} from '../../gateway/platform';

/* =========================================================================
 * 加微追踪 + 厂家数据看板 + 主动私信配额（PRD 9.6 / 7 节接口）
 * ========================================================================= */

/** 店主接收偏好：不存在则创建默认值 */
export function ensurePreference(store: Store, shopOwnerId: number): ReceivePreferenceRow {
  const found = [...store.preferences.values()].find((p) => p.shopOwnerId === shopOwnerId);
  if (found) return found;
  const user = store.users.get(shopOwnerId);
  const id = nextId(store, 'preferences');
  const row: ReceivePreferenceRow = {
    id,
    shopOwnerId,
    stylePreferences: (user?.styleTags ?? []) as unknown as string[],
    priceBandPreferences: user?.priceBand ? [user.priceBand] : [],
    dailyLimit: 10,
    blacklistManufacturerIds: [],
    createdAt: new Date().toISOString(),
  };
  store.preferences.set(id, row);
  return row;
}

export function preferenceOf(store: Store, shopOwnerId: number): ReceivePreferenceRow {
  return ensurePreference(store, shopOwnerId);
}

/** 微信号脱敏：保留前 3 后 2，中间打码（正式环境返回厂家自配微信号） */
export function maskWechat(raw: string): string {
  if (raw.length <= 5) return raw;
  return `${raw.slice(0, 3)}****${raw.slice(-2)}`;
}

export function wechatIdOf(mf: User): string {
  const raw = `wfb${mf.id}${stableNumber(String(mf.id), 1000, 9999, 'wx')}`;
  return maskWechat(raw);
}

/** 近 7 日曝光分布：由行为埋点（action=view）的日分布折算 */
export function exposureShareByDay(store: Store, days: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of days) counts[d] = 0;
  let total = 0;
  for (const b of store.behaviors.values()) {
    if (b.action !== 'view') continue;
    const k = dayKeyOf(b.createdAt);
    if (k in counts) {
      counts[k] += 1;
      total += 1;
    }
  }
  const out: Record<string, number> = {};
  for (const d of days) out[d] = total > 0 ? counts[d] / total : 1 / days.length;
  return out;
}

/** 今日已用主动私信条数 */
export function contactMessagesUsedToday(store: Store, manufacturerId: number): number {
  const today = dateKey();
  let n = 0;
  for (const m of store.contactMessages.values()) {
    if (m.manufacturerId === manufacturerId && dayKeyOf(m.sentAt) === today) n += 1;
  }
  return n;
}

/** GET /api/manufacturer/contact/dashboard */
export function buildDashboard(store: Store, mf: User): DashboardAnalytics {
  const plan = planOf(mf.memberLevel);
  const products = [...store.products.values()].filter((p) => p.manufacturerId === mf.id);
  const articles = [...store.articles.values()].filter((a) => a.authorId === mf.id && !a.deleted);

  const productViews = products.reduce((s, p) => s + p.viewCount, 0);
  const articleViews = articles.reduce((s, a) => s + a.viewCount, 0);
  const exposure = productViews + articleViews;

  const logs = [...store.contactLogs.values()].filter((l) => l.manufacturerId === mf.id);
  const contacts = logs.length;
  const converted = logs.filter((l) => l.followUpStatus === 'converted').length;
  const contactRate = exposure > 0 ? round((contacts / exposure) * 100, 2) : 0;

  const likes = products.reduce((s, p) => s + p.likeCount, 0) + articles.reduce((s, a) => s + a.likeCount, 0);
  const comments = products.reduce((s, p) => s + p.commentCount, 0) + articles.reduce((s, a) => s + a.commentCount, 0);
  const collects = products.reduce((s, p) => s + p.collectCount, 0) + articles.reduce((s, a) => s + a.collectCount, 0);

  const days = lastNDates(7);
  const share = exposureShareByDay(store, days);
  const trend = days.map((d) => ({
    date: d,
    exposure: Math.round(exposure * (share[d] ?? 0)),
    contacts: logs.filter((l) => dayKeyOf(l.contactedAt) === d).length,
  }));

  // 转化漏斗：高级版（funnel）与企业版（full）可见，其余返回 null
  const funnelVisible = plan.dashboard === 'funnel' || plan.dashboard === 'full';
  const detailViews = Math.round(exposure * 0.22); // 曝光的详情页点击率按 22% 估算
  const contactClicks = Math.max(contacts, Math.round(contacts * 1.38));
  const funnel = funnelVisible
    ? [
        { stage: '曝光', value: exposure },
        { stage: '详情页浏览', value: Math.max(contacts, Math.min(detailViews, exposure)) },
        { stage: '加微点击', value: Math.min(contactClicks, Math.max(contacts, Math.min(detailViews, exposure))) },
        { stage: '加微成功', value: contacts },
        { stage: '成交客户', value: converted },
      ]
    : null;

  const used = contactMessagesUsedToday(store, mf.id);
  return {
    exposure,
    contacts,
    contactRate,
    likes,
    comments,
    collects,
    funnel,
    trend,
    quota: { used, limit: plan.dailyMessages, resetAt: nextResetAt() },
  };
}

/** POST /api/contact/log */
export function logContact(
  store: Store,
  owner: User,
  dto: { manufacturerId: number; productId?: number; articleId?: number; source: string },
): ContactLogResult {
  const mf = store.users.get(dto.manufacturerId);
  if (!mf) throw Errors.notFound('厂家不存在');
  if (mf.id === owner.id) throw Errors.badRequest('不能给自己加微');

  const id = nextId(store, 'contactLogs');
  const now = new Date().toISOString();
  const row: WechatContactLog = {
    id,
    shopOwnerId: owner.id,
    manufacturerId: mf.id,
    productId: dto.productId || undefined,
    articleId: dto.articleId || undefined,
    source: dto.source || 'unknown',
    contactedAt: now,
    followUpStatus: 'pending',
  };
  store.contactLogs.set(id, row);

  // 内容 / 款 的加微计数联动
  const product = dto.productId ? store.products.get(dto.productId) : undefined;
  if (product) {
    product.contactCount += 1;
    product.contactRate = product.viewCount > 0 ? Math.round((product.contactCount / product.viewCount) * 1000) / 1000 : 0;
  }
  const article = dto.articleId ? store.articles.get(dto.articleId) : undefined;
  if (article) article.contactCount += 1;

  // 给厂家发通知
  pushNotification(store, {
    userId: mf.id,
    type: 'contact',
    title: '有店主加了你的微信',
    body: `${owner.nickname}${product ? `通过《${product.title.slice(0, 16)}》` : ''}加了你（来源：${row.source}）`,
    actor: owner,
    targetType: product ? 'product' : article ? 'article' : undefined,
    targetId: product?.id ?? article?.id,
  });

  // 埋点：推荐引擎与厂家转化统计的输入
  trackBehavior(store, {
    userId: owner.id,
    action: 'contact',
    targetType: product ? 'product' : article ? 'article' : 'manufacturer',
    targetId: product?.id ?? article?.id ?? mf.id,
    styleTag: (product?.styleTag ?? article?.styleTags?.[0]) as string | undefined,
  });

  return {
    wechatId: wechatIdOf(mf),
    wechatQrcodeUrl: `https://picsum.photos/seed/wx-${mf.id}/400/400`,
    productId: dto.productId || undefined,
    suggestions: [
      { key: 'rewrite', label: '把这批货写成一条种草文案', path: '/pages/tools/rewrite' },
      { key: 'ai-image', label: '一键生成商品主图 / 海报', path: '/pages/tools/ai-image' },
      { key: 'groupbuy', label: '去拼单广场凑量压价', path: '/pages/source/groupbuy' },
      { key: 'manufacturer', label: '看该厂家的其他款', path: `/pages/source/manufacturer?id=${mf.id}` },
    ],
    logged: true,
  };
}

/** 给会话追加一条私信（消息中心可见） */
function appendMessage(store: Store, sender: User, receiver: User, content: string, productId?: number) {
  const now = new Date().toISOString();
  let convo = [...store.conversations.values()].find(
    (c) => (c.userAId === sender.id && c.userBId === receiver.id) || (c.userAId === receiver.id && c.userBId === sender.id),
  );
  if (!convo) {
    const id = nextId(store, 'conversations');
    convo = {
      id,
      userAId: Math.min(sender.id, receiver.id),
      userBId: Math.max(sender.id, receiver.id),
      unreadA: 0,
      unreadB: 0,
      unreadCount: 0,
      peer: toUserBrief(receiver) as never,
      lastMessage: content,
      lastMessageAt: now,
    };
    store.conversations.set(id, convo);
  }
  const mid = nextId(store, 'messages');
  store.messages.set(mid, {
    id: mid,
    conversationId: convo.id,
    senderId: sender.id,
    receiverId: receiver.id,
    contentType: 'text',
    content,
    isRead: false,
    createdAt: now,
  });
  if (convo.userAId === receiver.id) convo.unreadA += 1;
  else convo.unreadB += 1;
  convo.unreadCount = convo.unreadA + convo.unreadB;
  convo.lastMessage = content;
  convo.lastMessageAt = now;
  return mid;
}

/** POST /api/manufacturer/contact/send —— 超配额返回 sent:false，不抛错 */
export function sendContactMessage(
  store: Store,
  mf: User,
  dto: { shopOwnerId: number; content: string; productId?: number },
): ContactSendResult {
  const plan = planOf(mf.memberLevel);
  const used = contactMessagesUsedToday(store, mf.id);
  const remaining = (u: number) => (plan.dailyMessages < 0 ? -1 : Math.max(0, plan.dailyMessages - u));

  if (plan.dailyMessages >= 0 && used >= plan.dailyMessages) {
    const next = MANUFACTURER_PLANS.find((p) => p.price > plan.price) ?? MANUFACTURER_PLANS[MANUFACTURER_PLANS.length - 1];
    return {
      sent: false,
      remainingQuota: 0,
      reason: `今日主动私信配额已用完（${plan.label} ${plan.dailyMessages} 条/日），升级「${next.label}」可提升到 ${next.dailyMessages < 0 ? '不限量' : `${next.dailyMessages} 条/日`}`,
    };
  }

  const owner = store.users.get(dto.shopOwnerId);
  if (!owner) throw Errors.notFound('店主不存在');
  if (owner.role !== 'shop_owner' && owner.role !== 'landmark') throw Errors.badRequest('只能对店主发送主动私信');
  if (owner.pushEnabled === false) {
    return { sent: false, remainingQuota: remaining(used), reason: '对方已关闭主动私信接收（接收偏好：关闭推送）' };
  }

  const pref = ensurePreference(store, owner.id);
  if ((pref.blacklistManufacturerIds ?? []).includes(mf.id)) {
    return { sent: false, remainingQuota: remaining(used), reason: '对方已将你加入黑名单' };
  }
  const todayToOwner = [...store.contactMessages.values()].filter(
    (m) => m.shopOwnerId === owner.id && dayKeyOf(m.sentAt) === dateKey(),
  ).length;
  if (todayToOwner >= (pref.dailyLimit ?? 10)) {
    return {
      sent: false,
      remainingQuota: remaining(used),
      reason: `对方今日接收私信已达上限（${pref.dailyLimit} 条/日），明天再试或换一位店主`,
    };
  }

  const id = nextId(store, 'contactMessages');
  const sentAt = new Date().toISOString();
  store.contactMessages.set(id, {
    id,
    manufacturerId: mf.id,
    shopOwnerId: owner.id,
    content: dto.content,
    productId: dto.productId || undefined,
    sentAt,
    isRead: false,
  });

  appendMessage(store, mf, owner, dto.content, dto.productId);

  pushNotification(store, {
    userId: owner.id,
    type: 'message',
    title: '收到一条厂家私信',
    body: `${mf.companyName ?? mf.nickname}：${dto.content.slice(0, 28)}`,
    actor: mf,
    targetType: dto.productId ? 'product' : undefined,
    targetId: dto.productId,
  });

  return { sent: true, remainingQuota: remaining(used + 1) };
}

/** 加微记录列表（带店主与款摘要） */
export function contactListRows(store: Store, manufacturerId: number, status?: string, keyword?: string) {
  return [...store.contactLogs.values()]
    .filter((l) => l.manufacturerId === manufacturerId)
    .filter((l) => (status ? l.followUpStatus === status : true))
    .filter((l) => {
      if (!keyword) return true;
      const p = l.productId ? store.products.get(l.productId) : undefined;
      const o = store.users.get(l.shopOwnerId);
      return `${p?.title ?? ''}${o?.nickname ?? ''}`.includes(keyword);
    })
    .sort((a, b) => new Date(b.contactedAt).getTime() - new Date(a.contactedAt).getTime())
    .map((l) => ({
      ...l,
      shopOwner: toUserBrief(store.users.get(l.shopOwnerId)),
      productTitle: l.productId ? store.products.get(l.productId)?.title : undefined,
    }));
}

export type { StyleTag };
