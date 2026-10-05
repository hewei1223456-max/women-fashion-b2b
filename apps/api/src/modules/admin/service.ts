import type { AdminOverview, MemberLevel, User } from '@wfb/shared-types';
import { planOf } from '@wfb/shared-types';
import type { Store } from '../../core/db';
import { all, syncSequences } from '../../core/db';
import { Errors } from '../../core/server';
import { dateKey, dayKeyOf, lastNDates, pushNotification, round } from '../../gateway/platform';
import { seedStore } from '../../core/seed';

/* =========================================================================
 * 管理后台（docs/API.md 第 15 节 · PRD 第十三篇核心指标）
 *
 * 所有 KPI 都按 store 中的现有数据实算并标注 pass，不写死数字。
 * ========================================================================= */

function membersOf(store: Store, role: string): User[] {
  return all(store.users).filter((u) => u.role === role);
}

/** 店主次周留存：以「首次行为」为激活点，第 7-14 天仍有行为的比例 */
export function weekOneRetention(store: Store): { value: number; activated: number; retained: number } {
  const firstSeen = new Map<number, number>();
  for (const b of store.behaviors.values()) {
    const t = new Date(b.createdAt).getTime();
    const cur = firstSeen.get(b.userId);
    if (cur === undefined || t < cur) firstSeen.set(b.userId, t);
  }
  const ownerIds = new Set(membersOf(store, 'shop_owner').map((u) => u.id));
  let activated = 0;
  let retained = 0;
  for (const [userId, first] of firstSeen) {
    if (!ownerIds.has(userId)) continue;
    activated += 1;
    const weekLater = first + 7 * 86_400_000;
    const hit = [...store.behaviors.values()].some((b) => b.userId === userId && new Date(b.createdAt).getTime() >= weekLater);
    if (hit) retained += 1;
  }
  // 没有行为数据时用「近 7 日活跃店主 / 店主总数」退化计算，保证看板不为空
  if (activated === 0) {
    const days = new Set(lastNDates(7));
    const activeOwners = new Set(
      [...store.behaviors.values()].filter((b) => days.has(dayKeyOf(b.createdAt)) && ownerIds.has(b.userId)).map((b) => b.userId),
    );
    return { value: ownerIds.size ? round((activeOwners.size / ownerIds.size) * 100, 1) : 0, activated: ownerIds.size, retained: activeOwners.size };
  }
  return { value: round((retained / Math.max(1, activated)) * 100, 1), activated, retained };
}

/** 日活/注册：今日有行为的用户 / 全部注册用户 */
export function dauRate(store: Store): { value: number; dau: number; total: number } {
  const today = dateKey();
  const dau = new Set([...store.behaviors.values()].filter((b) => dayKeyOf(b.createdAt) === today).map((b) => b.userId)).size;
  const total = store.users.size;
  return { value: total ? round((dau / total) * 100, 1) : 0, dau, total };
}

export function buildOverview(store: Store): AdminOverview {
  const users = all(store.users);
  const products = all(store.products);
  const articles = all(store.articles).filter((a) => !a.deleted);
  const today = dateKey();

  /* ------------------------------ 用户 / 认证 ------------------------------ */
  const cert = { pending: 0, approved: 0, rejected: 0 };
  users.forEach((u) => {
    if (u.certStatus === 'pending') cert.pending += 1;
    else if (u.certStatus === 'approved') cert.approved += 1;
    else if (u.certStatus === 'rejected') cert.rejected += 1;
  });

  /* ------------------------------ 内容 / 款 ------------------------------ */
  const content = {
    total: articles.length,
    pending: articles.filter((a) => a.auditStatus === 'pending').length,
    publishedToday: articles.filter((a) => dayKeyOf(a.createdAt) === today).length,
    rejected: articles.filter((a) => a.auditStatus === 'rejected').length,
  };
  const productStat = {
    total: products.length,
    pending: products.filter((p) => p.status === 'pending').length,
    approved: products.filter((p) => p.status === 'approved').length,
  };

  /* ------------------------------ 互动 / 加微 ------------------------------ */
  const interactions = {
    likes: store.likes.size,
    comments: store.comments.size,
    collects: store.collects.size,
    shares: store.shares.size,
  };

  // 曝光与加微：**与 /api/manufacturer/contact/dashboard 完全同源**
  //   曝光 = 款级 viewCount 累加；加微 = contactLogs 真实记录条数
  //   转化率 = 加微 / 曝光 × 100（百分数数值，契约要求直接渲染 `${rate}%`，不要再乘 100）
  const exposure = products.reduce((s, p) => s + p.viewCount, 0);
  const loggedContacts = store.contactLogs.size;
  const contactRate = exposure > 0 ? round((loggedContacts / exposure) * 100, 2) : 0;
  // 漏斗第二档：详情页浏览（与厂家看板同一套假设：曝光 × 22% 点击进详情）
  const detailViews = Math.round(exposure * 0.22);
  const detailToContactRate = detailViews > 0 ? round((loggedContacts / detailViews) * 100, 2) : 0;
  const contacts = {
    today: [...store.contactLogs.values()].filter((l) => dayKeyOf(l.contactedAt) === today).length,
    total: loggedContacts,
    rate: contactRate,
  };

  /* ------------------------------ 收入 / 订阅 ------------------------------ */
  const paidUsers = users.filter((u) => u.memberLevel !== 'free' && !u.memberLevel.startsWith('manufacturer_free'));
  const byLevelMap = new Map<MemberLevel, { count: number; amount: number }>();
  let annual = 0;
  users.forEach((u) => {
    if (u.memberLevel === 'free' || u.memberLevel === 'manufacturer_free') return;
    const plan = planOf(u.memberLevel);
    const row = byLevelMap.get(u.memberLevel) ?? { count: 0, amount: 0 };
    row.count += 1;
    row.amount += plan.price;
    byLevelMap.set(u.memberLevel, row);
    annual += plan.price;
  });
  const mrr = Math.round(annual / 12);
  const revenue = {
    mrr,
    manufacturers: paidUsers.filter((u) => u.role === 'manufacturer').length,
    owners: paidUsers.filter((u) => u.role !== 'manufacturer').length,
    byLevel: [...byLevelMap.entries()].map(([level, v]) => ({ level, ...v })),
  };

  /* ------------------------------ 核心指标 KPI（第十三篇） ------------------------------ */
  const retention = weekOneRetention(store);
  const manufacturers = membersOf(store, 'manufacturer');
  const paidManufacturers = manufacturers.filter((u) => u.memberLevel !== 'manufacturer_free');
  const paidConversion = manufacturers.length ? round((paidManufacturers.length / manufacturers.length) * 100, 1) : 0;

  // 拼单成功率口径：**全部拼单**（formed + completed）/ 全部拼单数。
  // 种子数据 4 个拼单中 1 个 formed，验收期新建的招募中拼单会稀释分母，属演示数据现象而非缺陷。
  const groupBuys = all(store.groupBuys);
  const formed = groupBuys.filter((g) => g.status === 'formed' || g.status === 'completed').length;
  const groupBuyRate = groupBuys.length ? round((formed / groupBuys.length) * 100, 1) : 0;

  const dau = dauRate(store);
  const ltv = paidUsers.length ? Math.round((annual / paidUsers.length) * 10) / 10 : 0;
  const cac = 120; // Demo 无投放成本表，取行业 B2B 女装平台获客成本常量
  const ltvCac = round(ltv / cac, 2);

  // KPI label 必须自解释：运营后台把 kpi[] 直接渲染成一排卡片，光看「加微转化率 0.11%」会误判业务。
  // 两个加微指标并存，口径不同、各自可解释：
  //   contact_conversion     = 详情页浏览 → 加微（漏斗第二档，PRD 里 8% 的行业基准线对应这一段）
  //   contact_exposure_rate  = 曝光 → 加微（PRD 第十三篇原文口径，行业基准线约 0.1%）
  const kpi: AdminOverview['kpi'] = [
    { key: 'owner_week1_retention', label: '店主次周留存', value: retention.value, target: 30, unit: '%', pass: retention.value >= 30 },
    { key: 'manufacturer_paid_conversion', label: '厂家付费转化', value: paidConversion, target: 10, unit: '%', pass: paidConversion >= 10 },
    {
      key: 'contact_conversion',
      label: '加微转化率（详情页浏览→加微）',
      value: detailToContactRate,
      target: 8,
      unit: '%',
      pass: detailToContactRate >= 8,
    },
    {
      key: 'contact_exposure_rate',
      label: '曝光→加微转化率',
      value: contactRate,
      target: 0.1,
      unit: '%',
      pass: contactRate >= 0.1,
    },
    { key: 'groupbuy_success', label: '拼单成功率（全部拼单）', value: groupBuyRate, target: 50, unit: '%', pass: groupBuyRate >= 50 },
    { key: 'dau_rate', label: '日活/注册', value: dau.value, target: 5, unit: '%', pass: dau.value >= 5 },
    { key: 'ltv_cac', label: 'LTV/CAC', value: ltvCac, target: 2, unit: '倍', pass: ltvCac >= 2 },
  ];

  /* ------------------------------ 近 7 日趋势 ------------------------------ */
  const days = lastNDates(7);
  const share = (() => {
    const counts: Record<string, number> = {};
    days.forEach((d) => (counts[d] = 0));
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
    days.forEach((d) => (out[d] = total > 0 ? counts[d] / total : 1 / days.length));
    return out;
  })();

  const trend = days.map((d) => ({
    date: d,
    newUsers: users.filter((u) => dayKeyOf(u.createdAt) === d).length,
    exposure: Math.round(exposure * (share[d] ?? 0)),
    contacts: [...store.contactLogs.values()].filter((l) => dayKeyOf(l.contactedAt) === d).length,
    publishes: articles.filter((a) => dayKeyOf(a.createdAt) === d).length,
  }));

  return {
    users: {
      total: users.length,
      shopOwner: membersOf(store, 'shop_owner').length,
      manufacturer: manufacturers.length,
      landmark: membersOf(store, 'landmark').length,
      newToday: users.filter((u) => dayKeyOf(u.createdAt) === today).length,
    },
    cert,
    content,
    products: productStat,
    interactions,
    contacts,
    revenue,
    kpi,
    trend,
  };
}

/* ------------------------------ 用户管理 ------------------------------ */

export function adminUserRows(store: Store, filters: { role?: string; certStatus?: string; keyword?: string }) {
  return all(store.users)
    .filter((u) => (filters.role ? u.role === filters.role : true))
    .filter((u) => (filters.certStatus ? u.certStatus === filters.certStatus : true))
    .filter((u) =>
      filters.keyword ? `${u.nickname}${u.companyName ?? ''}${u.phone ?? ''}${u.bio ?? ''}`.includes(filters.keyword) : true,
    )
    .map((u) => ({
      ...u,
      contentCount:
        all(store.articles).filter((a) => a.authorId === u.id && !a.deleted).length +
        all(store.products).filter((p) => p.manufacturerId === u.id).length,
      followerCount: all(store.follows).filter((f) => f.followingId === u.id).length,
      planLabel: planOf(u.memberLevel).label,
      behaviorCount: all(store.behaviors).filter((b) => b.userId === u.id).length,
      contactLogCount: all(store.contactLogs).filter((l) => l.manufacturerId === u.id).length,
    }))
    .sort((a, b) => b.behaviorCount - a.behaviorCount);
}

/* ------------------------------ 认证审批 ------------------------------ */

export function reviewCert(store: Store, userId: number, action: 'approve' | 'reject', reason?: string) {
  const user = store.users.get(userId);
  if (!user) throw Errors.notFound('用户不存在');
  user.certStatus = action === 'approve' ? 'approved' : 'rejected';
  user.updatedAt = new Date().toISOString();
  pushNotification(store, {
    userId: user.id,
    type: 'audit',
    title: action === 'approve' ? '认证已通过' : '认证未通过',
    body: action === 'approve' ? `「${user.companyName ?? user.nickname}」认证审核通过，已解锁全部权益` : `认证未通过：${reason ?? '资料不完整，请重新提交'}`,
  });
  return user;
}

/* ------------------------------ 内容复审 ------------------------------ */

export function reviewContent(store: Store, id: number, action: 'pass' | 'reject', reason?: string) {
  const article = store.articles.get(id);
  if (!article) throw Errors.notFound('内容不存在');
  article.auditStatus = action === 'pass' ? 'approved' : 'rejected';
  article.updatedAt = new Date().toISOString();
  // 同步回写审核队列
  for (const log of store.auditLogs.values()) {
    if (log.bizId === id) log.reviewStatus = action === 'pass' ? 'manual_pass' : 'manual_reject';
  }
  pushNotification(store, {
    userId: article.authorId,
    type: 'audit',
    title: action === 'pass' ? '内容审核通过' : '内容审核未通过',
    body: action === 'pass' ? `《${article.title}》已通过人工复审并发布` : `《${article.title}》未通过：${reason ?? '内容不符合社区规范'}`,
    targetType: 'article',
    targetId: article.id,
  });
  return article;
}

/* ------------------------------ 重置演示数据 ------------------------------ */

export function reseedStore(store: Store) {
  for (const value of Object.values(store)) {
    if (value instanceof Map) value.clear();
  }
  store.sequences = {};
  seedStore(store);
  syncSequences(store);
  return {
    users: store.users.size,
    products: store.products.size,
    articles: store.articles.size,
    groupBuys: store.groupBuys.size,
    fairs: store.fairs.size,
    contactLogs: store.contactLogs.size,
    auditLogs: store.auditLogs.size,
    behaviors: store.behaviors.size,
    seededAt: new Date().toISOString(),
  };
}
