import type { ArticleSummary, Product, Topic } from '@wfb/shared-types';
import { freshnessBoost } from '@wfb/shared-utils';
import type { Store } from '../../core/db';
import { round, toArticleSummary, toProduct } from '../../gateway/platform';

/* =========================================================================
 * 话题榜与话题聚合（docs/API.md 第 11 节）
 * heat 由「出现频次 + 浏览量 + 互动量 + 新鲜度」实算，不是写死的。
 * ========================================================================= */

export interface TopicRow extends Topic {
  /** 近 3 天新增内容数（榜单可视化用） */
  recentCount: number;
  lastAt?: string;
}

export function buildTopics(store: Store, limit = 30, keyword = ''): TopicRow[] {
  const map = new Map<
    string,
    { name: string; contentCount: number; viewCount: number; interaction: number; coverUrl?: string; recentCount: number; lastAt?: string }
  >();

  for (const a of store.articles.values()) {
    if (a.deleted || a.auditStatus !== 'approved') continue;
    for (const t of a.topics ?? []) {
      const name = String(t).replace(/^#/, '').trim();
      if (!name) continue;
      const row = map.get(name) ?? { name, contentCount: 0, viewCount: 0, interaction: 0, coverUrl: undefined, recentCount: 0, lastAt: undefined };
      row.contentCount += 1;
      row.viewCount += a.viewCount;
      row.interaction += a.likeCount + a.commentCount + a.collectCount;
      row.recentCount += freshnessBoost(a.createdAt) > 0.7 ? 1 : 0;
      if (!row.coverUrl && a.coverUrl) row.coverUrl = a.coverUrl;
      if (!row.lastAt || new Date(a.createdAt) > new Date(row.lastAt)) row.lastAt = a.createdAt;
      map.set(name, row);
    }
  }

  return [...map.values()]
    .filter((r) => (keyword ? r.name.includes(keyword) : true))
    .map((r) => {
      const fresh = r.lastAt ? freshnessBoost(r.lastAt, 7) : 0.3;
      const heat = round(r.contentCount * 10 + r.viewCount / 50 + r.interaction * 0.6 + r.recentCount * 8 * fresh, 1);
      return {
        tag: `#${r.name}`,
        name: r.name,
        contentCount: r.contentCount,
        viewCount: r.viewCount,
        heat,
        coverUrl: r.coverUrl,
        recentCount: r.recentCount,
        lastAt: r.lastAt,
      };
    })
    .sort((a, b) => b.heat - a.heat)
    .slice(0, limit);
}

export interface TopicDetail {
  tag: string;
  name: string;
  contentCount: number;
  viewCount: number;
  heat: number;
  coverUrl?: string;
  articles: ArticleSummary[];
  products: Product[];
  relatedTopics: { tag: string; name: string; heat: number }[];
  /** 话题下最热风格，供推荐/联动使用 */
  topStyles: string[];
}

export function topicDetail(store: Store, rawTag: string): TopicDetail {
  const name = decodeURIComponent(String(rawTag ?? '')).replace(/^#/, '').trim();
  const articles = [...store.articles.values()]
    .filter((a) => !a.deleted && a.auditStatus === 'approved' && (a.topics ?? []).some((t) => String(t).replace(/^#/, '') === name))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const styleCounter = new Map<string, number>();
  articles.forEach((a) => a.styleTags.forEach((s) => styleCounter.set(s, (styleCounter.get(s) ?? 0) + 1)));
  const topStyles = [...styleCounter.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);

  // 货源聚合：优先取内容关联款，其次按话题文案模糊匹配
  const directProducts = articles.flatMap((a) => (a.productId ? [store.products.get(a.productId)] : [])).filter(Boolean);
  const fuzzy = [...store.products.values()].filter(
    (p) => p.title.includes(name) || p.description.includes(name) || (topStyles.includes(p.styleTag) && directProducts.length === 0),
  );
  const productMap = new Map<number, Product>();
  [...directProducts, ...fuzzy].forEach((p) => {
    if (p) productMap.set(p.id, toProduct(store, p) as Product);
  });

  const viewCount = articles.reduce((s, a) => s + a.viewCount, 0);
  const interaction = articles.reduce((s, a) => s + a.likeCount + a.commentCount + a.collectCount, 0);
  const byId = buildTopics(store, 200).find((t) => t.name === name);

  return {
    tag: `#${name}`,
    name,
    contentCount: articles.length,
    viewCount,
    heat: byId?.heat ?? round(articles.length * 10 + viewCount / 50 + interaction * 0.6, 1),
    coverUrl: articles[0]?.coverUrl,
    articles: articles.slice(0, 20).map((a) => toArticleSummary(store, a, { reason: `#${name} 相关` })),
    products: [...productMap.values()].slice(0, 12),
    relatedTopics: buildTopics(store, 200)
      .filter((t) => t.name !== name)
      .sort((a, b) => b.heat - a.heat)
      .slice(0, 8)
      .map((t) => ({ tag: t.tag, name: t.name, heat: t.heat })),
    topStyles,
  };
}
