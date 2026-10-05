import type { StyleTag, TargetType } from '@wfb/shared-types';

/* ============================ 时间 / 格式化 ============================ */

export function formatDate(iso: string, withTime = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  const base = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return withTime ? `${base} ${p(d.getHours())}:${p(d.getMinutes())}` : base;
}

/** 相对时间：刚刚 / 5分钟前 / 3小时前 / 2天前 / 2026-08-01 */
export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}天前`;
  return formatDate(iso);
}

/** 大数缩写：12800 → 1.3万 */
export function compactNumber(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`;
  return String(n);
}

export function formatPrice(range: string): string {
  return range.startsWith('¥') ? range : `¥${range}`;
}

export function percent(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}

/* ============================ CES 热度评分 ============================ */
/**
 * 参考小红书 CES 评分体系（第六篇 / 8.5）：
 * 评论 35% + 收藏 28% + 完读 18% + 分享 12% + 点赞 7%
 * 完读用 viewCount 近似（Demo 阶段无完读埋点）。
 */
export const CES_WEIGHTS = { comment: 0.35, collect: 0.28, read: 0.18, share: 0.12, like: 0.07 } as const;

export function calcCesScore(s: {
  commentCount?: number;
  collectCount?: number;
  viewCount?: number;
  shareCount?: number;
  likeCount?: number;
}): number {
  const comment = s.commentCount ?? 0;
  const collect = s.collectCount ?? 0;
  const read = s.viewCount ?? 0;
  const share = s.shareCount ?? 0;
  const like = s.likeCount ?? 0;
  const raw =
    comment * CES_WEIGHTS.comment +
    collect * CES_WEIGHTS.collect +
    read * CES_WEIGHTS.read +
    share * CES_WEIGHTS.share +
    like * CES_WEIGHTS.like;
  // 归一化到百分制，便于看板展示
  return Math.round(raw * 100) / 100;
}

/** 时间衰减：越新权重越高，半衰期 3 天（0.5 ^ (ageDays/3)） */
export function freshnessBoost(createdAt: string, halfLifeDays = 3): number {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  if (!Number.isFinite(ageDays)) return 1;
  return Math.pow(0.5, Math.max(0, ageDays) / halfLifeDays);
}

/* ============================ 风格 / 标签 ============================ */

export function parseTags(input?: string | string[] | null): StyleTag[] {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : String(input).split(',');
  return arr.map((s) => String(s).trim()).filter(Boolean) as StyleTag[];
}

/** 风格匹配度：重合数 / 目标标签数，0~1 */
export function styleMatch(userTags: StyleTag[] = [], itemTags: StyleTag[] = []): number {
  if (!userTags.length || !itemTags.length) return 0;
  const set = new Set(userTags);
  const hit = itemTags.filter((t) => set.has(t)).length;
  return hit / Math.max(userTags.length, 1);
}

/* ============================ 价格带 ============================ */

const BAND_RANGES: Record<string, [number, number]> = {
  '0-50': [0, 50],
  '50-100': [50, 100],
  '100-200': [100, 200],
  '200-500': [200, 500],
  '500-1000': [500, 1000],
  '1000+': [1000, Number.MAX_SAFE_INTEGER],
};

export function bandOf(price: number): string {
  for (const [band, [min, max]] of Object.entries(BAND_RANGES)) {
    if (price >= min && price < max) return band;
  }
  return '1000+';
}

export function priceBandMatch(userBand: string | undefined, productBand: string): number {
  if (!userBand) return 0;
  if (userBand === productBand) return 1;
  const keys = Object.keys(BAND_RANGES);
  const a = keys.indexOf(userBand);
  const b = keys.indexOf(productBand);
  if (a < 0 || b < 0) return 0;
  const distance = Math.abs(a - b);
  return distance === 1 ? 0.5 : distance === 2 ? 0.2 : 0;
}

export function midpointOfRange(range: string): number {
  const nums = String(range).match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  if (!nums.length) return 0;
  if (nums.length === 1) return nums[0];
  return (nums[0] + nums[1]) / 2;
}

/* ============================ 搜索排序权重 ============================ */
/**
 * 第二十二篇 / 9.7 搜索排序：
 * 基础信息完整度 25% + 历史表现 35% + 反馈 25% + 整体表现 15%
 * 单项均为 0~100 分，返回加权总分（0~100）。
 */
export interface ScoreInput {
  /** 款图数量、价格带、起订量、发货地是否齐全 */
  hasImages: boolean;
  hasPrice: boolean;
  hasMoq: boolean;
  hasShipFrom: boolean;
  viewCount: number;
  contactRate: number;
  collectCount: number;
  /** 客服回访确认的有效加微数 */
  validContacts: number;
  totalContacts: number;
  certified: boolean;
  paidLevel: boolean;
  violationCount: number;
}

export interface ScoreBreakdown {
  base: number;
  performance: number;
  feedback: number;
  overall: number;
  total: number;
}

export function searchScore(i: ScoreInput): ScoreBreakdown {
  const infoParts = [i.hasImages, i.hasPrice, i.hasMoq, i.hasShipFrom];
  const base = (infoParts.filter(Boolean).length / infoParts.length) * 100;
  const performance =
    Math.min(i.viewCount / 3000, 1) * 45 +
    Math.min(i.contactRate / 0.15, 1) * 35 +
    Math.min(i.collectCount / 300, 1) * 20;
  const feedback = i.totalContacts > 0 ? Math.min(i.validContacts / i.totalContacts, 1) * 100 : 50;
  const overall = (i.certified ? 40 : 0) + (i.paidLevel ? 30 : 0) + Math.max(0, 30 - i.violationCount * 15);
  const total = base * 0.25 + performance * 0.35 + feedback * 0.25 + overall * 0.15;
  const r = (n: number) => Math.round(n * 100) / 100;
  return { base: r(base), performance: r(performance), feedback: r(feedback), overall: r(overall), total: r(total) };
}

/* ============================ 私信额度 / 接收权重 ============================ */
/**
 * 接收权重 = 近7日登录频次 × 0.4 + 近7日互动行为数 × 0.3 + 认证等级 × 0.3
 * 归一化到 0~100。
 */
export function receiveWeight(s: { loginCount7d: number; actionCount7d: number; certScore: number }): number {
  const login = Math.min(s.loginCount7d / 14, 1) * 100;
  const action = Math.min(s.actionCount7d / 50, 1) * 100;
  const cert = Math.min(Math.max(s.certScore, 0), 1) * 100;
  return Math.round((login * 0.4 + action * 0.3 + cert * 0.3) * 100) / 100;
}

/* ============================ 打散 / 多样性 ============================ */
/**
 * 探索打散：保证每 `windowSize` 条里至少有 `minDistinct` 种不同风格（第六篇）。
 * 保持原有相对顺序，仅把被同风格挤压的后置条目提前，避免破坏热度排序。
 */
export function diversify<T>(items: T[], tagOf: (t: T) => string, windowSize = 10, minDistinct = 2): T[] {
  if (items.length <= windowSize) return items;
  const result: T[] = [];
  const rest = [...items];
  while (rest.length) {
    const window = result.slice(Math.max(0, result.length - (windowSize - 1)));
    const seen = new Set(window.map(tagOf));
    const next = rest.shift()!;
    const tag = tagOf(next);
    const needDistinct = seen.size < minDistinct && seen.has(tag);
    if (needDistinct) {
      const idx = rest.findIndex((r) => !seen.has(tagOf(r)));
      if (idx >= 0) {
        const [swapped] = rest.splice(idx, 1);
        result.push(swapped);
        rest.unshift(next);
        continue;
      }
    }
    result.push(next);
  }
  return result;
}

/* ============================ 敏感词预校验 ============================ */
/** Demo 用最小敏感词库：命中即在前端拦截，后端还会做二次校验 */
export const SENSITIVE_WORDS = ['加微信秒发货', '包治百病', '刷单', '高仿', 'A货', '假货', '代开发票', '博彩', '赌博'];

export function precheckText(text: string): { pass: boolean; hitWords: string[] } {
  const hitWords = SENSITIVE_WORDS.filter((w) => text.includes(w));
  return { pass: hitWords.length === 0, hitWords };
}

/* ============================ 杂项 ============================ */

export function parseTopics(text: string): string[] {
  const matches = text.match(/#([^\s#]{1,20})/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.slice(1))));
}

export function parseMentions(text: string): string[] {
  const matches = text.match(/@([^\s@]{1,20})/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.slice(1))));
}

export function targetKey(targetType: TargetType, targetId: number): string {
  return `${targetType}:${targetId}`;
}

export function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function clsx(...args: (string | false | null | undefined)[]): string {
  return args.filter(Boolean).join(' ');
}

export function shortId(n: number, prefix = 'WF'): string {
  return `${prefix}${String(n).padStart(6, '0')}`;
}

/** 生成最近 N 天日期序列（图表 X 轴） */
export function lastDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    out.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }
  return out;
}

/** 稳定的伪随机（同一 seed 恒等），用于生成可复现的演示数据 */
export function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
