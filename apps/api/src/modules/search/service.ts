import type { ArticleSummary, SearchResult, UserBrief } from '@wfb/shared-types';
import { bandOf, calcCesScore, midpointOfRange, searchScore } from '@wfb/shared-utils';
import type { ArticleRow, ProductRow, Store } from '../../core/db';
import { toUserBrief } from '../../core/security';

/* =========================================================================
 * 搜索排序（PRD 第二十二篇 9.7 / docs/API.md 第 13 节）
 *
 * 排序分 = 基础信息完整度 25% + 历史表现 35% + 反馈 25% + 整体表现 15%
 *          （完全复用 packages/shared-utils 的 searchScore()，四项分解分原样下发）
 *        × 70% + 关键词相关性 × 30%（相关性是「能不能搜到」的硬门槛）
 *
 * scoreBreakdown 返回每一条货源的四项分解分，供「搜索排序」可视化页展示。
 * ========================================================================= */

/** 相关性 : 质量分 的融合权重 */
export const RELEVANCE_WEIGHT = 0.3;
export const QUALITY_WEIGHT = 0.7;
/** 热搜词统计窗口（天） */
export const HOT_WINDOW_DAYS = 30;
/** 资讯 CES 对数归一化的参考量级（Demo 数据 CES 多在数百~数千） */
export const CES_REFERENCE = 5000;

export interface SearchParams {
  keyword: string;
  board: 'all' | 'info' | 'source';
  style?: string;
  priceBand?: string;
  shipFrom?: string;
  page: number;
  pageSize: number;
  userId?: number;
}

export interface SearchOutcome extends SearchResult {
  /** 额外下发：本次实际生效的排序口径（Demo 可视化用，前端可忽略） */
  strategy: string;
}

/* ============================== 文本相关性 ============================== */

function countHits(haystack: string | undefined, keyword: string): number {
  if (!haystack) return 0;
  const text = haystack.toLowerCase();
  const kw = keyword.toLowerCase();
  if (!kw) return 0;
  let hits = 0;
  let idx = text.indexOf(kw);
  while (idx >= 0 && hits < 6) {
    hits += 1;
    idx = text.indexOf(kw, idx + kw.length);
  }
  return hits;
}

function productRelevance(row: ProductRow, keyword: string): number {
  let rel = 0;
  rel += Math.min(countHits(row.title, keyword), 3) * 34;
  rel += Math.min(countHits(row.description, keyword), 3) * 8;
  if (row.styleTag && row.styleTag.toLowerCase().includes(keyword.toLowerCase())) rel += 30;
  if (row.shipFrom && row.shipFrom.toLowerCase().includes(keyword.toLowerCase())) rel += 10;
  if (row.priceRange && row.priceRange.includes(keyword)) rel += 6;
  return Math.min(rel, 100);
}

function articleRelevance(row: ArticleRow, keyword: string): number {
  let rel = 0;
  rel += Math.min(countHits(row.title, keyword), 3) * 30;
  rel += Math.min(countHits(row.summary, keyword), 3) * 12;
  rel += Math.min(countHits(row.content, keyword), 5) * 5;
  if ((row.styleTags ?? []).some((t) => String(t).toLowerCase().includes(keyword.toLowerCase()))) rel += 30;
  if ((row.topics ?? []).some((t) => String(t).toLowerCase().includes(keyword.toLowerCase()))) rel += 20;
  return Math.min(rel, 100);
}

function manufacturerRelevance(u: { nickname: string; companyName?: string; bio?: string; styleTags?: string[] }, keyword: string): number {
  let rel = 0;
  rel += Math.min(countHits(u.companyName, keyword), 2) * 34;
  rel += Math.min(countHits(u.nickname, keyword), 2) * 30;
  rel += Math.min(countHits(u.bio, keyword), 2) * 10;
  if ((u.styleTags ?? []).some((t) => t.toLowerCase().includes(keyword.toLowerCase()))) rel += 26;
  return Math.min(rel, 100);
}

/* ============================== 厂家维度质量输入 ============================== */

export interface ManufacturerStats {
  productCount: number;
  productIds: number[];
  totalContacts: number;
  validContacts: number;
  violationCount: number;
  certified: boolean;
  paidLevel: boolean;
  totalViews: number;
  totalContactsCount: number;
  contactRate: number;
  lastContactAt?: string;
}

export function manufacturerStatsOf(store: Store): Map<number, ManufacturerStats> {
  const out = new Map<number, ManufacturerStats>();
  const ensure = (id: number): ManufacturerStats => {
    let s = out.get(id);
    if (!s) {
      s = {
        productCount: 0,
        productIds: [],
        totalContacts: 0,
        validContacts: 0,
        violationCount: 0,
        certified: false,
        paidLevel: false,
        totalViews: 0,
        totalContactsCount: 0,
        contactRate: 0,
      };
      out.set(id, s);
    }
    return s;
  };

  for (const u of store.users.values()) {
    if (u.role !== 'manufacturer') continue;
    const s = ensure(u.id);
    s.certified = u.certStatus === 'approved';
    s.paidLevel = !!u.memberLevel && u.memberLevel.startsWith('manufacturer_') && u.memberLevel !== 'manufacturer_free';
  }
  for (const p of store.products.values()) {
    const s = ensure(p.manufacturerId);
    s.productCount += 1;
    s.productIds.push(p.id);
    s.totalViews += p.viewCount;
    s.totalContactsCount += p.contactCount;
    if (p.status === 'rejected') s.violationCount += 1;
  }
  for (const log of store.contactLogs.values()) {
    const s = ensure(log.manufacturerId);
    s.totalContacts += 1;
    if (log.followUpStatus !== 'invalid') s.validContacts += 1;
    if (!s.lastContactAt || new Date(log.contactedAt).getTime() > new Date(s.lastContactAt).getTime()) {
      s.lastContactAt = log.contactedAt;
    }
  }
  // 违规：该厂家名下款/内容被人工驳回的审核记录
  for (const log of store.auditLogs.values()) {
    if (log.reviewStatus !== 'manual_reject' && log.reviewStatus !== 'auto_reject') continue;
    for (const s of out.values()) {
      if (s.productIds.includes(log.bizId)) s.violationCount += 1;
    }
  }
  for (const s of out.values()) {
    s.contactRate = s.totalViews > 0 ? Math.round((s.totalContacts / s.totalViews) * 1000) / 1000 : 0;
  }
  return out;
}

/** 货源搜索打分：完全复用 searchScore()，返回四项分解分 */
export function scoreProduct(row: ProductRow, mf: ManufacturerStats | undefined): ReturnType<typeof searchScore> {
  const stats: ManufacturerStats =
    mf ??
    ({
      productCount: 0,
      productIds: [],
      totalContacts: 0,
      validContacts: 0,
      violationCount: 0,
      certified: false,
      paidLevel: false,
      totalViews: 0,
      totalContactsCount: 0,
      contactRate: 0,
    } satisfies ManufacturerStats);
  const contactRate = row.viewCount ? row.contactCount / row.viewCount : 0;
  return searchScore({
    hasImages: (row.images ?? []).length > 0,
    hasPrice: !!row.priceRange,
    hasMoq: Number(row.moq) > 0,
    hasShipFrom: !!row.shipFrom,
    viewCount: row.viewCount ?? 0,
    contactRate,
    collectCount: row.collectCount ?? 0,
    validContacts: stats.validContacts,
    totalContacts: stats.totalContacts,
    certified: stats.certified,
    paidLevel: stats.paidLevel,
    violationCount: stats.violationCount,
  });
}

/* ============================== 综合搜索 ============================== */

function toArticleSummary(store: Store, row: ArticleRow): ArticleSummary {
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
    cesScore: calcCesScore(row),
    visibility: row.visibility,
    auditStatus: row.auditStatus,
    createdAt: row.createdAt,
    author: toUserBrief(store.users.get(row.authorId)),
  };
}

export function searchAll(store: Store, p: SearchParams): SearchOutcome {
  const keyword = p.keyword.trim();
  const stats = manufacturerStatsOf(store);

  /* ---------- 货源 ---------- */
  const productHits: { row: ProductRow; rel: number; breakdown: ReturnType<typeof searchScore>; rank: number }[] = [];
  if (p.board === 'all' || p.board === 'source') {
    for (const row of store.products.values()) {
      if (row.status !== 'approved') continue;
      if (p.style && row.styleTag !== p.style) continue;
      if (p.shipFrom && row.shipFrom !== p.shipFrom) continue;
      if (p.priceBand) {
        const band = bandOf(midpointOfRange(row.priceRange) || row.priceMin || 0);
        if (band !== p.priceBand) continue;
      }
      const rel = productRelevance(row, keyword);
      if (rel <= 0) continue;
      const breakdown = scoreProduct(row, stats.get(row.manufacturerId));
      const rank = breakdown.total * QUALITY_WEIGHT + rel * RELEVANCE_WEIGHT;
      productHits.push({ row, rel, breakdown, rank });
    }
    productHits.sort((a, b) => b.rank - a.rank || b.row.viewCount - a.row.viewCount);
  }

  /* ---------- 资讯 ---------- */
  const articleHits: { row: ArticleRow; rel: number; rank: number }[] = [];
  if (p.board === 'all' || p.board === 'info') {
    for (const row of store.articles.values()) {
      if (row.deleted || row.auditStatus !== 'approved') continue;
      // board=info 只搜资讯板块；board=all 时连货源板块的 UGC 内容（拿货实拍/穿搭/款卡片）一起搜
      if (p.board === 'info' && row.board !== 'info') continue;
      const rel = articleRelevance(row, keyword);
      if (rel <= 0) continue;
      // 资讯排序：相关性 60% + CES 热度 40%（CES 用 shared-utils 同一口径，对数归一化，参考量级 5000）
      const ces = calcCesScore(row);
      const cesNorm = Math.min(Math.log(1 + Math.max(ces, 0)) / Math.log(1 + CES_REFERENCE), 1);
      const rank = rel * 0.6 + cesNorm * 100 * 0.4;
      articleHits.push({ row, rel, rank });
    }
    articleHits.sort((a, b) => b.rank - a.rank || new Date(b.row.createdAt).getTime() - new Date(a.row.createdAt).getTime());
  }

  /* ---------- 厂家 ---------- */
  const manufacturerHits: { user: UserBrief; rel: number; rank: number; productCount: number; contactRate: number }[] = [];
  if (p.board === 'all') {
    for (const u of store.users.values()) {
      if (u.role !== 'manufacturer') continue;
      const rel = manufacturerRelevance(u, keyword);
      if (rel <= 0) continue;
      const s = stats.get(u.id);
      const productCount = s?.productCount ?? 0;
      const contactRate = s?.contactRate ?? 0;
      // 认证 + 付费版 + 款数 提升厂家排序（与搜索排序「整体表现 15%」一致的口径）
      const rank = rel * 0.6 + (s?.certified ? 15 : 0) + (s?.paidLevel ? 10 : 0) + Math.min(productCount, 24) * 0.5;
      manufacturerHits.push({ user: toUserBrief(u, { productCount, contactRate }), rel, rank, productCount, contactRate });
    }
    manufacturerHits.sort((a, b) => b.rank - a.rank || b.productCount - a.productCount);
  }

  const products = productHits.slice((p.page - 1) * p.pageSize, p.page * p.pageSize);
  const articles = articleHits.slice((p.page - 1) * p.pageSize, p.page * p.pageSize);

  const scoreBreakdown = products.map((h) => ({
    productId: h.row.id,
    base: h.breakdown.base,
    performance: h.breakdown.performance,
    feedback: h.breakdown.feedback,
    overall: h.breakdown.overall,
    total: h.breakdown.total,
  }));

  const strategy = [
    `关键词「${keyword}」`,
    `排序=基础信息完整度25%+历史表现35%+反馈25%+整体表现15%(shared-utils searchScore)×${QUALITY_WEIGHT} + 关键词相关性×${RELEVANCE_WEIGHT}`,
    `命中 货源${productHits.length}/资讯${articleHits.length}/厂家${manufacturerHits.length}`,
    `本页 货源${products.length}/资讯${articles.length}/厂家${Math.min(manufacturerHits.length, 8)}`,
  ].join(' → ');

  return {
    products: products.map((h) => ({
      ...h.row,
      contactRate: h.row.viewCount ? Math.round((h.row.contactCount / h.row.viewCount) * 1000) / 1000 : 0,
      score: Math.round(h.rank * 100) / 100,
      manufacturer: toUserBrief(store.users.get(h.row.manufacturerId)),
    })),
    articles: articles.map((h) => toArticleSummary(store, h.row)),
    manufacturers: manufacturerHits.slice(0, 8).map((m) => m.user),
    total: productHits.length + articleHits.length + manufacturerHits.length,
    scoreBreakdown,
    strategy,
  };
}

/* ============================== 热搜词 ============================== */

export interface HotKeyword {
  keyword: string;
  heat: number;
  /** 额外：热度来源明细（Demo 可视化） */
  count: number;
  source: 'behavior' | 'content';
}

/**
 * 热搜词：= 近 30 日搜索埋点次数的时间衰减加权（半衰期 7 天）
 *        + 去重用户数加成；没有任何搜索埋点时回落到内容侧热词（风格/话题出现频次）。
 */
export function hotKeywords(store: Store, limit = 10): HotKeyword[] {
  const halfLife = 7;
  const windowStart = Date.now() - HOT_WINDOW_DAYS * 86_400_000;
  const decay = (iso: string) => Math.pow(0.5, Math.max(0, (Date.now() - new Date(iso).getTime()) / 86_400_000) / halfLife);
  const stats = new Map<string, { heat: number; count: number; users: Set<number> }>();

  for (const b of store.behaviors.values()) {
    if (b.action !== 'search' || !b.keyword) continue;
    if (new Date(b.createdAt).getTime() < windowStart) continue;
    const key = b.keyword.trim();
    if (!key) continue;
    const s = stats.get(key) ?? { heat: 0, count: 0, users: new Set<number>() };
    s.heat += decay(b.createdAt);
    s.count += 1;
    s.users.add(b.userId);
    stats.set(key, s);
  }

  const out: HotKeyword[] = Array.from(stats.entries()).map(([keyword, s]) => ({
    keyword,
    heat: Math.round((s.heat + s.users.size * 0.5) * 100) / 100,
    count: s.count,
    source: 'behavior' as const,
  }));

  if (!out.length) {
    // 无搜索埋点：用资讯话题 + 风格标签的真实出现频次兜底（仍然不是写死值）
    const counts = new Map<string, number>();
    for (const a of store.articles.values()) {
      if (a.deleted || a.auditStatus !== 'approved') continue;
      for (const t of a.topics ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
      for (const t of a.styleTags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    for (const [keyword, count] of counts.entries()) {
      out.push({ keyword, heat: Math.round(count * 100) / 100, count, source: 'content' });
    }
  }

  out.sort((a, b) => b.heat - a.heat || b.count - a.count);
  return out.slice(0, limit);
}
