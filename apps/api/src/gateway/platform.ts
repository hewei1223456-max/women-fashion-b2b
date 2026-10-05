import type { ArticleSummary, Notification, Product, StyleTag, User, UserBrief } from '@wfb/shared-types';
import { calcCesScore, freshnessBoost, styleMatch } from '@wfb/shared-utils';
import type { ArticleRow, BehaviorRow, Store } from '../core/db';
import { nextId } from '../core/db';
import { toUserBrief } from '../core/security';
import { pushNotification as pushNotificationRaw } from '../modules/notification/service';

/* =========================================================================
 * 平台公共能力（跨模块复用）
 *
 * 通知 / 行为埋点 / 内容摘要 / 「功能→资讯」推荐联动 / 日期工具。
 * 放在 gateway 下是因为它被功能板块、加微、拼团、订货会、管理后台共同使用，
 * 属于基础设施而非某个业务模块的私有逻辑。
 * ========================================================================= */

/** 本地时区 yyyy-MM-dd */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dayKeyOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dateKey(d);
}

export function isToday(iso?: string): boolean {
  return !!iso && dayKeyOf(iso) === dateKey();
}

/** 最近 n 天的日期键（升序，含今天） */
export function lastNDates(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(dateKey(d));
  }
  return out;
}

export function startOfDay(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** 今日 24:00（主动私信配额重置时间） */
export function nextResetAt(): string {
  const d = startOfDay();
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

/* ------------------------------ 通知 ------------------------------ */

export interface NotifyInput {
  userId: number;
  type: Notification['type'];
  title: string;
  body: string;
  actor?: User | UserBrief | null;
  targetType?: Notification['targetType'];
  targetId?: number;
}

/**
 * 写通知 —— **统一复用 notification 域的 implements（api-ugc）**，
 * 保证「通知行的形状」全站只有一份实现（actor 只存 { id }，出参再补 UserBrief）。
 * 这里只做一个签名适配层（actor: User → actorId），方便功能板块/加微/拼团调用。
 */
export function pushNotification(store: Store, input: NotifyInput): Notification {
  const row = pushNotificationRaw(store, {
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    actorId: input.actor?.id,
    targetType: input.targetType,
    targetId: input.targetId,
    // 系统/审核类通知允许自己触发自己（例如管理后台复审后通知作者本人）
    allowSelf: !input.actor,
  });
  if (row) return row;
  // 被规则跳过时返回一个只读的回显对象，调用方无需判空
  return {
    id: 0,
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    isRead: false,
    createdAt: new Date().toISOString(),
  } as Notification;
}

/* ------------------------------ 行为埋点 ------------------------------ */

export interface TrackInput {
  userId: number;
  action: BehaviorRow['action'];
  targetType: string;
  targetId: number;
  keyword?: string;
  styleTag?: string;
}

export function trackBehavior(store: Store, input: TrackInput): BehaviorRow {
  const id = nextId(store, 'behaviors');
  const row: BehaviorRow = {
    id,
    userId: input.userId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    keyword: input.keyword,
    styleTag: input.styleTag,
    createdAt: new Date().toISOString(),
  };
  store.behaviors.set(id, row);
  return row;
}

/* ------------------------------ 内容 → 摘要 ------------------------------ */

export function toArticleSummary(
  store: Store,
  a: ArticleRow | undefined,
  opts: { reason?: string; viewerId?: number } = {},
): ArticleSummary {
  if (!a) {
    return {
      id: 0,
      title: '',
      summary: '',
      coverUrl: '',
      contentType: 'image_text',
      type: 'news',
      styleTags: [],
      topics: [],
      images: [],
      viewCount: 0,
      likeCount: 0,
      collectCount: 0,
      commentCount: 0,
      cesScore: 0,
      visibility: 'public',
      auditStatus: 'approved',
      createdAt: new Date().toISOString(),
      author: toUserBrief(store.users.get(0)),
    };
  }
  const author = store.users.get(a.authorId);
  return {
    id: a.id,
    title: a.title,
    summary: a.summary,
    coverUrl: a.coverUrl,
    contentType: a.contentType,
    type: a.type,
    styleTags: a.styleTags,
    topics: a.topics,
    images: a.images,
    videoUrl: a.videoUrl,
    viewCount: a.viewCount,
    likeCount: a.likeCount,
    collectCount: a.collectCount,
    commentCount: a.commentCount,
    cesScore: a.cesScore ?? calcCesScore(a),
    visibility: a.visibility,
    auditStatus: a.auditStatus,
    createdAt: a.createdAt,
    author: toUserBrief(author),
    reason: opts.reason,
  };
}

/* ------------------------------ 功能 → 资讯 联动 ------------------------------ */

/**
 * 为功能板块结果挑选「推荐阅读」：优先风格匹配 → CES 热度 → 新鲜度。
 * 保证每个工具结果都带 2-3 篇来自 store.articles 的真实内容。
 */
export function recommendArticles(store: Store, styleTags: StyleTag[] | string[] = [], limit = 3): ArticleSummary[] {
  const rows = [...store.articles.values()].filter(
    (a) => !a.deleted && a.auditStatus === 'approved' && a.board === 'info',
  );
  const tags = (styleTags ?? []) as StyleTag[];
  const scored = rows
    .map((a) => {
      const match = styleMatch(tags, a.styleTags);
      const ces = a.cesScore ?? calcCesScore(a);
      const fresh = freshnessBoost(a.createdAt);
      return { a, match, score: match * 1000 + ces * 0.6 + fresh * 40 };
    })
    .sort((x, y) => y.score - x.score);

  // 风格完全没命中时，退化为「平台最热 + 最新」，仍然返回真实内容
  const picked = scored.slice(0, Math.max(1, limit));
  return picked.map(({ a, match }) =>
    toArticleSummary(store, a, {
      reason:
        match > 0
          ? `${a.styleTags.filter((t) => tags.includes(t)).join('/')}风格 · CES ${Math.round((a.cesScore ?? 0) * 10) / 10}`
          : `平台热榜 · 浏览 ${a.viewCount}`,
    }),
  );
}

/* ------------------------------ 款 → 对外形状 ------------------------------ */

export function toProduct(store: Store, p: Product | undefined, withManufacturer = true): Product | undefined {
  if (!p) return undefined;
  const out: Product = { ...p };
  if (withManufacturer) out.manufacturer = toUserBrief(store.users.get(p.manufacturerId));
  return out;
}

/* ------------------------------ 杂项 ------------------------------ */

export function round(n: number, digits = 2): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

/**
 * 稳定伪随机：同一 seed 永远同一结果（用于「规则引擎」在无真实外部数据时
 * 给出可复现的分析结论，而不是每次请求都抖动）。
 */
export function stableNumber(seed: string, min: number, max: number, salt = ''): number {
  let h = 2166136261;
  const s = `${seed}|${salt}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = ((h >>> 0) % 100000) / 100000;
  return Math.round(min + u * (max - min));
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** 分页裁剪（与 server.paginate 语义一致，模块内自用） */
export function pageSlice<T>(rows: T[], page: number, pageSize: number) {
  return {
    list: rows.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total: rows.length,
    hasMore: page * pageSize < rows.length,
  };
}
