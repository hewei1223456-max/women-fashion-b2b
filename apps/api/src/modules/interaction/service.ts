import type { Comment, CommentDto, CollectDto, InteractionState, LikeDto, ShareDto, User, UserBrief } from '@wfb/shared-types';
import { calcCesScore, precheckText } from '@wfb/shared-utils';
import type { AuditLogRow, Store } from '../../core/db';
import { all, byTimeDesc, nextId, pageOf } from '../../core/db';
import { Errors } from '../../core/server';
import { toUserBrief } from '../../core/security';
import { nowIso, pushNotification, recordBehavior, recordFollowBehavior } from '../notification/service';
import {
  collectedByMe,
  findCollect,
  findFollow,
  findLike,
  followerCountOf,
  followingCountOf,
  likedByMe,
  shareRowCount,
} from './query';

/* =========================================================================
 * 互动组件：点赞 / 评论 / 收藏 / 转发 / 关注
 *
 * 计数一致性红线（双写）：
 *   likes    表落库  → articles|products|comments 的 likeCount
 *   comments 表落库  → articles|products 的 commentCount + 父评论 replyCount
 *   collects 表落库  → articles|products 的 collectCount
 *   shares   表落库  → articles 的 shareCount（Product 模型无该字段，对外用 shares 表统计）
 * ========================================================================= */

export type TargetKind = 'article' | 'product' | 'comment';

/** store.comments 的行类型就是共享契约的 Comment */
type CommentRow = Comment;

export interface TargetRef {
  targetType: TargetKind;
  targetId: number;
  ownerId: number;
  title: string;
  styleTag?: string;
}

const MAX_IMAGES = 9;
const MAX_COMMENT_LEN = 500;
const SHARE_CHANNELS: ShareDto['channel'][] = ['wechat', 'moments', 'group', 'link'];

/* ------------------------------ 目标解析 ------------------------------ */

/** 解析互动目标并校验存在性（写操作入口，非法直接抛 404/400） */
export function resolveTarget(store: Store, targetType: string, targetId: number): TargetRef {
  const id = Number(targetId);
  if (!id) throw Errors.badRequest('缺少参数 targetId');
  if (targetType === 'article') {
    const row = store.articles.get(id);
    if (!row || row.deleted) throw Errors.notFound('内容不存在或已删除');
    return { targetType: 'article', targetId: id, ownerId: row.authorId, title: row.title, styleTag: row.styleTags?.[0] };
  }
  if (targetType === 'product') {
    const row = store.products.get(id);
    if (!row) throw Errors.notFound('款不存在或已下架');
    return { targetType: 'product', targetId: id, ownerId: row.manufacturerId, title: row.title, styleTag: row.styleTag };
  }
  if (targetType === 'comment') {
    const row = store.comments.get(id);
    if (!row || row.status === 'deleted') throw Errors.notFound('评论不存在或已删除');
    return { targetType: 'comment', targetId: id, ownerId: row.userId, title: row.content.slice(0, 20) };
  }
  throw Errors.badRequest('targetType 必须是 article / product / comment');
}

/** 计数双写：互动表落库后同步更新内容 / 评论上的计数字段，并重算 CES */
function bumpCount(store: Store, targetType: TargetKind, targetId: number, field: 'likeCount' | 'collectCount' | 'commentCount' | 'shareCount', delta: number) {
  if (targetType === 'article') {
    const row = store.articles.get(targetId);
    if (!row) return;
    row[field] = Math.max(0, (row[field] ?? 0) + delta);
    row.cesScore = calcCesScore(row);
    return;
  }
  if (targetType === 'product') {
    const row = store.products.get(targetId);
    if (!row) return;
    // Product 模型没有 shareCount 字段：分享数由 shares 表统计
    if (field === 'shareCount') return;
    row[field] = Math.max(0, (row[field] ?? 0) + delta);
    return;
  }
  if (targetType === 'comment' && field === 'likeCount') {
    const row = store.comments.get(targetId);
    if (row) row.likeCount = Math.max(0, (row.likeCount ?? 0) + delta);
  }
}

function countOf(store: Store, targetType: TargetKind, targetId: number, field: 'likeCount' | 'collectCount'): number {
  if (targetType === 'article') return store.articles.get(targetId)?.[field] ?? 0;
  if (targetType === 'product') return store.products.get(targetId)?.[field] ?? 0;
  return field === 'likeCount' ? store.comments.get(targetId)?.likeCount ?? 0 : 0;
}

/** 幂等状态回包：liked / collected / followed + 最新计数 */
export function interactionState(store: Store, userId: number, ref: TargetRef): InteractionState {
  const liked = likedByMe(store, userId, ref.targetType, ref.targetId);
  const collected = ref.targetType === 'comment' ? false : collectedByMe(store, userId, ref.targetType as 'article' | 'product', ref.targetId);
  return {
    liked,
    collected,
    followed: !!findFollow(store, userId, ref.ownerId),
    likeCount: countOf(store, ref.targetType, ref.targetId, 'likeCount'),
    collectCount: ref.targetType === 'comment' ? 0 : countOf(store, ref.targetType, ref.targetId, 'collectCount'),
  };
}

/* ------------------------------ 点赞 ------------------------------ */

export function likeTarget(store: Store, user: User, dto: LikeDto): InteractionState {
  const ref = resolveTarget(store, String(dto.targetType ?? ''), Number(dto.targetId));
  const existing = findLike(store, user.id, ref.targetType, ref.targetId);
  if (!existing) {
    const id = nextId(store, 'likes');
    store.likes.set(id, { id, userId: user.id, targetType: ref.targetType, targetId: ref.targetId, createdAt: nowIso() });
    bumpCount(store, ref.targetType, ref.targetId, 'likeCount', 1);
    pushNotification(store, {
      userId: ref.ownerId,
      type: 'like',
      actorId: user.id,
      targetType: ref.targetType,
      targetId: ref.targetId,
      title: ref.targetType === 'comment' ? '有人赞了你的评论' : ref.targetType === 'product' ? '有人赞了你的款' : '有人赞了你的内容',
      body:
        ref.targetType === 'comment'
          ? `${user.nickname} 赞了你的评论：${ref.title}`
          : `${user.nickname} 赞了《${ref.title}》`,
    });
    recordBehavior(store, { userId: user.id, action: 'like', targetType: ref.targetType, targetId: ref.targetId, styleTag: ref.styleTag });
  }
  return interactionState(store, user.id, ref);
}

export function unlikeTarget(store: Store, user: User, dto: LikeDto): InteractionState {
  const ref = resolveTarget(store, String(dto.targetType ?? ''), Number(dto.targetId));
  const existing = findLike(store, user.id, ref.targetType, ref.targetId);
  if (existing) {
    store.likes.delete(existing.id);
    bumpCount(store, ref.targetType, ref.targetId, 'likeCount', -1);
    // 取消点赞不回退通知（用户侧只保留「曾经赞过」的一次通知），但仍记录埋点，保证每个写操作都有行为
    recordBehavior(store, { userId: user.id, action: 'like', targetType: `${ref.targetType}:unlike`, targetId: ref.targetId, styleTag: ref.styleTag });
  }
  return interactionState(store, user.id, ref);
}

/* ------------------------------ 评论 ------------------------------ */

/** 沿 parentId 上溯到根内容（兼容种子数据里「回复的 targetType=comment」的存法） */
function rootTargetOf(store: Store, row: CommentRow): TargetRef {
  let cur = row;
  for (let depth = 0; depth < 20; depth++) {
    if (!cur.parentId || cur.targetType !== 'comment') break;
    const parent = store.comments.get(cur.parentId);
    if (!parent) break;
    cur = parent;
  }
  return resolveTarget(store, cur.targetType, cur.targetId);
}

function toDtoComment(store: Store, row: CommentRow, viewerId: number, replies: CommentRow[] = []): Comment {
  return {
    ...row,
    user: toUserBrief(store.users.get(row.userId)),
    liked: likedByMe(store, viewerId, 'comment', row.id),
    replies: replies.map((r) => ({
      ...r,
      user: toUserBrief(store.users.get(r.userId)),
      liked: likedByMe(store, viewerId, 'comment', r.id),
      replies: [],
    })),
  };
}

function writeCommentAudit(store: Store, commentId: number, text: string, pass: boolean, hitWords: string[]) {
  const id = nextId(store, 'auditLogs');
  const row: AuditLogRow = {
    id,
    contentType: 'text',
    contentId: commentId,
    auditSource: process.env.CONTENT_SECURITY_PROVIDER ?? 'mock',
    auditResult: pass ? 'pass' : 'risky',
    auditDetail: { hitWords, scene: 'comment' },
    reviewStatus: pass ? 'auto_pass' : 'manual_pending',
    bizType: 'comment',
    bizId: commentId,
    text: text.slice(0, 300),
    createdAt: nowIso(),
  };
  store.auditLogs.set(id, row);
}

export function createComment(store: Store, user: User, dto: CommentDto): Comment {
  const targetTypeRaw = String(dto.targetType ?? '');
  const targetId = Number(dto.targetId);
  const content = String(dto.content ?? '').trim();
  if (!content) throw Errors.badRequest('评论内容不能为空');
  if (content.length > MAX_COMMENT_LEN) throw Errors.badRequest(`评论内容不能超过 ${MAX_COMMENT_LEN} 字`);
  const images = Array.isArray(dto.images) ? dto.images.map((s) => String(s)).filter(Boolean) : [];
  if (images.length > MAX_IMAGES) throw Errors.badRequest(`最多上传 ${MAX_IMAGES} 张图片`);

  let parent: CommentRow | undefined;
  if (dto.parentId) {
    parent = store.comments.get(Number(dto.parentId));
    if (!parent || parent.status === 'deleted') throw Errors.notFound('要回复的评论不存在或已删除');
  }
  const root = parent ? rootTargetOf(store, parent) : resolveTarget(store, targetTypeRaw, targetId);
  if (parent && (targetTypeRaw === 'article' || targetTypeRaw === 'product') && (root.targetType !== targetTypeRaw || root.targetId !== targetId)) {
    throw Errors.badRequest('要回复的评论不属于该内容');
  }

  const check = precheckText(content);
  const id = nextId(store, 'comments');
  const row: Comment = {
    id,
    userId: user.id,
    // 回复统一挂在根内容下（article/product），parentId 指向被回复的评论，列表按 parentId 内联二级回复
    targetType: root.targetType,
    targetId: root.targetId,
    parentId: parent?.id,
    content,
    images,
    likeCount: 0,
    replyCount: 0,
    status: check.pass ? 'approved' : 'pending',
    createdAt: nowIso(),
    user: toUserBrief(user),
  };
  store.comments.set(id, row);
  writeCommentAudit(store, id, content, check.pass, check.hitWords);

  if (check.pass) {
    bumpCount(store, root.targetType, root.targetId, 'commentCount', 1);
    if (parent) parent.replyCount = Math.max(0, (parent.replyCount ?? 0) + 1);

    // 通知：回复→父评论作者；评论→作者；@→被提及者（同一次操作内去重，且不给自己发）
    const notified = new Set<number>([user.id]);
    const notify = (userId: number, type: 'comment' | 'reply' | 'mention', title: string, body: string) => {
      if (!userId || notified.has(userId)) return;
      notified.add(userId);
      pushNotification(store, { userId, type, actorId: user.id, targetType: root.targetType, targetId: root.targetId, title, body });
    };
    if (parent) notify(parent.userId, 'reply', '有人回复了你', `${user.nickname} 回复了你：${content.slice(0, 40)}`);
    notify(root.ownerId, 'comment', '有人评论了你的内容', `${user.nickname} 评论了《${root.title}》：${content.slice(0, 40)}`);
    for (const uid of Array.isArray(dto.mentions) ? dto.mentions : []) {
      const mentionId = Number(uid);
      if (mentionId && store.users.has(mentionId)) {
        notify(mentionId, 'mention', '有人在评论中提到了你', `${user.nickname} 在评论中提到了你：${content.slice(0, 40)}`);
      }
    }
  }

  recordBehavior(store, { userId: user.id, action: 'comment', targetType: root.targetType, targetId: root.targetId, styleTag: root.styleTag });
  return toDtoComment(store, row, user.id);
}

/** 评论列表：一级评论分页，二级回复内联（sort=hot|time） */
export function listComments(
  store: Store,
  viewerId: number,
  typeRaw: string,
  idRaw: number,
  q: { sort?: string; page: number; pageSize: number },
) {
  const type: TargetKind = typeRaw === 'product' ? 'product' : typeRaw === 'article' ? 'article' : 'article';
  if (typeRaw !== 'article' && typeRaw !== 'product' && typeRaw !== 'comment') throw Errors.badRequest('type 必须是 article / product');
  const targetId = Number(idRaw);
  if (!targetId) throw Errors.badRequest('缺少参数 id');
  if (typeRaw === 'comment') {
    // 兼容「查看某条评论的回复」入口：把评论 id 当目标，取其下回复
    const parent = store.comments.get(targetId);
    if (!parent || parent.status === 'deleted') throw Errors.notFound('评论不存在或已删除');
    const replies = all(store.comments)
      .filter((c) => c.parentId === parent.id && c.status !== 'deleted' && c.status !== 'rejected')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const paged = pageOf(replies, q.page, q.pageSize);
    return { ...paged, list: paged.list.map((r) => toDtoComment(store, r, viewerId)) };
  }

  const visible = all(store.comments).filter((c) => c.status !== 'deleted' && c.status !== 'rejected');
  const tops = visible.filter((c) => c.targetType === type && c.targetId === targetId && !c.parentId);
  const topIds = new Set(tops.map((c) => c.id));
  const replies = visible.filter((c) => c.parentId && topIds.has(c.parentId));
  const sort = q.sort === 'hot' ? 'hot' : 'time';
  tops.sort((a, b) => {
    if (sort === 'hot') {
      const ha = a.likeCount + a.replyCount * 2;
      const hb = b.likeCount + b.replyCount * 2;
      if (ha !== hb) return hb - ha;
    }
    return byTimeDesc(a, b);
  });
  const paged = pageOf(tops, q.page, q.pageSize);
  return {
    ...paged,
    list: paged.list.map((c) =>
      toDtoComment(
        store,
        c,
        viewerId,
        replies.filter((r) => r.parentId === c.id).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
      ),
    ),
  };
}

/** 删除评论：作者 / 内容作者 / 管理员；连带删除二级回复并回收对应点赞与计数 */
export function deleteComment(store: Store, user: User, commentId: number): { ok: boolean; removed: number } {
  const row = store.comments.get(commentId);
  if (!row || row.status === 'deleted') throw Errors.notFound('评论不存在或已删除');
  const root = rootTargetOf(store, row);
  const isAuthor = row.userId === user.id;
  const isContentOwner = root.ownerId === user.id;
  if (!isAuthor && !isContentOwner && user.role !== 'admin') throw Errors.forbidden('没有权限删除该评论');

  const targets = [row, ...all(store.comments).filter((c) => c.parentId === row.id && c.status !== 'deleted')];
  for (const item of targets) {
    const wasCounted = item.status === 'approved';
    item.status = 'deleted';
    // 回收该评论上的点赞记录，避免点赞列表出现已删除评论
    for (const like of all(store.likes)) {
      if (like.targetType === 'comment' && like.targetId === item.id) store.likes.delete(like.id);
    }
    if (item.parentId) {
      const parent = store.comments.get(item.parentId);
      if (parent) parent.replyCount = Math.max(0, (parent.replyCount ?? 0) - 1);
    }
    // 计数与可见评论保持一致（只回退此前计入过的评论）
    if (wasCounted) {
      const itemRoot = rootTargetOf(store, item);
      bumpCount(store, itemRoot.targetType, itemRoot.targetId, 'commentCount', -1);
    }
  }
  recordBehavior(store, { userId: user.id, action: 'comment', targetType: `${root.targetType}:delete`, targetId: root.targetId, styleTag: root.styleTag });
  return { ok: true, removed: targets.length };
}

/* ------------------------------ 收藏 ------------------------------ */

export function collectTarget(store: Store, user: User, dto: CollectDto): InteractionState {
  const ref = resolveTarget(store, String(dto.targetType ?? ''), Number(dto.targetId));
  if (ref.targetType === 'comment') throw Errors.badRequest('评论不支持收藏');
  const targetType = ref.targetType as 'article' | 'product';
  const folderName = String(dto.folderName ?? '').trim() || '默认收藏夹';
  const existing = findCollect(store, user.id, targetType, ref.targetId);
  if (!existing) {
    const id = nextId(store, 'collects');
    store.collects.set(id, { id, userId: user.id, targetType, targetId: ref.targetId, folderName, createdAt: nowIso() });
    bumpCount(store, targetType, ref.targetId, 'collectCount', 1);
    recordBehavior(store, { userId: user.id, action: 'collect', targetType, targetId: ref.targetId, styleTag: ref.styleTag });
  } else if (dto.folderName && existing.folderName !== folderName) {
    existing.folderName = folderName;
  }
  return interactionState(store, user.id, ref);
}

export function uncollectTarget(store: Store, user: User, dto: CollectDto): InteractionState {
  const ref = resolveTarget(store, String(dto.targetType ?? ''), Number(dto.targetId));
  if (ref.targetType === 'comment') throw Errors.badRequest('评论不支持收藏');
  const targetType = ref.targetType as 'article' | 'product';
  const existing = findCollect(store, user.id, targetType, ref.targetId);
  if (existing) {
    store.collects.delete(existing.id);
    bumpCount(store, targetType, ref.targetId, 'collectCount', -1);
    recordBehavior(store, { userId: user.id, action: 'collect', targetType: `${targetType}:uncollect`, targetId: ref.targetId, styleTag: ref.styleTag });
  }
  return interactionState(store, user.id, ref);
}

/* ------------------------------ 转发 ------------------------------ */

export function shareTarget(store: Store, user: User, dto: ShareDto): { ok: boolean; shareCount: number } {
  const ref = resolveTarget(store, String(dto.targetType ?? ''), Number(dto.targetId));
  if (ref.targetType === 'comment') throw Errors.badRequest('评论不支持转发');
  const channel = String(dto.channel ?? '') as ShareDto['channel'];
  if (!SHARE_CHANNELS.includes(channel)) throw Errors.badRequest(`channel 必须是 ${SHARE_CHANNELS.join(' / ')}`);
  const targetType = ref.targetType as 'article' | 'product';
  const id = nextId(store, 'shares');
  store.shares.set(id, { id, userId: user.id, targetType, targetId: ref.targetId, channel, createdAt: nowIso() });
  bumpCount(store, targetType, ref.targetId, 'shareCount', 1);
  recordBehavior(store, { userId: user.id, action: 'share', targetType, targetId: ref.targetId, styleTag: ref.styleTag });
  const shareCount =
    targetType === 'article' ? store.articles.get(ref.targetId)?.shareCount ?? 0 : shareRowCount(store, targetType, ref.targetId);
  return { ok: true, shareCount };
}

/* ------------------------------ 关注 ------------------------------ */

export type FollowState = InteractionState & { followerCount: number; followingCount: number };

function followState(store: Store, userId: number, targetUserId: number): FollowState {
  return {
    liked: false,
    collected: false,
    followed: !!findFollow(store, userId, targetUserId),
    likeCount: 0,
    collectCount: 0,
    followerCount: followerCountOf(store, targetUserId),
    followingCount: followingCountOf(store, targetUserId),
  };
}

export function followUser(store: Store, user: User, targetUserId: number): FollowState {
  const target = store.users.get(Number(targetUserId));
  if (!target) throw Errors.notFound('用户不存在');
  if (target.id === user.id) throw Errors.badRequest('不能关注自己');
  if (!findFollow(store, user.id, target.id)) {
    const id = nextId(store, 'follows');
    store.follows.set(id, { id, followerId: user.id, followingId: target.id, createdAt: nowIso() });
    pushNotification(store, {
      userId: target.id,
      type: 'follow',
      actorId: user.id,
      title: '有人关注了你',
      body: `${user.nickname} 关注了你`,
    });
    recordFollowBehavior(store, user.id, target.id, target.styleTags?.[0]);
  }
  return followState(store, user.id, target.id);
}

export function unfollowUser(store: Store, user: User, targetUserId: number): FollowState {
  const target = store.users.get(Number(targetUserId));
  if (!target) throw Errors.notFound('用户不存在');
  if (target.id === user.id) throw Errors.badRequest('不能取消关注自己');
  const existing = findFollow(store, user.id, target.id);
  if (existing) {
    store.follows.delete(existing.id);
    recordFollowBehavior(store, user.id, target.id, target.styleTags?.[0]);
  }
  return followState(store, user.id, target.id);
}

/* ------------------------------ 点赞列表 ------------------------------ */

export function listLikes(
  store: Store,
  viewerId: number,
  typeRaw: string,
  idRaw: number,
  q: { page: number; pageSize: number },
) {
  const ref = resolveTarget(store, typeRaw, Number(idRaw));
  const rows = all(store.likes)
    .filter((l) => l.targetType === ref.targetType && l.targetId === ref.targetId)
    .sort(byTimeDesc);
  const paged = pageOf(rows, q.page, q.pageSize);
  return {
    ...paged,
    list: paged.list.map((l): UserBrief => {
      const u = store.users.get(l.userId);
      return toUserBrief(u, { likedAt: l.createdAt, followed: !!findFollow(store, viewerId, l.userId) }) as UserBrief;
    }),
  };
}
