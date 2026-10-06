import type { Meetup, StyleTag, User } from '@wfb/shared-types';
import { MEETUP_KIND_LABELS, STYLE_TAGS } from '@wfb/shared-types';
import type { MeetupRow, Store } from '../../core/db';
import { nextId, pageOf } from '../../core/db';
import { Errors } from '../../core/server';
import { toUserBrief } from '../../core/security';
import { pushNotification, recordBehavior } from '../notification/service';
import { img } from '../../core/images';

/* =========================================================================
 * 组局（参考「闪动」的活动形态）
 *
 * 与拼单的本质区别：
 *   拼单 = 凑量压价（虚拟的，只有一个目标人数）
 *   组局 = 线下一起行动（真实的，必须有时间/地点/集合点/报名方式/报名条件）
 *
 * 所以组局是「强线下要素」的一等公民，发布时同时往资讯流写一条内容，
 * 这样组局也能被首页推荐到（用户明确要求「用户在资讯里能看到组局」）。
 * ========================================================================= */

const now = () => new Date().toISOString();

/** 组局落库时的行类型（比对外模型多存几个内部字段）—— 见 core/db.ts 的 MeetupRow */
export type { MeetupRow };

export interface CreateMeetupInput {
  kind: string;
  title: string;
  description: string;
  city: string;
  venue: string;
  gatheringPoint: string;
  startAt: string;
  endAt: string;
  signupMethod: string;
  signupRequirement: string;
  capacity: number;
  fee?: string;
  productId?: number;
  market?: string;
  styleTags?: string[];
  targetAudience?: string;
  coverUrl?: string;
  publishToFeed?: boolean;
}

const VALID_KINDS = Object.keys(MEETUP_KIND_LABELS);

export function validateMeetupInput(dto: CreateMeetupInput) {
  const kind = String(dto?.kind ?? '').trim();
  if (!VALID_KINDS.includes(kind)) throw Errors.badRequest(`组局类型不合法，应为 ${VALID_KINDS.join(' / ')}`);

  const title = String(dto?.title ?? '').trim();
  if (title.length < 4 || title.length > 50) throw Errors.badRequest('组局标题需 4-50 字');

  const city = String(dto?.city ?? '').trim();
  if (!city) throw Errors.badRequest('请选择活动城市');

  const venue = String(dto?.venue ?? '').trim();
  if (!venue) throw Errors.badRequest('请填写活动地点（市场/园区/门店）');

  const gatheringPoint = String(dto?.gatheringPoint ?? '').trim();
  if (!gatheringPoint) throw Errors.badRequest('请填写集合点，例如「十三行 6 楼 B12 档口门口」');

  const startAt = String(dto?.startAt ?? '').trim();
  const endAt = String(dto?.endAt ?? '').trim();
  if (!startAt || Number.isNaN(new Date(startAt).getTime())) throw Errors.badRequest('请选择开始时间');
  if (!endAt || Number.isNaN(new Date(endAt).getTime())) throw Errors.badRequest('请选择结束时间');
  if (new Date(endAt).getTime() <= new Date(startAt).getTime()) throw Errors.badRequest('结束时间必须晚于开始时间');

  const signupMethod = String(dto?.signupMethod ?? '').trim();
  if (!signupMethod) throw Errors.badRequest('请填写报名方式（留微信号 / 扫码 / 站内报名）');

  const signupRequirement = String(dto?.signupRequirement ?? '').trim();
  if (!signupRequirement) throw Errors.badRequest('请填写报名条件，例如「认证店主，有实体店」');

  const capacity = Number(dto?.capacity ?? 0);
  if (!Number.isFinite(capacity) || capacity < 0) throw Errors.badRequest('人数上限不能为负（0 表示不限）');

  return {
    kind,
    title,
    description: String(dto?.description ?? '').slice(0, 2000),
    city,
    venue,
    gatheringPoint,
    startAt: new Date(startAt).toISOString(),
    endAt: new Date(endAt).toISOString(),
    signupMethod,
    signupRequirement,
    capacity: Math.round(capacity),
    fee: dto?.fee ? String(dto.fee).slice(0, 100) : undefined,
    productId: dto?.productId ? Number(dto.productId) : undefined,
    market: dto?.market ? String(dto.market) : undefined,
    styleTags: (Array.isArray(dto?.styleTags) ? dto.styleTags : []).filter((t) => STYLE_TAGS.includes(t as never)) as StyleTag[],
    targetAudience: dto?.targetAudience ? String(dto.targetAudience).slice(0, 100) : undefined,
    coverUrl: dto?.coverUrl ? String(dto.coverUrl) : undefined,
    publishToFeed: dto?.publishToFeed !== false,
  };
}

/** 组装对外的 Meeting 视图：补发起人、报名者、joined 状态 */
export function toMeetupView(store: Store, row: MeetupRow, viewerId?: number): Meetup {
  const signups = [...store.meetupSignups.values()].filter((s) => s.meetupId === row.id);
  const attendees = signups
    .slice(0, 8)
    .map((s) => toUserBrief(store.users.get(s.userId)))
    .filter(Boolean);
  const status: Meetup['status'] =
    row.status === 'recruiting' && row.capacity > 0 && signups.length >= row.capacity ? 'full' : row.status;

  return {
    id: row.id,
    initiatorId: row.initiatorId,
    kind: row.kind,
    title: row.title,
    description: row.description,
    coverUrl: row.coverUrl || '',
    city: row.city,
    venue: row.venue,
    gatheringPoint: row.gatheringPoint,
    startAt: row.startAt,
    endAt: row.endAt,
    signupMethod: row.signupMethod,
    signupRequirement: row.signupRequirement,
    capacity: row.capacity,
    joinedCount: signups.length,
    fee: row.fee,
    productId: row.productId,
    market: row.market,
    styleTags: row.styleTags ?? [],
    targetAudience: row.targetAudience,
    status,
    createdAt: row.createdAt,
    initiator: toUserBrief(store.users.get(row.initiatorId)),
    joined: viewerId ? signups.some((s) => s.userId === viewerId) : false,
    attendees,
  };
}

export function listMeetups(
  store: Store,
  opts: { kind?: string; city?: string; status?: string; page: number; pageSize: number; viewerId?: number },
) {
  let rows = [...store.meetups.values()].filter((m) => !m.deleted);
  if (opts.kind) rows = rows.filter((m) => m.kind === opts.kind);
  if (opts.city) rows = rows.filter((m) => m.city === opts.city);
  if (opts.status) rows = rows.filter((m) => m.status === opts.status);
  // 即将开始的活动排前面；已结束的排最后
  const t = Date.now();
  rows.sort((a, b) => {
    const aEnded = new Date(a.endAt).getTime() < t ? 1 : 0;
    const bEnded = new Date(b.endAt).getTime() < t ? 1 : 0;
    if (aEnded !== bEnded) return aEnded - bEnded;
    return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
  });
  const views = rows.map((r) => toMeetupView(store, r, opts.viewerId));
  return pageOf(views, opts.page, opts.pageSize);
}

export function getMeetup(store: Store, id: number, viewerId?: number) {
  const row = store.meetups.get(id);
  if (!row || row.deleted) throw Errors.notFound('组局不存在或已取消');
  return toMeetupView(store, row, viewerId);
}

/** 发起组局：落组局 + 可选地同步发一条资讯流内容 */
export function createMeetup(store: Store, user: User, input: ReturnType<typeof validateMeetupInput>): Meetup {
  const id = nextId(store, 'meetups');
  const createdAt = now();

  const row: MeetupRow = {
    id,
    initiatorId: user.id,
    kind: input.kind as never,
    title: input.title,
    description: input.description,
    coverUrl: input.coverUrl || img(`meetup-${id}`, 800, 500, input.title),
    city: input.city,
    venue: input.venue,
    gatheringPoint: input.gatheringPoint,
    startAt: input.startAt,
    endAt: input.endAt,
    signupMethod: input.signupMethod,
    signupRequirement: input.signupRequirement,
    capacity: input.capacity,
    joinedCount: 0,
    fee: input.fee,
    productId: input.productId,
    market: input.market,
    styleTags: input.styleTags,
    targetAudience: input.targetAudience,
    status: 'recruiting',
    createdAt,
    initiator: undefined as never,
  };
  store.meetups.set(id, row);

  // 发起人自动报名（他是组织者）
  const sid = nextId(store, 'meetupSignups');
  store.meetupSignups.set(sid, { id: sid, meetupId: id, userId: user.id, note: '发起人', createdAt });

  // 同步发一条资讯流内容，让组局能被首页推荐到
  if (input.publishToFeed) {
    const aid = nextId(store, 'articles');
    const kindLabel = MEETUP_KIND_LABELS[input.kind as never] ?? '组局';
    store.articles.set(aid, {
      id: aid,
      authorId: user.id,
      board: 'info',
      type: 'ugc',
      contentType: 'meetup',
      title: `${kindLabel}｜${input.title}`,
      summary: `${input.city} ${input.venue} · ${formatMeetupTime(input.startAt)} 集合`,
      content: `${input.description}\n\n**集合点**：${input.gatheringPoint}\n**时间**：${formatMeetupTime(input.startAt)} - ${formatMeetupTime(input.endAt)}\n**报名方式**：${input.signupMethod}\n**报名条件**：${input.signupRequirement}`,
      coverUrl: row.coverUrl,
      images: [row.coverUrl],
      attachments: [],
      relatedProducts: [],
      visibility: 'public',
      auditStatus: 'approved',
      styleTags: (input.styleTags ?? ['韩系']) as never,
      topics: ['组局', input.city, kindLabel],
      viewCount: 0,
      likeCount: 0,
      collectCount: 0,
      commentCount: 0,
      shareCount: 0,
      contactCount: 0,
      cesScore: 0,
      topped: false,
      deleted: false,
      createdAt,
      meetup: undefined,
    });
    row.articleId = aid;
  }

  recordBehavior(store, { userId: user.id, action: 'publish', targetType: 'meetup', targetId: id, styleTag: input.styleTags?.[0] });
  return toMeetupView(store, row, user.id);
}

export function joinMeetup(store: Store, user: User, meetupId: number): Meetup {
  const row = store.meetups.get(meetupId);
  if (!row || row.deleted) throw Errors.notFound('组局不存在或已取消');
  if (row.status === 'cancelled') throw Errors.badRequest('该组局已取消');
  if (new Date(row.endAt).getTime() < Date.now()) throw Errors.badRequest('该组局已结束，无法报名');

  const existing = [...store.meetupSignups.values()].find((s) => s.meetupId === meetupId && s.userId === user.id);
  if (existing) return toMeetupView(store, row, user.id); // 幂等

  const count = [...store.meetupSignups.values()].filter((s) => s.meetupId === meetupId).length;
  if (row.capacity > 0 && count >= row.capacity) throw Errors.badRequest('该组局人数已满');

  const id = nextId(store, 'meetupSignups');
  store.meetupSignups.set(id, { id, meetupId, userId: user.id, createdAt: now() });

  // 通知发起人（TargetType 目前只覆盖 article/product/comment，组局先按未类型化处理）
  pushNotification(store, {
    userId: row.initiatorId,
    type: 'system',
    title: '有人报名了你的组局',
    body: `${user.nickname} 报名了「${row.title}」`,
    actorId: user.id,
    targetType: 'meetup' as never,
    targetId: meetupId,
  });
  recordBehavior(store, { userId: user.id, action: 'like', targetType: 'meetup', targetId: meetupId });

  const after = store.meetups.get(meetupId)!;
  if (after.capacity > 0 && count + 1 >= after.capacity) after.status = 'full';
  return toMeetupView(store, after, user.id);
}

export function quitMeetup(store: Store, user: User, meetupId: number): Meetup {
  const row = store.meetups.get(meetupId);
  if (!row || row.deleted) throw Errors.notFound('组局不存在或已取消');
  if (row.initiatorId === user.id) throw Errors.badRequest('发起人不能退出自己的组局，请改为取消组局');

  const existing = [...store.meetupSignups.values()].find((s) => s.meetupId === meetupId && s.userId === user.id);
  if (existing) store.meetupSignups.delete(existing.id);
  if (row.status === 'full') row.status = 'recruiting';
  return toMeetupView(store, row, user.id);
}

export function myMeetups(store: Store, userId: number, page: number, pageSize: number) {
  const mine = [...store.meetups.values()].filter((m) => !m.deleted && m.initiatorId === userId);
  const joinedIds = new Set([...store.meetupSignups.values()].filter((s) => s.userId === userId).map((s) => s.meetupId));
  const joined = [...store.meetups.values()].filter((m) => !m.deleted && joinedIds.has(m.id) && m.initiatorId !== userId);
  const rows = [...mine, ...joined].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  return pageOf(
    rows.map((r) => ({ ...toMeetupView(store, r, userId), isInitiator: r.initiatorId === userId })),
    page,
    pageSize,
  );
}

function formatMeetupTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}
