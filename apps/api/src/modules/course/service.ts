import type { ArticleSummary, Course, Product, SearchResult, UserBrief } from '@wfb/shared-types';
import { searchScore } from '@wfb/shared-utils';
import type { Store } from '../../core/db';
import { Errors } from '../../core/server';
import { toUserBrief } from '../../core/security';
import { toArticleSummary, toProduct } from '../../gateway/platform';

/* =========================================================================
 * 课程 / 游学蒸馏 / 资讯搜索（PRD 资讯板块 · docs/API.md 第 4 节）
 * ========================================================================= */

export function courseView(store: Store, c: Course): Course & { lecturer: UserBrief } {
  return { ...c, lecturer: toUserBrief(store.users.get(c.lecturerId)) };
}

export function courseList(store: Store, filters: { category?: string; keyword?: string; free?: boolean; sort?: string }) {
  return [...store.courses.values()]
    .filter((c) => (filters.category ? c.category === filters.category : true))
    .filter((c) => (filters.keyword ? `${c.title}${c.intro}${c.category}`.includes(filters.keyword) : true))
    .filter((c) => (filters.free === undefined ? true : c.free === filters.free))
    .map((c) => courseView(store, c))
    .sort((a, b) =>
      filters.sort === 'price' ? a.price - b.price : filters.sort === 'hot' ? b.studentCount - a.studentCount : b.studentCount - a.studentCount,
    );
}

export function courseDetail(store: Store, id: number) {
  const c = store.courses.get(id);
  if (!c) throw Errors.notFound('课程不存在');
  const lecturer = store.users.get(c.lecturerId);
  // 讲师的其他课程
  const others = [...store.courses.values()].filter((x) => x.lecturerId === c.lecturerId && x.id !== c.id).map((x) => courseView(store, x));
  // 讲师的方法论内容（资讯→课程 联动）
  const articles = [...store.articles.values()]
    .filter((a) => a.authorId === c.lecturerId && !a.deleted)
    .slice(0, 4)
    .map((a) => toArticleSummary(store, a));
  const chapters = Array.from({ length: c.lessonCount }, (_, i) => ({
    index: i + 1,
    title: `${['开篇：问题定义', '核心方法拆解', '案例复盘', '工具与模板', '常见错误', '实操演练', '进阶技巧', '总结与作业'][i % 8]}（第 ${i + 1} 讲）`,
    duration: `${12 + ((i * 7) % 26)} 分钟`,
    free: i === 0,
  }));
  return {
    ...courseView(store, c),
    lecturerBio: lecturer?.bio,
    lecturerCompany: lecturer?.companyName,
    chapters,
    others,
    articles,
    totalDuration: `${chapters.reduce((s, ch) => s + Number(ch.duration.replace(/[^\d]/g, '')), 0)} 分钟`,
  };
}

/** 游学蒸馏：按期数倒序 + 按期分组 */
export function distillation(store: Store, period?: number) {
  const rows = [...store.articles.values()]
    .filter((a) => a.type === 'distillation' && !a.deleted && a.auditStatus === 'approved')
    .filter((a) => (period ? a.period === period : true))
    .sort((a, b) => (b.period ?? 0) - (a.period ?? 0));

  const groupMap = new Map<number, ArticleSummary[]>();
  rows.forEach((a) => {
    const p = a.period ?? 0;
    const list = groupMap.get(p) ?? [];
    list.push(toArticleSummary(store, a, { reason: `第 ${p} 期游学` }));
    groupMap.set(p, list);
  });

  const groups = [...groupMap.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([p, articles]) => ({
      period: p,
      label: `第 ${p} 期`,
      count: articles.length,
      attachments: articles.flatMap((a) => {
        const raw = store.articles.get(a.id);
        return (raw?.attachments ?? []).map((f) => ({ ...f, articleId: a.id }));
      }),
      articles,
    }));

  return {
    list: rows.map((a) => toArticleSummary(store, a)),
    groups,
    periods: groups.map((g) => ({ period: g.period, label: g.label, count: g.count })),
    total: rows.length,
  };
}

/** 资讯搜索：资讯为主 + 货源/厂家联动，带 scoreBreakdown */
export function infoSearch(store: Store, keyword: string, limit = 10): SearchResult {
  const kw = keyword.trim();
  if (!kw) return { products: [], articles: [], manufacturers: [], total: 0, scoreBreakdown: [] };

  const articles = [...store.articles.values()]
    .filter((a) => !a.deleted && a.auditStatus === 'approved' && a.board === 'info')
    .filter((a) => `${a.title}${a.summary}${a.content}${(a.topics ?? []).join('')}${(a.styleTags ?? []).join('')}`.includes(kw))
    .sort((a, b) => b.cesScore - a.cesScore)
    .slice(0, limit)
    .map((a) => toArticleSummary(store, a, { reason: `标题/正文命中「${kw}」` }));

  const products = [...store.products.values()]
    .filter((p) => `${p.title}${p.description}${p.styleTag}${p.shipFrom}`.includes(kw))
    .sort((a, b) => b.contactRate - a.contactRate)
    .slice(0, limit);

  const manufacturers: UserBrief[] = [...store.users.values()]
    .filter((u) => (u.role === 'manufacturer' || u.role === 'landmark') && `${u.nickname}${u.companyName ?? ''}${u.bio ?? ''}`.includes(kw))
    .slice(0, limit)
    .map((u) => toUserBrief(u));

  // 排序分拆解（基础完整度 25% + 历史表现 35% + 反馈 25% + 整体表现 15%）
  const scoreBreakdown = products.map((p) => {
    const validContacts = [...store.contactLogs.values()].filter(
      (l) => l.productId === p.id && (l.followUpStatus === 'converted' || l.followUpStatus === 'contacted'),
    ).length;
    const totalContacts = [...store.contactLogs.values()].filter((l) => l.productId === p.id).length;
    const mf = store.users.get(p.manufacturerId);
    const s = searchScore({
      hasImages: (p.images?.length ?? 0) > 0,
      hasPrice: !!p.priceRange,
      hasMoq: p.moq > 0,
      hasShipFrom: !!p.shipFrom,
      viewCount: p.viewCount,
      contactRate: p.contactRate,
      collectCount: p.collectCount,
      validContacts,
      totalContacts,
      certified: mf?.certStatus === 'approved',
      paidLevel: !!mf && mf.memberLevel !== 'manufacturer_free',
      violationCount: 0,
    });
    return { productId: p.id, ...s };
  });

  const allProducts: Product[] = products.slice(0, limit);

  return {
    products: allProducts.map((p) => toProduct(store, p) as Product),
    articles,
    manufacturers,
    total: articles.length + allProducts.length + manufacturers.length,
    scoreBreakdown,
  };
}
