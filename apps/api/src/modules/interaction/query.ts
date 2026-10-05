import type { Store } from '../../core/db';
import type { CollectRow, FollowRow, LikeRow } from '../../core/db';

/* =========================================================================
 * 互动关系查询（只读）
 *
 * likes / collects / follows 三张表都归「互动域」所有，content / message 模块
 * 需要的「我点过赞吗 / 我关注了吗」一律走这里，避免各模块自己扫表导致口径不一致。
 * ========================================================================= */

export type LikeTargetType = LikeRow['targetType'];
export type CollectTargetType = CollectRow['targetType'];

export function findLike(store: Store, userId: number, targetType: LikeTargetType, targetId: number): LikeRow | undefined {
  for (const row of store.likes.values()) {
    if (row.userId === userId && row.targetType === targetType && row.targetId === targetId) return row;
  }
  return undefined;
}

export function findCollect(store: Store, userId: number, targetType: CollectTargetType, targetId: number): CollectRow | undefined {
  for (const row of store.collects.values()) {
    if (row.userId === userId && row.targetType === targetType && row.targetId === targetId) return row;
  }
  return undefined;
}

export function findFollow(store: Store, followerId: number, followingId: number): FollowRow | undefined {
  for (const row of store.follows.values()) {
    if (row.followerId === followerId && row.followingId === followingId) return row;
  }
  return undefined;
}

export function likedByMe(store: Store, userId: number | undefined, targetType: LikeTargetType, targetId: number): boolean {
  return !!userId && !!findLike(store, userId, targetType, targetId);
}

export function collectedByMe(store: Store, userId: number | undefined, targetType: CollectTargetType, targetId: number): boolean {
  return !!userId && !!findCollect(store, userId, targetType, targetId);
}

export function followedByMe(store: Store, userId: number | undefined, followingId: number | undefined): boolean {
  if (!userId || !followingId) return false;
  return !!findFollow(store, userId, followingId);
}

/** 评论的点赞用户数（likes 表口径，可与 comments.likeCount 对账） */
export function likeRowCount(store: Store, targetType: LikeTargetType, targetId: number): number {
  let n = 0;
  for (const row of store.likes.values()) if (row.targetType === targetType && row.targetId === targetId) n++;
  return n;
}

/** 内容的收藏记录数（collects 表口径，可与 articles.collectCount 对账） */
export function collectRowCount(store: Store, targetType: CollectTargetType, targetId: number): number {
  let n = 0;
  for (const row of store.collects.values()) if (row.targetType === targetType && row.targetId === targetId) n++;
  return n;
}

/** 转发记录数（shares 表口径；Product 模型没有 shareCount 字段，用这个下发） */
export function shareRowCount(store: Store, targetType: 'article' | 'product', targetId: number): number {
  let n = 0;
  for (const row of store.shares.values()) if (row.targetType === targetType && row.targetId === targetId) n++;
  return n;
}

/** 粉丝数 / 关注数 */
export function followerCountOf(store: Store, userId: number): number {
  let n = 0;
  for (const row of store.follows.values()) if (row.followingId === userId) n++;
  return n;
}

export function followingCountOf(store: Store, userId: number): number {
  let n = 0;
  for (const row of store.follows.values()) if (row.followerId === userId) n++;
  return n;
}
