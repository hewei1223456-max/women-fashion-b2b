import type { ArticleSummary, Product, StyleTag, UserBrief, Visibility } from '@wfb/shared-types';
import {
  bandOf,
  calcCesScore,
  diversify,
  freshnessBoost,
  midpointOfRange,
  priceBandMatch,
  styleMatch,
} from '@wfb/shared-utils';
import type { ArticleRow, ProductRow, Store } from '../../core/db';
import { toUserBrief } from '../../core/security';

/* =========================================================================
 * 推荐规则引擎（PRD 第六篇《算法体系》 / docs/API.md 第 13 节）
 *
 * 三层结构（每一层都真实参与算分，strategy 字段回写本次实际生效的规则与数值）：
 *   资讯流：风格标签匹配度 → CES 热度加权（评论35% 收藏28% 完读18% 分享12% 点赞7%）→ 打散
 *   货源流：风格 + 价格带 + 拿货地匹配 → 加微转化率加权 → 打散（风格 + 发货地双约束）
 *   冷启动：前 3 次访问混合 3-5 种风格探索，第 4 次起收敛；
 *          无任何行为埋点的新用户走「近 7 日加微转化率最高」热门通道。
 *
 * 复用 packages/shared-utils 的 calcCesScore / freshnessBoost / styleMatch /
 * priceBandMatch / bandOf / midpointOfRange / diversify，不在本模块重复实现。
 * ========================================================================= */

/** 冷启动判定：访问次数 <= 3 走探索通道（第六篇） */
export const COLD_START_VISITS = 3;
/** 会话切分阈值：埋点间隔超过 30 分钟视为新的一次访问 */
export const SESSION_GAP_MS = 30 * 60_000;
/** 资讯：收敛后 风格 : 热度 权重 */
export const INFO_WEIGHTS = { style: 0.62, heat: 0.38 } as const;
/** 资讯：冷启动期提高热度（探索）权重 */
export const INFO_COLD_WEIGHTS = { style: 0.3, heat: 0.7 } as const;
/** 货源：匹配度内部分解 */
export const SOURCE_MATCH_WEIGHTS = { style: 0.5, priceBand: 0.3, shipFrom: 0.2 } as const;
/** 货源：匹配度 : 加微转化率 权重 */
export const SOURCE_WEIGHTS = { match: 0.45, conversion: 0.55 } as const;
/** 加微转化率封顶基准（对应 searchScore 的 0.15 口径） */
export const CONVERSION_TARGET = 0.15;
/** 打散窗口 */
export const DIVERSITY_WINDOW = 10;
export const DIVERSITY_MIN_STYLES = 2;
export const DIVERSITY_MIN_SHIP_FROM = 2;
/** 冷启动混合风格数区间 */
export const COLD_START_MIX = { min: 3, max: 5 } as const;
/** 近 N 日加微转化率口径 */
export const RECENT_DAYS = 7;

const LEVEL_RANK: Record<string, number> = { free: 0, elite: 1, shark: 2, tour: 3, landmark: 3 };

export interface RecommendQuery {
  board: 'info' | 'source';
  styleTags: StyleTag[];
  priceBand?: string;
  shipFrom?: string;
  page: number;
  pageSize: number;
  /** 登录用户（用于画像与可见性分层），可空 */
  userId?: number;
  memberLevel?: string;
  role?: string;
  /** X-Visit-Count 请求头（Demo 可直接模拟第 N 次访问） */
  visitCountHeader?: string;
}

export interface RankExplain {
  id: number;
  title: string;
  /** 本次实际生效的各层分值，供「推荐策略可视化」页展示 */
  styleMatch: number;
  ces: number;
  freshness: number;
  heat: number;
  contactRate?: number;
  score: number;
}

export interface RecommendFeedResult<T> {
  list: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  strategy: string;
  coldStart: boolean;
  visitCount: number;
  /** 访问次数来源：header | behaviors | anonymous | no-behavior */
  visitSource: string;
  /** 本次实际生效的规则明细（Demo 可视化） */
  rules: Record<string, unknown>;
  /** 打散结果实测：滑动窗口内的最小风格数 / 最小发货地数 */
  diversity: string;
  explain: RankExplain[];
}

/* ============================== 访问次数 / 冷启动 ============================== */

export interface VisitState {
  visitCount: number;
  coldStart: boolean;
  hasBehavior: boolean;
  source: 'header' | 'behaviors' | 'anonymous' | 'no-behavior';
}

/**
 * 访问次数：优先取 X-Visit-Count 请求头（Demo 显式模拟）；否则用本人行为埋点做
 * 会话切分（间隔 > 30 分钟算一次新访问）；完全没有埋点 = 首次访问。
 */
export function resolveVisitState(store: Store, userId: number | undefined, header?: string): VisitState {
  const explicit = Number(header);
  const userBehaviors = userId
    ? Array.from(store.behaviors.values())
        .filter((b) => b.userId === userId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    : [];
  const hasBehavior = userBehaviors.length > 0;

  if (header !== undefined && header !== '' && Number.isFinite(explicit) && explicit >= 1) {
    const visitCount = Math.floor(explicit);
    return { visitCount, coldStart: visitCount <= COLD_START_VISITS, hasBehavior, source: 'header' };
  }
  if (!userId) return { visitCount: 1, coldStart: true, hasBehavior: false, source: 'anonymous' };
  if (!hasBehavior) return { visitCount: 1, coldStart: true, hasBehavior: false, source: 'no-behavior' };

  let sessions = 1;
  for (let i = 1; i < userBehaviors.length; i++) {
    const gap = new Date(userBehaviors[i].createdAt).getTime() - new Date(userBehaviors[i - 1].createdAt).getTime();
    if (gap > SESSION_GAP_MS) sessions += 1;
  }
  const visitCount = Math.min(Math.max(sessions, 1), 99);
  return { visitCount, coldStart: visitCount <= COLD_START_VISITS, hasBehavior, source: 'behaviors' };
}

/* ============================== 通用工具 ============================== */

function primaryStyle(tags: StyleTag[] | undefined): string {
  return tags && tags.length ? tags[0] : '未标注';
}

/** 可见性分层：public 全部可见；elite/shark 按会员等级；landmark 限大店/游学 */
function canSee(visibility: Visibility | undefined, memberLevel?: string, role?: string): boolean {
  if (!visibility || visibility === 'public') return true;
  if (role === 'admin') return true;
  const rank = LEVEL_RANK[memberLevel ?? 'free'] ?? 0;
  switch (visibility) {
    case 'fans':
    case 'group':
      return true; // 需登录，路由守卫已保证
    case 'elite':
      return rank >= 1;
    case 'shark':
      return rank >= 2;
    case 'landmark':
      return role === 'landmark' || rank >= 3;
    default:
      return true;
  }
}

/** 滚动窗口内出现的不同取值个数的最小值（用于证明「每 10 条至少 N 种」真的成立） */
function minDistinctInWindows<T>(items: T[], tagOf: (t: T) => string, windowSize: number): number {
  if (!items.length) return 0;
  const size = Math.min(windowSize, items.length);
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i + size <= items.length; i++) {
    const seen = new Set(items.slice(i, i + size).map(tagOf));
    if (seen.size < min) min = seen.size;
    if (min <= 1) return min;
  }
  return Number.isFinite(min) ? min : new Set(items.map(tagOf)).size;
}

/** 冷启动探索：按风格轮转取样，保证前若干条覆盖 COLD_START_MIX 区间的风格数 */
function exploreMix<T>(ranked: T[], tagOf: (t: T) => string, minStyles = COLD_START_MIX.min, maxStyles = COLD_START_MIX.max): { items: T[]; styles: number } {
  const styleOrder: string[] = [];
  for (const item of ranked) {
    const tag = tagOf(item);
    if (!styleOrder.includes(tag)) styleOrder.push(tag);
    if (styleOrder.length >= maxStyles) break;
  }
  const pool = styleOrder.slice(0, Math.max(minStyles, Math.min(styleOrder.length, maxStyles)));
  if (pool.length <= 1) return { items: ranked, styles: pool.length };
  const buckets = new Map<string, T[]>();
  for (const tag of pool) buckets.set(tag, []);
  const rest: T[] = [];
  for (const item of ranked) {
    const tag = tagOf(item);
    if (buckets.has(tag)) buckets.get(tag)!.push(item);
    else rest.push(item);
  }
  const out: T[] = [];
  let exhausted = false;
  while (!exhausted) {
    exhausted = true;
    for (const tag of pool) {
      const bucket = buckets.get(tag)!;
      const next = bucket.shift();
      if (next) {
        out.push(next);
        exhausted = false;
      }
    }
  }
  return { items: [...out, ...rest], styles: pool.length };
}

function avg(rows: number[]): number {
  if (!rows.length) return 0;
  return rows.reduce((a, b) => a + b, 0) / rows.length;
}

function round(n: number, digits = 2): number {
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
}

/* ============================== 资讯流 ============================== */

function toArticleSummary(store: Store, row: ArticleRow, reason?: string): ArticleSummary {
  const author: UserBrief = toUserBrief(store.users.get(row.authorId));
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
    author,
    reason,
  };
}

export function buildInfoFeed(store: Store, q: RecommendQuery): RecommendFeedResult<ArticleSummary> {
  const visit = resolveVisitState(store, q.userId, q.visitCountHeader);
  const styleTags = q.styleTags;
  /** 无任何行为 + 无风格偏好 = 新用户，走热门通道 */
  const hotChannel = !visit.hasBehavior && styleTags.length === 0;
  const weights = visit.coldStart && !hotChannel ? INFO_COLD_WEIGHTS : INFO_WEIGHTS;

  const candidates = Array.from(store.articles.values()).filter(
    (a) =>
      a.board === 'info' &&
      !a.deleted &&
      a.auditStatus === 'approved' &&
      canSee(a.visibility, q.memberLevel, q.role),
  );

  const cesOf = new Map<number, number>();
  for (const a of candidates) cesOf.set(a.id, calcCesScore(a));
  const maxCes = Math.max(1, ...Array.from(cesOf.values()));
  /** 对数归一化：CES 绝对值跨度大（几万曝光 → 几十万互动），线性归一化会把热度层压成常数 */
  const cesNorm = (ces: number) => Math.log(1 + Math.max(ces, 0)) / Math.log(1 + maxCes);

  type Row = { row: ArticleRow; score: number; style: number; ces: number; fresh: number; heat: number };
  const ranked: Row[] = candidates
    .map((row) => {
      const style = styleMatch(styleTags, row.styleTags ?? []);
      const ces = cesOf.get(row.id) ?? 0;
      const fresh = freshnessBoost(row.createdAt);
      /** 热度 = CES 归一化 × 新鲜度调节（0.55~1.0，避免旧爆款被直接归零） */
      const heat = cesNorm(ces) * (0.55 + 0.45 * fresh);
      const toppedBonus = row.topped ? 0.03 : 0;
      const score = hotChannel ? heat + toppedBonus : weights.style * style + weights.heat * heat + toppedBonus;
      return { row, score, style, ces, fresh, heat };
    })
    .sort((a, b) => b.score - a.score || new Date(b.row.createdAt).getTime() - new Date(a.row.createdAt).getTime());

  const styleOf = (r: Row) => primaryStyle(r.row.styleTags);
  let ordered: Row[] = ranked;
  let mixStyles = 0;
  if (visit.coldStart && ranked.length) {
    const mixed = exploreMix(ranked, styleOf, COLD_START_MIX.min, COLD_START_MIX.max);
    ordered = mixed.items;
    mixStyles = mixed.styles;
  }
  const diversified = diversify(ordered, styleOf, DIVERSITY_WINDOW, DIVERSITY_MIN_STYLES);

  const pageItems = diversified.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
  const minStyles = minDistinctInWindows(diversified, styleOf, DIVERSITY_WINDOW);
  const pageStyles = new Set(pageItems.map(styleOf)).size;
  const pageWindow = pageItems.slice(0, DIVERSITY_WINDOW);
  const windowStyles = new Set(pageWindow.map(styleOf)).size;
  const avgStyle = avg(pageItems.map((r) => r.style));
  const avgCes = avg(pageItems.map((r) => r.ces));
  const avgHeat = avg(pageItems.map((r) => r.heat));
  const avgFresh = avg(pageItems.map((r) => r.fresh));

  const strategy = [
    hotChannel
      ? `无行为新用户热门通道(按CES热度)`
      : visit.coldStart
        ? `冷启动第${visit.visitCount}次访问·混合${mixStyles}种风格探索`
        : `已收敛第${visit.visitCount}次访问`,
    `风格匹配${round(avgStyle).toFixed(2)}×${weights.style}`,
    `CES热度${round(avgCes).toFixed(1)}(归一${round(avgHeat).toFixed(2)}·新鲜度${round(avgFresh).toFixed(2)})×${weights.heat}`,
    `打散窗口风格${windowStyles}/${pageWindow.length || 0}(下限${DIVERSITY_MIN_STYLES})`,
    `候选${candidates.length}篇`,
  ].join(' → ');

  const explain: RankExplain[] = pageItems.slice(0, 8).map((r) => ({
    id: r.row.id,
    title: r.row.title,
    styleMatch: round(r.style),
    ces: round(r.ces),
    freshness: round(r.fresh),
    heat: round(r.heat),
    score: round(r.score),
  }));

  return {
    list: pageItems.map((r) =>
      toArticleSummary(
        store,
        r.row,
        `${hotChannel ? '热门' : `风格匹配${round(r.style).toFixed(2)}`} · CES ${round(r.ces).toFixed(1)} · 新鲜度 ${round(r.fresh).toFixed(2)}`,
      ),
    ),
    page: q.page,
    pageSize: q.pageSize,
    total: diversified.length,
    hasMore: q.page * q.pageSize < diversified.length,
    strategy,
    coldStart: visit.coldStart,
    visitCount: visit.visitCount,
    visitSource: visit.source,
    rules: {
      board: 'info',
      hotChannel,
      weights: { ...weights },
      cesWeights: { comment: 0.35, collect: 0.28, read: 0.18, share: 0.12, like: 0.07 },
      heatNormalization: 'log(1+CES)/log(1+maxCES) × (0.55 + 0.45×新鲜度)',
      freshnessHalfLifeDays: 3,
      diversify: { windowSize: DIVERSITY_WINDOW, minDistinctStyles: DIVERSITY_MIN_STYLES },
      coldStartRule: `前${COLD_START_VISITS}次访问混合${COLD_START_MIX.min}-${COLD_START_MIX.max}种风格，第${COLD_START_VISITS + 1}次起收敛`,
      appliedStyleTags: styleTags,
      candidateCount: candidates.length,
      pageStyleCount: pageStyles,
      windowStyleCount: windowStyles,
      minStyleCountInSlidingWindow: minStyles,
    },
    diversity: `滑动窗口${DIVERSITY_WINDOW}条内最小风格数 ${minStyles}（下限 ${DIVERSITY_MIN_STYLES}），本页覆盖 ${pageStyles} 种风格`,
    explain,
  };
}

/* ============================== 货源流 ============================== */

/** 近 N 日某款的加微数（followUpStatus 非 invalid 计为有效） */
function recentContactsByProduct(store: Store): Map<number, number> {
  const since = Date.now() - RECENT_DAYS * 86_400_000;
  const map = new Map<number, number>();
  for (const log of store.contactLogs.values()) {
    if (new Date(log.contactedAt).getTime() < since) continue;
    if (!log.productId) continue;
    if (log.followUpStatus === 'invalid') continue;
    map.set(log.productId, (map.get(log.productId) ?? 0) + 1);
  }
  return map;
}

/** 近 N 日厂家维度加微转化率：有效加微数 / 该厂家款累计曝光（Demo 无按日曝光，用累计曝光近似） */
export function recentConversionByManufacturer(store: Store): Map<number, { contacts: number; rate: number }> {
  const since = Date.now() - RECENT_DAYS * 86_400_000;
  const contacts = new Map<number, number>();
  for (const log of store.contactLogs.values()) {
    if (new Date(log.contactedAt).getTime() < since) continue;
    if (log.followUpStatus === 'invalid') continue;
    contacts.set(log.manufacturerId, (contacts.get(log.manufacturerId) ?? 0) + 1);
  }
  const views = new Map<number, number>();
  for (const p of store.products.values()) {
    views.set(p.manufacturerId, (views.get(p.manufacturerId) ?? 0) + p.viewCount);
  }
  const out = new Map<number, { contacts: number; rate: number }>();
  for (const [mf, c] of contacts.entries()) {
    const v = Math.max(views.get(mf) ?? 0, 1);
    out.set(mf, { contacts: c, rate: round(c / v, 4) });
  }
  return out;
}

export function buildSourceFeed(store: Store, q: RecommendQuery): RecommendFeedResult<Product> {
  const visit = resolveVisitState(store, q.userId, q.visitCountHeader);
  const styleTags = q.styleTags;
  const userBand = q.priceBand;
  const userShipFrom = q.shipFrom;
  const hotChannel = !visit.hasBehavior && styleTags.length === 0 && !userBand && !userShipFrom;

  const recentByProduct = recentContactsByProduct(store);
  const recentByMf = recentConversionByManufacturer(store);

  const candidates = Array.from(store.products.values()).filter((p) => p.status === 'approved');

  type Row = {
    row: ProductRow;
    score: number;
    style: number;
    priceBandScore: number;
    shipFromScore: number;
    matchScore: number;
    conversion: number;
    conversionRate: number;
  };

  const ranked: Row[] = candidates
    .map((row) => {
      const style = styleMatch(styleTags, row.styleTag ? [row.styleTag] : []);
      const band = bandOf(midpointOfRange(row.priceRange) || row.priceMin || 0);
      const priceBandScore = priceBandMatch(userBand, band);
      const shipFromScore = !userShipFrom ? 0 : row.shipFrom === userShipFrom ? 1 : 0;
      const matchScore =
        SOURCE_MATCH_WEIGHTS.style * style +
        SOURCE_MATCH_WEIGHTS.priceBand * priceBandScore +
        SOURCE_MATCH_WEIGHTS.shipFrom * shipFromScore;

      const recent = recentByProduct.get(row.id) ?? 0;
      const recentRate = recent / Math.max(row.viewCount, 1);
      const baseRate = row.contactRate || (row.viewCount ? row.contactCount / row.viewCount : 0);
      const mfRate = recentByMf.get(row.manufacturerId)?.rate ?? 0;
      /** 加微转化率 = 款自身累计转化 40% + 近7日款转化 40% + 近7日厂家转化 20%（均以 0.15 封顶） */
      const conversion =
        0.4 * Math.min(baseRate / CONVERSION_TARGET, 1) +
        0.4 * Math.min(recentRate / CONVERSION_TARGET, 1) +
        0.2 * Math.min(mfRate / CONVERSION_TARGET, 1);
      const conversionRate = baseRate;

      const score = hotChannel
        ? conversion * 1.0 + Math.min(row.viewCount / 5000, 1) * 0.1
        : SOURCE_WEIGHTS.match * matchScore + SOURCE_WEIGHTS.conversion * conversion;
      return { row, score, style, priceBandScore, shipFromScore, matchScore, conversion, conversionRate };
    })
    .sort((a, b) => b.score - a.score || b.row.viewCount - a.row.viewCount);

  const styleOf = (r: Row) => r.row.styleTag ?? '未标注';
  const shipOf = (r: Row) => r.row.shipFrom ?? '未知';
  let ordered: Row[] = ranked;
  let mixStyles = 0;
  if (visit.coldStart && ranked.length) {
    const mixed = exploreMix(ranked, styleOf, COLD_START_MIX.min, COLD_START_MIX.max);
    ordered = mixed.items;
    mixStyles = mixed.styles;
  }

  // 双约束打散：风格 ≥2 种 + 发货地 ≥2 个（每 10 条滑窗）。
  // 两趟 diversify 可能互相挤压，因此实测校验并交替补偿（最多 3 轮），
  // 保证两条约束同时成立，且仍复用 shared-utils 的 diversify()。
  let diversified = diversify(diversify(ordered, styleOf, DIVERSITY_WINDOW, DIVERSITY_MIN_STYLES), shipOf, DIVERSITY_WINDOW, DIVERSITY_MIN_SHIP_FROM);
  for (let round = 0; round < 3; round++) {
    const needStyle = minDistinctInWindows(diversified, styleOf, DIVERSITY_WINDOW) < DIVERSITY_MIN_STYLES;
    const needShip = minDistinctInWindows(diversified, shipOf, DIVERSITY_WINDOW) < DIVERSITY_MIN_SHIP_FROM;
    if (!needStyle && !needShip) break;
    if (needStyle) diversified = diversify(diversified, styleOf, DIVERSITY_WINDOW, DIVERSITY_MIN_STYLES);
    if (needShip) diversified = diversify(diversified, shipOf, DIVERSITY_WINDOW, DIVERSITY_MIN_SHIP_FROM);
  }

  const pageItems = diversified.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
  const minStyles = minDistinctInWindows(diversified, styleOf, DIVERSITY_WINDOW);
  const minShips = minDistinctInWindows(diversified, shipOf, DIVERSITY_WINDOW);
  const pageWindow = pageItems.slice(0, DIVERSITY_WINDOW);
  const windowStyles = new Set(pageWindow.map(styleOf)).size;
  const windowShips = new Set(pageWindow.map(shipOf)).size;
  const avgStyle = avg(pageItems.map((r) => r.style));
  const avgMatch = avg(pageItems.map((r) => r.matchScore));
  const avgConversion = avg(pageItems.map((r) => r.conversion));
  const avgRate = avg(pageItems.map((r) => r.conversionRate));

  const strategy = [
    hotChannel
      ? `无行为新用户热门通道(近${RECENT_DAYS}日加微转化率最高)`
      : visit.coldStart
        ? `冷启动第${visit.visitCount}次访问·混合${mixStyles}种风格探索`
        : `已收敛第${visit.visitCount}次访问`,
    `风格匹配${round(avgStyle).toFixed(2)}×${SOURCE_MATCH_WEIGHTS.style}`,
    `价格带${round(avg(pageItems.map((r) => r.priceBandScore))).toFixed(2)}×${SOURCE_MATCH_WEIGHTS.priceBand}`,
    `拿货地${round(avg(pageItems.map((r) => r.shipFromScore))).toFixed(2)}×${SOURCE_MATCH_WEIGHTS.shipFrom}`,
    `匹配度${round(avgMatch).toFixed(2)}×${SOURCE_WEIGHTS.match}`,
    `加微转化率${(round(avgRate, 4) * 100).toFixed(2)}%(近${RECENT_DAYS}日加权${round(avgConversion).toFixed(2)})×${SOURCE_WEIGHTS.conversion}`,
    `打散窗口风格${windowStyles}/${pageWindow.length || 0}·发货地${windowShips}/${pageWindow.length || 0}`,
    `候选${candidates.length}款`,
  ].join(' → ');

  const explain: RankExplain[] = pageItems.slice(0, 8).map((r) => ({
    id: r.row.id,
    title: r.row.title,
    styleMatch: round(r.style),
    ces: round(calcCesScore(r.row)),
    freshness: round(freshnessBoost(r.row.createdAt)),
    heat: round(r.matchScore),
    contactRate: round(r.conversionRate, 4),
    score: round(r.score),
  }));

  return {
    list: pageItems.map((r) => ({
      ...r.row,
      contactRate: round(r.conversionRate, 4),
      score: round(r.score, 4),
      manufacturer: toUserBrief(store.users.get(r.row.manufacturerId)),
    })),
    page: q.page,
    pageSize: q.pageSize,
    total: diversified.length,
    hasMore: q.page * q.pageSize < diversified.length,
    strategy,
    coldStart: visit.coldStart,
    visitCount: visit.visitCount,
    visitSource: visit.source,
    rules: {
      board: 'source',
      hotChannel,
      weights: { ...SOURCE_WEIGHTS },
      matchWeights: { ...SOURCE_MATCH_WEIGHTS },
      conversionTarget: CONVERSION_TARGET,
      conversionBreakdown: '款累计转化40% + 近7日款转化40% + 近7日厂家转化20%',
      diversify: {
        windowSize: DIVERSITY_WINDOW,
        minDistinctStyles: DIVERSITY_MIN_STYLES,
        minDistinctShipFrom: DIVERSITY_MIN_SHIP_FROM,
      },
      coldStartRule: `前${COLD_START_VISITS}次访问混合${COLD_START_MIX.min}-${COLD_START_MIX.max}种风格，第${COLD_START_VISITS + 1}次起收敛`,
      appliedStyleTags: styleTags,
      appliedPriceBand: userBand ?? null,
      appliedShipFrom: userShipFrom ?? null,
      candidateCount: candidates.length,
      windowStyleCount: windowStyles,
      windowShipFromCount: windowShips,
      minStyleCountInSlidingWindow: minStyles,
      minShipFromCountInSlidingWindow: minShips,
    },
    diversity: `滑动窗口${DIVERSITY_WINDOW}条内最小风格数 ${minStyles}（下限 ${DIVERSITY_MIN_STYLES}）、最小发货地数 ${minShips}（下限 ${DIVERSITY_MIN_SHIP_FROM}）`,
    explain,
  };
}

/* ============================== 策略元信息 ============================== */

export interface RecommendStrategyMeta {
  strategy: string;
  coldStart: boolean;
  visitCount: number;
  diversity: string;
  visitSource: string;
  rules: Record<string, unknown>;
  boards: { board: 'info' | 'source'; strategy: string }[];
}

export function buildRecommendMeta(store: Store, base: Omit<RecommendQuery, 'board' | 'page' | 'pageSize'>): RecommendStrategyMeta {
  const info = buildInfoFeed(store, { ...base, board: 'info', page: 1, pageSize: 10 });
  const source = buildSourceFeed(store, { ...base, board: 'source', page: 1, pageSize: 10 });
  return {
    strategy: `资讯流：${info.strategy} ｜ 货源流：${source.strategy}`,
    coldStart: info.coldStart || source.coldStart,
    visitCount: Math.max(info.visitCount, source.visitCount),
    diversity: [
      `资讯：每${DIVERSITY_WINDOW}条滑窗 ≥${DIVERSITY_MIN_STYLES} 种风格（实测最小 ${info.rules.minStyleCountInSlidingWindow}）`,
      `货源：每${DIVERSITY_WINDOW}条滑窗 ≥${DIVERSITY_MIN_STYLES} 种风格且 ≥${DIVERSITY_MIN_SHIP_FROM} 个发货地（实测最小 ${source.rules.minStyleCountInSlidingWindow}/${source.rules.minShipFromCountInSlidingWindow}）`,
      `冷启动：前 ${COLD_START_VISITS} 次访问混合 ${COLD_START_MIX.min}-${COLD_START_MIX.max} 种风格，第 ${COLD_START_VISITS + 1} 次起收敛`,
      `无行为新用户：走「近 ${RECENT_DAYS} 日加微转化率最高」热门通道`,
    ].join('；'),
    visitSource: info.visitSource,
    rules: {
      info: info.rules,
      source: source.rules,
      coldStartVisits: COLD_START_VISITS,
      diversityWindow: DIVERSITY_WINDOW,
      visitCountSources: ['X-Visit-Count 请求头', 'store.behaviors 会话切分(间隔>30分钟)'],
    },
    boards: [
      { board: 'info', strategy: info.strategy },
      { board: 'source', strategy: source.strategy },
    ],
  };
}
