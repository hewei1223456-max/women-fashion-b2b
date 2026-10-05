import type { ArticleSummary, LandmarkShop, UserBrief } from '@wfb/shared-types';
import type { Store } from '../../core/db';
import { Errors } from '../../core/server';
import { toUserBrief } from '../../core/security';
import { toArticleSummary } from '../../gateway/platform';

/* =========================================================================
 * 地标大店（docs/API.md 第 5 节）
 * ========================================================================= */

export interface LandmarkView extends LandmarkShop {
  user: UserBrief;
  followed: boolean;
  /** 该大店的关注者（关注其 userId 的人数，实时计算） */
  realFollowerCount: number;
}

export function landmarkView(store: Store, lm: LandmarkShop, viewerId?: number): LandmarkView {
  const realFollowerCount = [...store.follows.values()].filter((f) => f.followingId === lm.userId).length;
  const followed = viewerId ? [...store.follows.values()].some((f) => f.followerId === viewerId && f.followingId === lm.userId) : false;
  const articleCount = [...store.articles.values()].filter((a) => a.authorId === lm.userId && !a.deleted).length;
  return {
    ...lm,
    articleCount: articleCount || lm.articleCount,
    followerCount: Math.max(lm.followerCount, realFollowerCount),
    user: toUserBrief(store.users.get(lm.userId)),
    followed,
    realFollowerCount,
  };
}

export interface LandmarkDetail extends LandmarkView {
  methodologies: ArticleSummary[];
  articles: ArticleSummary[];
  /** 大店画像标签（来自内容风格统计） */
  topStyles: string[];
  stats: { articles: number; views: number; likes: number; collects: number; periods: number };
}

export function landmarkDetail(store: Store, id: number, viewerId?: number): LandmarkDetail {
  const lm = store.landmarks.get(id);
  if (!lm) throw Errors.notFound('大店不存在');

  const rows = [...store.articles.values()]
    .filter((a) => a.authorId === lm.userId && !a.deleted && a.auditStatus === 'approved')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const styleCounter = new Map<string, number>();
  rows.forEach((a) => a.styleTags.forEach((s) => styleCounter.set(s, (styleCounter.get(s) ?? 0) + 1)));
  const topStyles = [...styleCounter.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s).slice(0, 4);

  // 方法论：methodology / distillation / guide 三类都算「可复用方法论」
  const methodologies = rows
    .filter((a) => ['methodology', 'distillation', 'guide'].includes(a.type))
    .slice(0, 10)
    .map((a) => toArticleSummary(store, a, { reason: `${lm.shopName} 方法论` }));

  return {
    ...landmarkView(store, lm, viewerId),
    methodologies,
    articles: rows.slice(0, 12).map((a) => toArticleSummary(store, a)),
    topStyles,
    stats: {
      articles: rows.length,
      views: rows.reduce((s, a) => s + a.viewCount, 0),
      likes: rows.reduce((s, a) => s + a.likeCount, 0),
      collects: rows.reduce((s, a) => s + a.collectCount, 0),
      periods: lm.periods,
    },
  };
}
