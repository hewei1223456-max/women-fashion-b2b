import type { ArticleSummary, Draft, Paged, ProfileDetail, StyleTag, User, UserBrief } from '@wfb/shared-types';
import { PRICE_BANDS, STYLE_TAGS } from '@wfb/shared-types';
import type { ArticleRow, ProductRow, Store } from '../../core/db';
import { all, byTimeDesc, pageOf } from '../../core/db';
import { toUserBrief } from '../../core/security';
import { Errors } from '../../core/server';

/* =========================================================================
 * 个人主页业务逻辑
 *
 *   ProfileDetail：主页头部（关注/粉丝/获赞/作品数 + 厂家视角款数与加微转化率）
 *   6 个列表：作品（works/draft）/ 收藏 / 喜欢 / 粉丝 / 关注
 *
 * 对外一律 toUserBrief()，绝不把 User 原样返回给别人（手机号 / openid / 营业执照只属于本人）。
 * ========================================================================= */

export interface UpdateProfileInput {
  nickname?: string;
  avatarUrl?: string;
  bio?: string;
  styleTags?: string[];
  priceBand?: string;
  sourcingCities?: string[];
  pushEnabled?: boolean;
}

/* ------------------------------ 主页详情 ------------------------------ */

export function profileOf(store: Store, userId: number, viewerId: number | null): ProfileDetail {
  const user = store.users.get(userId);
  if (!user) throw Errors.notFound('用户不存在');

  const isSelf = viewerId === userId;
  const follows = all(store.follows);
  const followerCount = follows.filter((f) => f.followingId === userId).length;
  const followingCount = follows.filter((f) => f.followerId === userId).length;
  const followed = viewerId ? follows.some((f) => f.followerId === viewerId && f.followingId === userId) : false;

  const articles = all(store.articles).filter((a) => a.authorId === userId && !a.deleted && a.auditStatus !== 'rejected');
  const products = all(store.products).filter((p) => p.manufacturerId === userId && p.status !== 'rejected');
  const collectCount = all(store.collects).filter((c) => c.userId === userId).length;
  const likeReceived =
    articles.reduce((sum, a) => sum + (a.likeCount ?? 0), 0) +
    (user.role === 'manufacturer' ? products.reduce((sum, p) => sum + (p.likeCount ?? 0), 0) : 0);

  const landmark = all(store.landmarks).find((l) => l.userId === userId);
  /* 货源视角：只有真的发过款的厂家才下发这两个字段 */
  const isManufacturer = products.length > 0;
  const exposure = products.reduce((sum, p) => sum + (p.viewCount ?? 0), 0);
  const contacts = products.reduce((sum, p) => sum + (p.contactCount ?? 0), 0);

  return {
    user: toUserBrief(user, { followerCount, contentCount: articles.length }) as UserBrief,
    isSelf,
    followed,
    followerCount,
    followingCount,
    likeReceived,
    collectCount,
    contentCount: articles.length,
    landmark,
    productCount: isManufacturer ? products.length : undefined,
    contactRate: isManufacturer ? Math.round((contacts / Math.max(1, exposure)) * 1000) / 1000 : undefined,
    /* 自己不能私信自己；运营账号不接私信；其余用户均可被私信 */
    canMessage: !isSelf && user.role !== 'admin',
  };
}

/* ------------------------------ 更新资料 ------------------------------ */

export function updateProfile(store: Store, user: User, input: UpdateProfileInput): User {
  if (input.nickname !== undefined) {
    const nickname = input.nickname.trim();
    if (!nickname) throw Errors.badRequest('昵称不能为空');
    if (nickname.length > 20) throw Errors.badRequest('昵称长度不能超过 20 个字符');
    user.nickname = nickname;
  }
  if (input.avatarUrl !== undefined) user.avatarUrl = input.avatarUrl.trim();
  if (input.bio !== undefined) user.bio = input.bio.trim().slice(0, 100);
  if (input.styleTags !== undefined) {
    const tags = input.styleTags.map((t) => String(t).trim()).filter((t) => (STYLE_TAGS as readonly string[]).includes(t));
    if (!tags.length) throw Errors.badRequest('请至少选择一个有效的风格标签');
    user.styleTags = Array.from(new Set(tags)).slice(0, 5) as StyleTag[];
  }
  if (input.priceBand !== undefined && input.priceBand !== '') {
    if (!(PRICE_BANDS as readonly string[]).includes(input.priceBand)) {
      throw Errors.badRequest(`priceBand 仅支持 ${PRICE_BANDS.join(' / ')}`);
    }
    user.priceBand = input.priceBand;
  }
  if (input.sourcingCities !== undefined) {
    user.sourcingCities = input.sourcingCities
      .map((c) => String(c).trim())
      .filter(Boolean)
      .slice(0, 5);
  }
  if (input.pushEnabled !== undefined) user.pushEnabled = input.pushEnabled;
  user.updatedAt = new Date().toISOString();
  return user;
}

/* ------------------------------ 作品 / 草稿 ------------------------------ */

export function contentList(
  store: Store,
  userId: number,
  viewerId: number | null,
  tab: string,
  page: number,
  pageSize: number,
): Paged<unknown> {
  const user = store.users.get(userId);
  if (!user) throw Errors.notFound('用户不存在');
  const isSelf = viewerId === userId;

  if (tab === 'draft') {
    if (!isSelf) throw Errors.forbidden('草稿箱仅本人可见');
    const rows = all(store.drafts)
      .filter((d) => d.userId === userId && !d.deleted)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return pageOf(
      rows.map((d) => draftCard(store, d, user)),
      page,
      pageSize,
    );
  }

  const rows = all(store.articles)
    .filter((a) => a.authorId === userId && !a.deleted && a.auditStatus !== 'rejected')
    /* 别人只能看到审核通过的；本人还能看到审核中的 */
    .filter((a) => isSelf || a.auditStatus === 'approved')
    .sort((a, b) => Number(b.topped) - Number(a.topped) || byTimeDesc(a, b));

  return pageOf(
    rows.map((a) => articleSummary(store, a)),
    page,
    pageSize,
  );
}

/* ------------------------------ 收藏 / 喜欢 ------------------------------ */

export function collectList(store: Store, userId: number, page: number, pageSize: number): Paged<ArticleSummary> {
  requireUser(store, userId);
  const rows = all(store.collects)
    .filter((c) => c.userId === userId)
    .sort(byTimeDesc);
  return pageOf(
    rows
      .map((c) => targetCard(store, c.targetType, c.targetId, c.createdAt))
      .filter(Boolean) as ArticleSummary[],
    page,
    pageSize,
  );
}

export function likeList(store: Store, userId: number, page: number, pageSize: number): Paged<ArticleSummary> {
  requireUser(store, userId);
  const rows = all(store.likes)
    .filter((l) => l.userId === userId && l.targetType !== 'comment')
    .sort(byTimeDesc);
  return pageOf(
    rows
      .map((l) => targetCard(store, l.targetType, l.targetId, l.createdAt))
      .filter(Boolean) as ArticleSummary[],
    page,
    pageSize,
  );
}

/* ------------------------------ 粉丝 / 关注 ------------------------------ */

export function followerList(store: Store, userId: number, page: number, pageSize: number): Paged<UserBrief> {
  requireUser(store, userId);
  const rows = all(store.follows)
    .filter((f) => f.followingId === userId)
    .sort(byTimeDesc);
  return pageOf(
    rows.map((f) => briefOf(store, f.followerId)),
    page,
    pageSize,
  );
}

export function followingList(store: Store, userId: number, page: number, pageSize: number): Paged<UserBrief> {
  requireUser(store, userId);
  const rows = all(store.follows)
    .filter((f) => f.followerId === userId)
    .sort(byTimeDesc);
  return pageOf(
    rows.map((f) => briefOf(store, f.followingId)),
    page,
    pageSize,
  );
}

/* ------------------------------ 内部工具 ------------------------------ */

function requireUser(store: Store, userId: number): User {
  const user = store.users.get(userId);
  if (!user) throw Errors.notFound('用户不存在');
  return user;
}

/** 关注/粉丝列表：带上主页需要的两个计数，避免前端 N+1 */
function briefOf(store: Store, userId: number): UserBrief {
  const user = store.users.get(userId);
  if (!user) return toUserBrief(null) as UserBrief;
  const followerCount = all(store.follows).filter((f) => f.followingId === userId).length;
  const contentCount = all(store.articles).filter((a) => a.authorId === userId && !a.deleted).length;
  return toUserBrief(user, { followerCount, contentCount }) as UserBrief;
}

/** 统一的文章摘要形状（ArticleSummary），列表页/收藏页共用 */
export function articleSummary(store: Store, a: ArticleRow): ArticleSummary {
  return {
    id: a.id,
    title: a.title,
    summary: a.summary,
    coverUrl: a.coverUrl,
    contentType: a.contentType,
    type: a.type,
    styleTags: a.styleTags ?? [],
    topics: a.topics ?? [],
    images: a.images ?? [],
    videoUrl: a.videoUrl,
    viewCount: a.viewCount,
    likeCount: a.likeCount,
    collectCount: a.collectCount,
    commentCount: a.commentCount,
    cesScore: a.cesScore,
    visibility: a.visibility,
    auditStatus: a.auditStatus,
    createdAt: a.createdAt,
    author: toUserBrief(store.users.get(a.authorId)) as UserBrief,
  };
}

/**
 * 收藏 / 喜欢列表：目标可能是文章也可能是款。
 * 统一映射成 ArticleSummary 形状 + targetType / 款字段，前端一套卡片组件即可渲染。
 */
function targetCard(store: Store, targetType: string, targetId: number, at: string): ArticleSummary | null {
  if (targetType === 'article') {
    const a = store.articles.get(targetId);
    if (!a || a.deleted || a.auditStatus === 'rejected') return null;
    return { ...articleSummary(store, a), targetType: 'article', interactedAt: at } as ArticleSummary;
  }
  if (targetType === 'product') {
    const p = store.products.get(targetId);
    if (!p || p.status === 'rejected') return null;
    return productSummary(store, p, at);
  }
  return null;
}

function productSummary(store: Store, p: ProductRow, at: string): ArticleSummary {
  return {
    id: p.id,
    title: p.title,
    summary: (p.description ?? '').slice(0, 60),
    coverUrl: p.images?.[0] ?? '',
    contentType: 'product_card',
    type: 'ugc',
    styleTags: p.styleTag ? [p.styleTag] : [],
    topics: [],
    images: p.images ?? [],
    videoUrl: p.videoUrl,
    viewCount: p.viewCount,
    likeCount: p.likeCount,
    collectCount: p.collectCount,
    commentCount: p.commentCount,
    cesScore: p.score ?? 0,
    visibility: 'public',
    auditStatus: p.status,
    createdAt: p.createdAt,
    author: toUserBrief(store.users.get(p.manufacturerId)) as UserBrief,
    /* 款卡片额外字段：前端据此跳款详情而不是文章详情 */
    targetType: 'product',
    interactedAt: at,
    priceRange: p.priceRange,
    moq: p.moq,
    shipFrom: p.shipFrom,
    contactRate: p.contactRate,
  } as ArticleSummary;
}

/** 草稿箱卡片：与作品列表同构，额外带 isDraft / scheduledAt 便于前端加角标 */
function draftCard(store: Store, d: Draft, user: User) {
  return {
    id: d.id,
    title: d.title || '未命名草稿',
    summary: (d.content ?? '').slice(0, 80),
    coverUrl: d.images?.[0] ?? '',
    contentType: d.contentType,
    type: 'ugc',
    styleTags: d.styleTags ?? [],
    topics: d.topics ?? [],
    images: d.images ?? [],
    videoUrl: d.videoUrl,
    viewCount: 0,
    likeCount: 0,
    collectCount: 0,
    commentCount: 0,
    cesScore: 0,
    visibility: d.visibility,
    auditStatus: 'pending',
    createdAt: d.updatedAt,
    author: toUserBrief(user) as UserBrief,
    isDraft: true,
    targetType: 'draft',
    scheduledAt: d.scheduledAt,
  };
}
