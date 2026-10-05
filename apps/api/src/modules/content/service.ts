import type {
  ArticleSummary,
  AuditStatus,
  ContentAnalytics,
  ContentType,
  Draft,
  PublishContentDto,
  PublishResult,
  StyleTag,
  User,
  Visibility,
} from '@wfb/shared-types';
import { CONTENT_TYPES, STYLE_TAGS, VISIBILITIES } from '@wfb/shared-types';
import { calcCesScore, lastDays, midpointOfRange, parseTopics, precheckText, seededRandom } from '@wfb/shared-utils';
import type { ArticleRow, AuditLogRow, DraftRow, ProductRow, Store } from '../../core/db';
import { all, byTimeDesc, nextId, pageOf } from '../../core/db';
import { Errors } from '../../core/server';
import { toUserBrief } from '../../core/security';
import { nowIso, pushNotification, recordBehavior } from '../notification/service';
import { collectedByMe, followedByMe, likedByMe } from '../interaction/query';

/* =========================================================================
 * 内容发布与管理（资讯 / 货源两板块通用，统一落 store.articles 用 board 区分）
 *
 *   POST   /api/content/publish        同步文本审核 + 异步媒体任务号
 *   PUT    /api/content/:id            发布后 7 天内可编辑
 *   DELETE /api/content/:id            软删除，30 天可恢复
 *   POST   /api/content/:id/restore    恢复
 *   GET    /api/content/my             我的内容（board / sort）
 *   PUT    /api/content/:id/top        置顶（最多 3 条）
 *   GET    /api/content/:id/analytics  数据看板
 *   POST   /api/content/draft          GET /api/content/draft    DELETE /api/content/draft/:id
 * ========================================================================= */

const WEEK_MS = 7 * 86_400_000;
const RESTORE_DAYS = 30;
export const MAX_TOP = 3;

export type ArticleSummaryRow = ArticleSummary & {
  board?: 'info' | 'source';
  topped?: boolean;
  deleted?: boolean;
  shareCount?: number;
  updatedAt?: string;
  productId?: number;
};

export type PublishOutcome = PublishResult & { productId?: number; scheduledAt?: string; articleId: number };

/* ------------------------------ 参数校验 ------------------------------ */

function normalizeContentType(raw: unknown): ContentType {
  const value = String(raw ?? '').trim();
  if (!value) return 'image_text';
  if (!(CONTENT_TYPES as readonly string[]).includes(value)) throw Errors.badRequest(`contentType 不合法，可选：${CONTENT_TYPES.join(' / ')}`);
  return value as ContentType;
}

function normalizeStyleTags(raw: unknown, user: User): StyleTag[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' && raw ? raw.split(',') : [];
  const valid = new Set<string>(STYLE_TAGS as readonly string[]);
  const cleaned = list.map((s) => String(s).trim()).filter(Boolean);
  if (!cleaned.length) return (user.styleTags ?? []).slice(0, 3);
  const tags = cleaned.filter((s) => valid.has(s)) as StyleTag[];
  if (!tags.length) throw Errors.badRequest(`styleTags 不合法，可选：${STYLE_TAGS.join(' / ')}`);
  return Array.from(new Set(tags));
}

function normalizeVisibility(raw: unknown): Visibility {
  const value = String(raw ?? '').trim();
  if (!value) return 'public';
  if (!(VISIBILITIES as readonly string[]).includes(value)) throw Errors.badRequest(`visibility 不合法，可选：${VISIBILITIES.join(' / ')}`);
  return value as Visibility;
}

function normalizeUrls(raw: unknown, max = 20): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' && raw ? raw.split(',') : [];
  return list.map((s) => String(s).trim()).filter(Boolean).slice(0, max);
}

function normalizeAttachments(raw: unknown): { name: string; url: string; size?: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => {
      const item = (a ?? {}) as Record<string, unknown>;
      return { name: String(item.name ?? '附件'), url: String(item.url ?? ''), size: item.size ? String(item.size) : undefined };
    })
    .filter((a) => !!a.url);
}

function summarize(content: string, fallback: string): string {
  const plain = String(content ?? '')
    .replace(/[#*>`~\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (plain || fallback).slice(0, 60);
}

/* ------------------------------ 审核 ------------------------------ */

interface TextAuditOutcome {
  pass: boolean;
  hitWords: string[];
  mediaTaskIds: string[];
  auditStatus: AuditStatus;
  manualReview: boolean;
  message: string;
}

/** 同步文本审核 + 异步媒体任务号（媒体 5-30 分钟回调，Demo 用任务号占位） */
function auditContent(articleId: number, text: string, media: string[]): TextAuditOutcome {
  const check = precheckText(text);
  const mediaTaskIds = media.map((_, i) => `media_task_${articleId}_${i + 1}_${Date.now().toString(36)}`);
  if (!check.pass) {
    return {
      pass: false,
      hitWords: check.hitWords,
      mediaTaskIds,
      auditStatus: 'rejected',
      manualReview: true,
      message: `文案命中敏感词（${check.hitWords.join('、')}），已转入人工复审`,
    };
  }
  if (mediaTaskIds.length) {
    return {
      pass: true,
      hitWords: [],
      mediaTaskIds,
      auditStatus: 'pending',
      manualReview: false,
      message: `文本审核通过，${mediaTaskIds.length} 个媒体资源已提交异步审核（5-30 分钟出结果）`,
    };
  }
  return { pass: true, hitWords: [], mediaTaskIds, auditStatus: 'approved', manualReview: false, message: '发布成功，内容已通过审核' };
}

function writeContentAudit(store: Store, articleId: number, bizType: string, text: string, outcome: TextAuditOutcome, extra: Record<string, unknown> = {}) {
  const id = nextId(store, 'auditLogs');
  const row: AuditLogRow = {
    id,
    contentType: 'text',
    contentId: articleId,
    auditSource: process.env.CONTENT_SECURITY_PROVIDER ?? 'mock',
    auditResult: outcome.pass ? (outcome.auditStatus === 'pending' ? 'pending' : 'pass') : 'risky',
    auditDetail: { hitWords: outcome.hitWords, mediaTaskIds: outcome.mediaTaskIds, scene: bizType, ...extra },
    reviewStatus: outcome.pass ? 'auto_pass' : 'manual_pending',
    bizType,
    bizId: articleId,
    text: text.slice(0, 500),
    createdAt: nowIso(),
  };
  store.auditLogs.set(id, row);
  return row;
}

/* ------------------------------ 发布 ------------------------------ */

export function publishContent(store: Store, user: User, dto: PublishContentDto): PublishOutcome {
  const board = String(dto.board ?? '').trim() || 'info';
  if (board !== 'info' && board !== 'source') throw Errors.badRequest('board 必须是 info 或 source');
  const contentType = normalizeContentType(dto.contentType);
  const title = String(dto.title ?? '').trim();
  if (!title) throw Errors.badRequest('缺少参数 title');
  if (title.length > 80) throw Errors.badRequest('title 长度不能超过 80');
  const content = String(dto.content ?? '').trim();
  if (!content) throw Errors.badRequest('缺少参数 content');
  const images = normalizeUrls(dto.images);
  const styleTags = normalizeStyleTags(dto.styleTags, user);
  const topics = Array.from(
    new Set([...(Array.isArray(dto.topics) ? dto.topics : []).map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean), ...parseTopics(content)]),
  );
  const visibility = normalizeVisibility(dto.visibility);
  const coverUrl = String(dto.coverUrl ?? '').trim() || images[0] || `https://picsum.photos/seed/wfb-${Date.now()}/800/600`;

  // 1) 同步文本审核 + 2) 异步媒体任务号
  const id = nextId(store, 'articles');
  const media = [...images, ...(dto.videoUrl ? [String(dto.videoUrl)] : [])];
  const outcome = auditContent(id, [title, content, topics.join(' ')].join('\n'), media);

  const scheduledAt =
    dto.scheduledAt && new Date(dto.scheduledAt).getTime() > Date.now() ? new Date(dto.scheduledAt as string).toISOString() : undefined;
  if (scheduledAt) {
    outcome.auditStatus = 'pending';
    outcome.message = `已定时发布：${scheduledAt}`;
  }

  // 3) publishAs=product：同步落一条款，货源流 / 搜索 / 拼单可复用
  let productId = dto.productId ? Number(dto.productId) : undefined;
  if (productId && !store.products.has(productId)) throw Errors.notFound('关联的款不存在');
  if (dto.publishAs === 'product' && !productId) {
    const pid = nextId(store, 'products');
    const priceRange = String(dto.priceRange ?? '面议');
    const product: ProductRow = {
      id: pid,
      manufacturerId: user.id,
      title,
      images: images.length ? images : [coverUrl],
      videoUrl: dto.videoUrl,
      priceRange,
      priceMin: midpointOfRange(priceRange),
      moq: dto.moq ?? 1,
      styleTag: styleTags[0] ?? '休闲',
      shipFrom: String(dto.location ?? user.sourcingCities?.[0] ?? '杭州'),
      description: content.slice(0, 300),
      status: outcome.auditStatus,
      viewCount: 0,
      contactCount: 0,
      collectCount: 0,
      likeCount: 0,
      commentCount: 0,
      contactRate: 0,
      createdAt: nowIso(),
    };
    store.products.set(pid, product);
    productId = pid;
  }

  const article: ArticleRow = {
    id,
    authorId: user.id,
    type: 'ugc',
    contentType,
    title,
    content,
    summary: summarize(content, title),
    coverUrl,
    images,
    videoUrl: dto.videoUrl ? String(dto.videoUrl) : undefined,
    period: dto.period ? Number(dto.period) : undefined,
    attachments: normalizeAttachments(dto.attachments),
    relatedProducts: productId ? [productId] : [],
    visibility,
    auditStatus: outcome.auditStatus,
    styleTags,
    topics,
    location: dto.location ? String(dto.location) : undefined,
    productId,
    priceRange: dto.priceRange ? String(dto.priceRange) : undefined,
    moq: dto.moq ? Number(dto.moq) : undefined,
    viewCount: 0,
    likeCount: 0,
    collectCount: 0,
    commentCount: 0,
    shareCount: 0,
    contactCount: 0,
    cesScore: 0,
    topped: false,
    deleted: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    board: board as 'info' | 'source',
  };
  if (scheduledAt) (article as ArticleRow & { scheduledAt?: string }).scheduledAt = scheduledAt;
  store.articles.set(id, article);

  writeContentAudit(store, id, 'article', [title, content].join('\n'), outcome, { board, productId });
  pushNotification(store, {
    userId: user.id,
    type: 'audit',
    allowSelf: true,
    title: outcome.pass ? (outcome.auditStatus === 'pending' ? '内容已提交审核' : '内容审核通过') : '内容审核未通过',
    body: outcome.message,
    targetType: 'article',
    targetId: id,
  });
  recordBehavior(store, { userId: user.id, action: 'publish', targetType: 'article', targetId: id, styleTag: styleTags[0] });

  const result: PublishOutcome = {
    id,
    articleId: id,
    auditStatus: outcome.auditStatus,
    textAudit: {
      pass: outcome.pass,
      reason: outcome.pass ? undefined : `命中敏感词：${outcome.hitWords.join('、')}`,
      hitWords: outcome.hitWords,
    },
    mediaTaskIds: outcome.mediaTaskIds,
    manualReview: outcome.manualReview,
    message: outcome.message,
  };
  if (productId) result.productId = productId;
  if (scheduledAt) result.scheduledAt = scheduledAt;
  return result;
}

/* ------------------------------ 编辑 / 删除 / 恢复 ------------------------------ */

function loadOwnArticle(store: Store, user: User, id: number): ArticleRow {
  const row = store.articles.get(Number(id));
  if (!row || row.deleted) throw Errors.notFound('内容不存在或已删除');
  if (row.authorId !== user.id && user.role !== 'admin') throw Errors.forbidden('只能操作自己的内容');
  return row;
}

export function updateContent(store: Store, user: User, id: number, dto: PublishContentDto): PublishOutcome {
  const row = loadOwnArticle(store, user, id);
  const age = Date.now() - new Date(row.createdAt).getTime();
  if (age > WEEK_MS) throw Errors.forbidden('内容发布已超过 7 天，不支持编辑（演示规则）');

  // 先全量校验（含 normalize），全部通过后再落库，避免「报错但字段已被改一半」
  const nextTitle = dto.title !== undefined ? String(dto.title).trim() : undefined;
  if (nextTitle !== undefined && !nextTitle) throw Errors.badRequest('title 不能为空');
  if (nextTitle !== undefined && nextTitle.length > 80) throw Errors.badRequest('title 长度不能超过 80');
  const nextContent = dto.content !== undefined ? String(dto.content).trim() : undefined;
  if (nextContent !== undefined && !nextContent) throw Errors.badRequest('content 不能为空');
  const nextContentType = dto.contentType !== undefined ? normalizeContentType(dto.contentType) : undefined;
  const nextImages = dto.images !== undefined ? normalizeUrls(dto.images) : undefined;
  const nextStyleTags = dto.styleTags !== undefined ? normalizeStyleTags(dto.styleTags, user) : undefined;
  const nextVisibility = dto.visibility !== undefined ? normalizeVisibility(dto.visibility) : undefined;
  const nextTopics =
    dto.topics !== undefined
      ? (Array.isArray(dto.topics) ? dto.topics : []).map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean)
      : undefined;
  const nextAttachments = dto.attachments !== undefined ? normalizeAttachments(dto.attachments) : undefined;
  let nextProductId: number | undefined | null = undefined; // null = 显式解绑
  if (dto.productId !== undefined) {
    const pid = Number(dto.productId);
    if (pid && !store.products.has(pid)) throw Errors.notFound('关联的款不存在');
    nextProductId = pid || null;
  }

  if (nextTitle !== undefined) row.title = nextTitle;
  if (nextContent !== undefined) row.content = nextContent;
  if (nextContentType !== undefined) row.contentType = nextContentType;
  if (nextImages !== undefined) row.images = nextImages;
  if (nextStyleTags !== undefined) row.styleTags = nextStyleTags;
  if (nextVisibility !== undefined) row.visibility = nextVisibility;
  if (nextTopics !== undefined) row.topics = nextTopics;
  if (nextAttachments !== undefined) row.attachments = nextAttachments;
  if (nextProductId !== undefined) {
    row.productId = nextProductId ?? undefined;
    row.relatedProducts = nextProductId ? [nextProductId] : [];
  }
  if (dto.videoUrl !== undefined) row.videoUrl = String(dto.videoUrl) || undefined;
  if (dto.coverUrl !== undefined) row.coverUrl = String(dto.coverUrl) || row.coverUrl;
  if (dto.priceRange !== undefined) row.priceRange = String(dto.priceRange);
  if (dto.moq !== undefined) row.moq = Number(dto.moq);
  if (dto.location !== undefined) row.location = String(dto.location);
  row.summary = summarize(row.content, row.title);
  row.updatedAt = nowIso();

  const media = [...row.images, ...(row.videoUrl ? [row.videoUrl] : [])];
  const outcome = auditContent(row.id, [row.title, row.content, row.topics.join(' ')].join('\n'), media);
  row.auditStatus = outcome.auditStatus;

  writeContentAudit(store, row.id, 'article', [row.title, row.content].join('\n'), outcome, { board: row.board, action: 'update' });
  pushNotification(store, {
    userId: user.id,
    type: 'audit',
    allowSelf: true,
    title: outcome.pass ? '内容已更新' : '内容审核未通过',
    body: outcome.message,
    targetType: 'article',
    targetId: row.id,
  });
  recordBehavior(store, { userId: user.id, action: 'publish', targetType: 'article', targetId: row.id, styleTag: row.styleTags[0] });

  const result: PublishOutcome = {
    id: row.id,
    articleId: row.id,
    auditStatus: outcome.auditStatus,
    textAudit: {
      pass: outcome.pass,
      reason: outcome.pass ? undefined : `命中敏感词：${outcome.hitWords.join('、')}`,
      hitWords: outcome.hitWords,
    },
    mediaTaskIds: outcome.mediaTaskIds,
    manualReview: outcome.manualReview,
    message: outcome.message,
  };
  if (row.productId) result.productId = row.productId;
  return result;
}

export function removeContent(store: Store, user: User, id: number): { ok: boolean; restorableUntil: string } {
  const row = loadOwnArticle(store, user, id);
  const restorableUntil = new Date(Date.now() + RESTORE_DAYS * 86_400_000).toISOString();
  row.deleted = true;
  row.topped = false;
  row.restorableUntil = restorableUntil;
  row.updatedAt = nowIso();
  pushNotification(store, {
    userId: user.id,
    type: 'system',
    allowSelf: true,
    title: '内容已删除',
    body: `《${row.title}》已进入回收站，${RESTORE_DAYS} 天内可恢复`,
    targetType: 'article',
    targetId: row.id,
  });
  recordBehavior(store, { userId: user.id, action: 'publish', targetType: 'article:delete', targetId: row.id, styleTag: row.styleTags[0] });
  return { ok: true, restorableUntil };
}

export function restoreContent(store: Store, user: User, id: number): { ok: boolean; restored: boolean; id: number } {
  const row = store.articles.get(Number(id));
  if (!row) throw Errors.notFound('内容不存在');
  if (row.authorId !== user.id && user.role !== 'admin') throw Errors.forbidden('只能恢复自己的内容');
  if (!row.deleted) return { ok: true, restored: false, id: row.id };
  if (row.restorableUntil && new Date(row.restorableUntil).getTime() < Date.now()) {
    throw Errors.forbidden(`内容删除已超过 ${RESTORE_DAYS} 天，无法恢复`);
  }
  row.deleted = false;
  delete (row as ArticleRow & { restorableUntil?: string }).restorableUntil;
  row.updatedAt = nowIso();
  pushNotification(store, {
    userId: user.id,
    type: 'system',
    allowSelf: true,
    title: '内容已恢复',
    body: `《${row.title}》已恢复发布`,
    targetType: 'article',
    targetId: row.id,
  });
  recordBehavior(store, { userId: user.id, action: 'publish', targetType: 'article:restore', targetId: row.id, styleTag: row.styleTags[0] });
  return { ok: true, restored: true, id: row.id };
}

/* ------------------------------ 我的内容 / 置顶 ------------------------------ */

export function toArticleSummary(store: Store, row: ArticleRow, viewerId?: number): ArticleSummaryRow {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    coverUrl: row.coverUrl,
    contentType: row.contentType,
    type: row.type,
    styleTags: row.styleTags ?? [],
    topics: row.topics ?? [],
    images: row.images ?? [],
    videoUrl: row.videoUrl,
    viewCount: row.viewCount,
    likeCount: row.likeCount,
    collectCount: row.collectCount,
    commentCount: row.commentCount,
    cesScore: row.cesScore,
    visibility: row.visibility,
    auditStatus: row.auditStatus,
    createdAt: row.createdAt,
    author: toUserBrief(store.users.get(row.authorId)),
    liked: viewerId ? likedByMe(store, viewerId, 'article', row.id) : undefined,
    collected: viewerId ? collectedByMe(store, viewerId, 'article', row.id) : undefined,
    followed: viewerId ? followedByMe(store, viewerId, row.authorId) : undefined,
    board: row.board,
    topped: row.topped,
    deleted: row.deleted,
    shareCount: row.shareCount,
    updatedAt: row.updatedAt,
    productId: row.productId,
  };
}

export function myContent(store: Store, user: User, q: { board?: string; sort?: string; page: number; pageSize: number }) {
  let rows = all(store.articles).filter((r) => r.authorId === user.id && !r.deleted);
  const board = String(q.board ?? '').trim();
  if (board === 'info' || board === 'source') rows = rows.filter((r) => r.board === board);
  const sort = String(q.sort ?? 'time').trim();
  const interaction = (r: ArticleRow) => r.likeCount + r.commentCount * 2 + r.collectCount + r.shareCount;
  rows.sort((a, b) => {
    if (!!a.topped !== !!b.topped) return a.topped ? -1 : 1; // 置顶永远在最前
    if (sort === 'view') return b.viewCount - a.viewCount;
    if (sort === 'interaction') return interaction(b) - interaction(a);
    return byTimeDesc(a, b);
  });
  const paged = pageOf(rows, q.page, q.pageSize);
  return { ...paged, list: paged.list.map((r) => toArticleSummary(store, r, user.id)) };
}

export function topContent(store: Store, user: User, id: number): { ok: boolean; topped: boolean; topCount: number } {
  const row = loadOwnArticle(store, user, id);
  if (row.topped) {
    row.topped = false;
    recordBehavior(store, { userId: user.id, action: 'publish', targetType: 'article:untop', targetId: row.id, styleTag: row.styleTags[0] });
    return { ok: true, topped: false, topCount: countTop(store, user.id) };
  }
  const current = countTop(store, user.id);
  if (current >= MAX_TOP) throw Errors.badRequest(`最多只能置顶 ${MAX_TOP} 条内容，请先取消其他置顶`);
  row.topped = true;
  recordBehavior(store, { userId: user.id, action: 'publish', targetType: 'article:top', targetId: row.id, styleTag: row.styleTags[0] });
  return { ok: true, topped: true, topCount: current + 1 };
}

function countTop(store: Store, userId: number): number {
  return all(store.articles).filter((r) => r.authorId === userId && !r.deleted && r.topped).length;
}

/* ------------------------------ 数据看板 ------------------------------ */

const TRAFFIC_BASE: { source: string; weight: number }[] = [
  { source: '推荐', weight: 0.45 },
  { source: '搜索', weight: 0.22 },
  { source: '关注', weight: 0.18 },
  { source: '分享', weight: 0.09 },
  { source: '个人主页', weight: 0.06 },
];

/** 最大余数法：整数百分比且合计严格等于 100（避免逐项四舍五入后 99/101） */
function toPercent(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 100);
  const out = raw.map((v) => Math.floor(v));
  let rest = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - out[i] })).sort((a, b) => b.frac - a.frac);
  for (const o of order) {
    if (rest <= 0) break;
    out[o.i] += 1;
    rest -= 1;
  }
  return out;
}

export function contentAnalytics(store: Store, user: User, id: number): ContentAnalytics & { coldStart: boolean } {
  const row = store.articles.get(Number(id));
  if (!row || row.deleted) throw Errors.notFound('内容不存在或已删除');
  if (row.authorId !== user.id && user.role !== 'admin') throw Errors.forbidden('只能查看自己内容的数据看板');

  const viewBehaviors = all(store.behaviors).filter((b) => b.action === 'view' && b.targetType === 'article' && b.targetId === row.id);
  const total = Math.max(row.viewCount, viewBehaviors.length);

  // 流量来源：真实埋点（带 keyword 归为搜索）+ 基础权重补足剩余曝光。
  // 冷启动（0 浏览）不下发假流量：给出基础渠道权重作为「预估分布」并标记 coldStart，
  // 趋势仍然如实为 0，前端可据此展示「暂无数据」。
  const keys = TRAFFIC_BASE.map((t) => t.source);
  const rand = seededRandom(row.id * 97 + 13);
  let coldStart = false;
  let trafficSource: { source: string; percent: number }[];
  if (total <= 0) {
    coldStart = true;
    trafficSource = TRAFFIC_BASE.map((t) => ({ source: t.source, percent: Math.round(t.weight * 100) }));
  } else {
    const raw = new Map<string, number>(TRAFFIC_BASE.map((t) => [t.source, t.weight]));
    for (const b of viewBehaviors) {
      const source = b.keyword ? '搜索' : '推荐';
      raw.set(source, (raw.get(source) ?? 0) + 0.6);
    }
    const shareRows = all(store.shares).filter((s) => s.targetType === 'article' && s.targetId === row.id).length;
    raw.set('分享', (raw.get('分享') ?? 1) + shareRows * 0.5);
    const jittered = keys.map((k) => (raw.get(k) ?? 0) * (0.85 + rand() * 0.3));
    const percent = toPercent(jittered);
    trafficSource = keys.map((source, i) => ({ source, percent: percent[i] }));
  }

  // 近 7 天趋势：按天聚合真实浏览埋点，剩余曝光按「越近越多」的确定性权重补齐
  const labels = lastDays(7);
  const dayKeys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    dayKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  const realByDay = new Array(7).fill(0) as number[];
  for (const b of viewBehaviors) {
    const d = new Date(b.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const idx = dayKeys.indexOf(key);
    if (idx >= 0) realByDay[idx] += 1;
  }
  const restViews = Math.max(0, total - realByDay.reduce((a, b) => a + b, 0));
  const dayWeight = [0.06, 0.08, 0.11, 0.14, 0.17, 0.2, 0.24];
  const weightSum = dayWeight.reduce((a, b) => a + b, 0);
  const trend = labels.map((date, i) => ({
    date,
    views: Math.round(realByDay[i] + (restViews * dayWeight[i] * (0.8 + rand() * 0.4)) / weightSum),
  }));

  const createdMs = new Date(row.createdAt).getTime();
  const followerGain = all(store.follows).filter(
    (f) => f.followingId === row.authorId && new Date(f.createdAt).getTime() >= createdMs,
  ).length;

  return {
    contentId: row.id,
    viewCount: row.viewCount,
    likeCount: row.likeCount,
    collectCount: row.collectCount,
    commentCount: row.commentCount,
    shareCount: row.shareCount,
    contactCount: row.contactCount,
    followerGain,
    trafficSource,
    trend,
    // 契约外的补充标记（前端可忽略）：该内容尚无浏览，来源占比为冷启动预估
    coldStart,
  };
}

/* ------------------------------ 草稿 ------------------------------ */

export function saveDraft(store: Store, user: User, dto: Partial<PublishContentDto>, draftId?: number): Draft {
  let row: DraftRow | undefined;
  if (draftId) {
    row = store.drafts.get(Number(draftId));
    if (!row || row.deleted) throw Errors.notFound('草稿不存在');
    if (row.userId !== user.id) throw Errors.forbidden('只能编辑自己的草稿');
  }
  const id = row?.id ?? nextId(store, 'drafts');
  const base: DraftRow = row ?? {
    id,
    userId: user.id,
    contentType: 'image_text',
    title: '',
    content: '',
    images: [],
    styleTags: [],
    topics: [],
    visibility: 'public',
    updatedAt: nowIso(),
  };
  if (dto.contentType !== undefined) base.contentType = normalizeContentType(dto.contentType);
  if (dto.title !== undefined) base.title = String(dto.title);
  if (dto.content !== undefined) base.content = String(dto.content);
  if (dto.images !== undefined) base.images = normalizeUrls(dto.images);
  if (dto.videoUrl !== undefined) base.videoUrl = String(dto.videoUrl) || undefined;
  if (dto.styleTags !== undefined) base.styleTags = normalizeStyleTags(dto.styleTags, user);
  if (dto.topics !== undefined) base.topics = (Array.isArray(dto.topics) ? dto.topics : []).map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean);
  if (dto.visibility !== undefined) base.visibility = normalizeVisibility(dto.visibility);
  if (dto.productId !== undefined) base.productId = Number(dto.productId) || undefined;
  if (dto.location !== undefined) base.location = String(dto.location) || undefined;
  if (dto.scheduledAt !== undefined) base.scheduledAt = String(dto.scheduledAt) || undefined;
  base.updatedAt = nowIso();
  store.drafts.set(id, base);
  recordBehavior(store, { userId: user.id, action: 'publish', targetType: 'draft', targetId: id, styleTag: base.styleTags[0] });
  return stripDraft(base);
}

export function draftList(store: Store, user: User): Draft[] {
  return all(store.drafts)
    .filter((d) => d.userId === user.id && !d.deleted)
    .sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime())
    .map(stripDraft);
}

export function deleteDraft(store: Store, user: User, id: number): { ok: boolean } {
  const row = store.drafts.get(Number(id));
  if (!row || row.deleted) throw Errors.notFound('草稿不存在');
  if (row.userId !== user.id) throw Errors.forbidden('只能删除自己的草稿');
  store.drafts.delete(row.id);
  recordBehavior(store, { userId: user.id, action: 'publish', targetType: 'draft:delete', targetId: row.id, styleTag: row.styleTags?.[0] });
  return { ok: true };
}

function stripDraft(row: DraftRow): Draft {
  const { deleted, ...rest } = row;
  return rest;
}
