import type { ArticleSummary, PublishProductDto, Product, StyleTag, User, UserBrief } from '@wfb/shared-types';
import { MANUFACTURER_PLANS, planOf } from '@wfb/shared-types';
import { bandOf, precheckText } from '@wfb/shared-utils';
import type { Store } from '../../core/db';
import { Errors } from '../../core/server';
import { toUserBrief } from '../../core/security';
import { pageSlice, toProduct, trackBehavior } from '../../gateway/platform';
import { nextId } from '../../core/db';
import { buildInfoFeed, buildSourceFeed } from '../recommend/service';

/* =========================================================================
 * 资讯 / 货源 首页流（docs/API.md 第 4、6 节）
 *
 * 排序逻辑**完全复用** recommend 模块的三层规则引擎（api-rank 实现），
 * 这里只做 tab/type/keyword/topic/city 这些「过滤条件」的映射，
 * 避免出现两套推荐算法漂移。
 * ========================================================================= */

const SOURCE_TYPES = ['product_card', 'sourcing_shot', 'outfit'];

export interface InfoFeedOptions {
  tab?: string;
  styleTags: StyleTag[];
  topic?: string;
  city?: string;
  type?: string;
  keyword?: string;
  page: number;
  pageSize: number;
  user?: User;
  visitCountHeader?: string;
}

export interface SourceFeedOptions {
  tab?: string;
  styleTags: StyleTag[];
  priceBand?: string;
  shipFrom?: string;
  keyword?: string;
  page: number;
  pageSize: number;
  user?: User;
  visitCountHeader?: string;
}

function followSet(store: Store, userId?: number): Set<number> {
  const set = new Set<number>();
  if (!userId) return set;
  for (const f of store.follows.values()) if (f.followerId === userId) set.add(f.followingId);
  return set;
}

/** GET /api/info/feed */
export function infoFeed(store: Store, opts: InfoFeedOptions) {
  const engine = buildInfoFeed(store, {
    board: 'info',
    styleTags: opts.styleTags,
    page: 1,
    pageSize: 50, // 先取引擎全量（Demo 数据量 < 50），再按 tab 过滤后分页
    userId: opts.user?.id,
    memberLevel: opts.user?.memberLevel,
    role: opts.user?.role,
    visitCountHeader: opts.visitCountHeader,
  });

  let rows: ArticleSummary[] = engine.list;
  const applied: string[] = [];
  const tab = opts.tab || 'recommend';

  if (tab === 'follow') {
    const following = followSet(store, opts.user?.id);
    rows = rows.filter((a) => following.has(a.author.id));
    applied.push(`关注的人(${following.size})`);
  }
  if (tab === 'style' && opts.styleTags.length) {
    rows = rows.filter((a) => a.styleTags.some((t) => opts.styleTags.includes(t)));
    applied.push(`风格=${opts.styleTags.join('/')}`);
  }
  if (opts.topic) {
    const key = opts.topic.replace(/^#/, '');
    rows = rows.filter((a) => (a.topics ?? []).some((t) => String(t).replace(/^#/, '') === key));
    applied.push(`话题=#${key}`);
  }
  if (opts.city) {
    rows = rows.filter((a) => {
      const raw = store.articles.get(a.id);
      const author = store.users.get(raw?.authorId ?? 0);
      return `${raw?.location ?? ''}${(author?.sourcingCities ?? []).join('')}`.includes(opts.city as string);
    });
    applied.push(`城市=${opts.city}`);
  }
  if (opts.type && opts.type !== 'all') {
    rows = rows.filter((a) => {
      const raw = store.articles.get(a.id);
      if (!raw) return false;
      if (opts.type === 'video') return raw.contentType === 'video' || !!raw.videoUrl;
      if (opts.type === 'article') return raw.contentType === 'image_text' || raw.contentType === 'long_article';
      return raw.contentType === opts.type;
    });
    applied.push(`类型=${opts.type}`);
  }
  if (opts.keyword) {
    rows = rows.filter((a) => `${a.title}${a.summary}${(a.topics ?? []).join('')}`.includes(opts.keyword as string));
    applied.push(`关键词=${opts.keyword}`);
  }
  if (tab === 'city' && !opts.city && opts.user?.sourcingCities?.length) {
    const city = opts.user.sourcingCities[0];
    rows = rows.filter((a) => {
      const raw = store.articles.get(a.id);
      return `${raw?.location ?? ''}${(store.users.get(raw?.authorId ?? 0)?.sourcingCities ?? []).join('')}`.includes(city);
    });
    applied.push(`城市=${city}(画像)`);
  }

  const paged = pageSlice(rows, opts.page, opts.pageSize);
  return {
    ...engine,
    ...paged,
    strategy: applied.length ? `${engine.strategy} → 过滤[${applied.join(' + ')}]` : `${engine.strategy} → 无附加过滤（tab=${tab}）`,
    tab,
  };
}

/** GET /api/source/feed */
export function sourceFeed(store: Store, opts: SourceFeedOptions) {
  const engine = buildSourceFeed(store, {
    board: 'source',
    styleTags: opts.styleTags,
    priceBand: opts.priceBand,
    shipFrom: opts.shipFrom,
    page: 1,
    pageSize: 50,
    userId: opts.user?.id,
    memberLevel: opts.user?.memberLevel,
    role: opts.user?.role,
    visitCountHeader: opts.visitCountHeader,
  });

  let rows: Product[] = engine.list;
  const applied: string[] = [];
  const tab = opts.tab || 'recommend';

  if (tab === 'follow') {
    const following = followSet(store, opts.user?.id);
    rows = rows.filter((p) => following.has(p.manufacturerId));
    applied.push(`关注的厂家(${following.size})`);
  }
  if (tab === 'style' && opts.styleTags.length) {
    rows = rows.filter((p) => opts.styleTags.includes(p.styleTag));
    applied.push(`风格=${opts.styleTags.join('/')}`);
  }
  if (tab === 'city') {
    const city = opts.shipFrom || opts.user?.sourcingCities?.[0];
    if (city) {
      rows = rows.filter((p) => p.shipFrom.includes(city));
      applied.push(`发货地=${city}`);
    }
  }
  if (tab === 'new') {
    rows = [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    applied.push('按上新时间');
  }
  if (opts.keyword) {
    rows = rows.filter((p) => `${p.title}${p.description}${p.styleTag}`.includes(opts.keyword as string));
    applied.push(`关键词=${opts.keyword}`);
  }
  if (opts.priceBand) {
    rows = rows.filter((p) => {
      const min = Number(String(p.priceRange).split('-')[0]);
      const band = opts.priceBand as string;
      const [lo, hi] = band.split('-').map((x) => Number(String(x).replace('+', '')));
      return Number.isFinite(min) && min >= lo && (Number.isFinite(hi) ? min < hi : true);
    });
    applied.push(`价格带=${opts.priceBand}`);
  }

  const paged = pageSlice(rows, opts.page, opts.pageSize);
  return {
    ...engine,
    ...paged,
    strategy: applied.length ? `${engine.strategy} → 过滤[${applied.join(' + ')}]` : `${engine.strategy} → 无附加过滤（tab=${tab}）`,
    tab,
  };
}

/* ------------------------------ 资讯详情 ------------------------------ */

const LEVEL_RANK: Record<string, number> = { free: 0, elite: 1, shark: 2, tour: 3, landmark: 3 };

export function articleDetail(store: Store, id: number, viewer?: User) {
  const a = store.articles.get(id);
  if (!a || a.deleted) throw Errors.notFound('内容不存在或已删除');
  if (a.auditStatus !== 'approved' && viewer?.role !== 'admin') throw Errors.forbidden('内容尚未通过审核');
  const need = a.visibility === 'elite' ? 1 : a.visibility === 'shark' ? 2 : a.visibility === 'landmark' ? 3 : 0;
  if (need > 0 && viewer?.role !== 'admin' && (LEVEL_RANK[viewer?.memberLevel ?? 'free'] ?? 0) < need) {
    throw Errors.forbidden(`该内容仅「${a.visibility}」及以上会员可见`);
  }

  a.viewCount += 1;
  if (viewer) trackBehavior(store, { userId: viewer.id, action: 'view', targetType: 'article', targetId: a.id, styleTag: a.styleTags[0] });

  const related = [...store.articles.values()]
    .filter((x) => x.id !== a.id && !x.deleted && x.auditStatus === 'approved' && x.board === 'info')
    .map((x) => ({ x, score: x.styleTags.filter((t) => a.styleTags.includes(t)).length * 10 + (x.type === a.type ? 3 : 0) }))
    .sort((m, n) => n.score - m.score || n.x.viewCount - m.x.viewCount)
    .slice(0, 5)
    .map((m) => toSummary(store, m.x));

  const relatedProducts = (a.relatedProducts?.length ? a.relatedProducts : [...store.products.keys()].slice(0, 3))
    .map((pid) => toProduct(store, store.products.get(pid)))
    .filter(Boolean) as Product[];

  const liked = viewer ? [...store.likes.values()].some((l) => l.userId === viewer.id && l.targetType === 'article' && l.targetId === a.id) : false;
  const collected = viewer ? [...store.collects.values()].some((c) => c.userId === viewer.id && c.targetType === 'article' && c.targetId === a.id) : false;
  const followed = viewer ? [...store.follows.values()].some((f) => f.followerId === viewer.id && f.followingId === a.authorId) : false;

  return {
    ...a,
    author: toUserBrief(store.users.get(a.authorId)),
    related,
    relatedProducts,
    liked,
    collected,
    followed,
    toolEntries: [
      { key: 'rewrite', label: '用这篇的思路写一条文案', path: '/pages/tools/rewrite' },
      { key: 'trending', label: '找同风格爆款选题', path: '/pages/tools/trending' },
      { key: 'ai-image', label: '一键生成配图', path: '/pages/tools/ai-image' },
      { key: 'teleprompter', label: '拍成口播视频', path: '/pages/tools/teleprompter' },
    ],
  };
}

function toSummary(store: Store, a: import('../../core/db').ArticleRow): ArticleSummary {
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
    cesScore: a.cesScore,
    visibility: a.visibility,
    auditStatus: a.auditStatus,
    createdAt: a.createdAt,
    author: toUserBrief(store.users.get(a.authorId)),
  };
}

/* ------------------------------ 货源详情 / 厂家列表 ------------------------------ */

export function productDetail(store: Store, id: number, viewer?: User) {
  const p = store.products.get(id);
  if (!p) throw Errors.notFound('款不存在');
  if (p.status !== 'approved' && viewer?.role !== 'admin') throw Errors.forbidden('该款尚未通过审核');

  p.viewCount += 1;
  p.contactRate = p.viewCount > 0 ? Math.round((p.contactCount / p.viewCount) * 1000) / 1000 : 0;
  if (viewer) trackBehavior(store, { userId: viewer.id, action: 'view', targetType: 'product', targetId: p.id, styleTag: p.styleTag });

  const related = [...store.products.values()]
    .filter((x) => x.id !== p.id && x.status === 'approved')
    .map((x) => ({ x, score: (x.styleTag === p.styleTag ? 10 : 0) + (x.shipFrom === p.shipFrom ? 4 : 0) + x.contactRate * 20 }))
    .sort((m, n) => n.score - m.score)
    .slice(0, 6)
    .map((m) => toProduct(store, m.x) as Product);

  const mf = store.users.get(p.manufacturerId);
  return {
    ...toProduct(store, p),
    related,
    manufacturer: toUserBrief(mf),
    followed: viewer ? [...store.follows.values()].some((f) => f.followerId === viewer.id && f.followingId === p.manufacturerId) : false,
    collected: viewer ? [...store.collects.values()].some((c) => c.userId === viewer.id && c.targetType === 'product' && c.targetId === p.id) : false,
    liked: viewer ? [...store.likes.values()].some((l) => l.userId === viewer.id && l.targetType === 'product' && l.targetId === p.id) : false,
    toolEntries: [
      { key: 'ai-image', label: '一键生成商品海报', path: '/pages/tools/ai-image' },
      { key: 'remove-bg', label: '商品图去背景', path: '/pages/tools/remove-bg' },
      { key: 'rewrite', label: '写一条带货文案', path: '/pages/tools/rewrite' },
      { key: 'video-edit', label: '套模板剪短视频', path: '/pages/tools/video-edit' },
    ],
    contactSuggestion: `加微信可获取该款拿货价与现货情况（当前加微转化率 ${(p.contactRate * 100).toFixed(1)}%）`,
  };
}

export function manufacturerList(store: Store, filters: { keyword?: string; styleTag?: string; city?: string }, page: number, pageSize: number) {
  const rows = [...store.users.values()]
    .filter((u) => u.role === 'manufacturer' || u.role === 'landmark')
    .filter((u) => (filters.styleTag ? u.styleTags.includes(filters.styleTag as StyleTag) : true))
    .filter((u) => (filters.city ? u.sourcingCities.some((c) => c.includes(filters.city as string)) : true))
    .filter((u) => (filters.keyword ? `${u.nickname}${u.companyName ?? ''}${u.bio ?? ''}`.includes(filters.keyword) : true))
    .map((u) => {
      const products = [...store.products.values()].filter((p) => p.manufacturerId === u.id && p.status === 'approved');
      const views = products.reduce((s, p) => s + p.viewCount, 0);
      const contacts = products.reduce((s, p) => s + p.contactCount, 0);
      const brief: UserBrief & Record<string, unknown> = {
        ...toUserBrief(u),
        productCount: products.length,
        contactRate: views > 0 ? Math.round((contacts / views) * 1000) / 1000 : 0,
        viewCount: views,
      };
      return brief;
    })
    .sort((a, b) => ((b as Record<string, unknown>).contactRate as number) - ((a as Record<string, unknown>).contactRate as number));

  const paged = pageSlice(rows, page, pageSize);
  return { ...paged, total: rows.length };
}

/* =========================================================================
 * 厂家发布款管理（docs/API.md 第 6 节 · PRD 9.3 版本可发布款数）
 *   free 3 款 / basic 15 款 / pro、enterprise 不限（productLimit = -1）
 * ========================================================================= */

function upgradeHintFor(planLabel: string, planPrice: number): string {
  const next = MANUFACTURER_PLANS.find((p) => p.price > planPrice) ?? MANUFACTURER_PLANS[MANUFACTURER_PLANS.length - 1];
  return `升级「${next.label} ¥${next.price}/年」可发布 ${next.productLimit === -1 ? '不限量' : `${next.productLimit} 款`}`;
}

/** 厂家自己的款（支持 status 过滤），带加微转化率 */
export function myProducts(store: Store, mf: User, filters: { status?: string; keyword?: string }, page: number, pageSize: number) {
  const plan = planOf(mf.memberLevel);
  const rows = [...store.products.values()]
    .filter((p) => p.manufacturerId === mf.id)
    .filter((p) => (filters.status ? p.status === filters.status : true))
    .filter((p) => (filters.keyword ? `${p.title}${p.description}`.includes(filters.keyword) : true))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    ...pageSlice(rows, page, pageSize),
    stats: {
      total: [...store.products.values()].filter((p) => p.manufacturerId === mf.id).length,
      approved: [...store.products.values()].filter((p) => p.manufacturerId === mf.id && p.status === 'approved').length,
      pending: [...store.products.values()].filter((p) => p.manufacturerId === mf.id && p.status === 'pending').length,
      productLimit: plan.productLimit,
      planLabel: plan.label,
      remaining: plan.productLimit === -1 ? -1 : Math.max(0, plan.productLimit - [...store.products.values()].filter((p) => p.manufacturerId === mf.id).length),
    },
  };
}

/** POST /api/manufacturer/product/publish —— 受版本 productLimit 限制 */
export function publishProduct(store: Store, mf: User, dto: PublishProductDto) {
  const plan = planOf(mf.memberLevel);
  const mine = [...store.products.values()].filter((p) => p.manufacturerId === mf.id);
  if (plan.productLimit !== -1 && mine.length >= plan.productLimit) {
    throw Errors.forbidden(
      `当前版本「${plan.label}」最多发布 ${plan.productLimit} 款（已发布 ${mine.length} 款），${upgradeHintFor(plan.label, plan.price)}`,
    );
  }

  const title = String(dto?.title ?? '').trim();
  if (title.length < 4) throw Errors.badRequest('款标题至少 4 个字');
  const description = String(dto?.description ?? '').slice(0, 2000);
  const images = Array.isArray(dto?.images) ? dto.images.filter(Boolean).slice(0, 18) : [];
  if (!images.length) throw Errors.badRequest('至少上传 1 张款图');
  const priceRange = String(dto?.priceRange ?? '').trim();
  const priceMin = Number((priceRange.match(/\d+(\.\d+)?/g) ?? ['0'])[0]);
  if (!Number.isFinite(priceMin) || priceMin <= 0) throw Errors.badRequest('价格带格式应为「89-129」');
  const moq = Number(dto?.moq ?? 0);
  if (!Number.isFinite(moq) || moq < 1) throw Errors.badRequest('起订量至少 1 件');
  const styleTag = (dto?.styleTag ?? '韩系') as StyleTag;
  const shipFrom = String(dto?.shipFrom ?? '').trim() || '广州';

  // 同步文本审核（与内容发布同一套敏感词库）
  const audit = precheckText(`${title} ${description}`);
  const id = nextId(store, 'products');
  const now = new Date().toISOString();
  const row: Product = {
    id,
    manufacturerId: mf.id,
    title,
    images,
    videoUrl: dto?.videoUrl || undefined,
    priceRange,
    priceMin,
    moq,
    styleTag,
    shipFrom,
    description,
    status: audit.pass ? 'approved' : 'pending',
    viewCount: 0,
    contactCount: 0,
    collectCount: 0,
    likeCount: 0,
    commentCount: 0,
    contactRate: 0,
    createdAt: now,
  };
  store.products.set(id, row);
  trackBehavior(store, { userId: mf.id, action: 'publish', targetType: 'product', targetId: id, styleTag });

  return {
    // PublishResult 契约形状
    id,
    auditStatus: row.status,
    textAudit: { pass: audit.pass, reason: audit.pass ? undefined : `命中敏感词：${audit.hitWords.join('、')}`, hitWords: audit.hitWords },
    mediaTaskIds: images.map((_, i) => `media_${id}_${i}_${Date.now()}`),
    manualReview: !audit.pass,
    message: audit.pass ? '发布成功，已通过同步文本审核' : '文本审核未通过，已转入人工复审',
    // 前端可直接拿到创建结果
    product: toProduct(store, row),
    plan: { label: plan.label, productLimit: plan.productLimit, used: mine.length + 1 },
    priceBand: bandOf(priceMin),
  };
}

/** PUT /api/manufacturer/product/:id —— 编辑（降级超额时同样受限） */
export function updateProduct(store: Store, mf: User, id: number, patch: Partial<PublishProductDto>) {
  const p = store.products.get(id);
  if (!p) throw Errors.notFound('款不存在');
  if (p.manufacturerId !== mf.id && mf.role !== 'admin') throw Errors.forbidden('只能编辑自己发布的款');

  // 版本配额：正常编辑不受限；只有「降级后已超额」才拦截，避免绕过版本限制继续维护超额款
  const plan = planOf(mf.memberLevel);
  const count = [...store.products.values()].filter((x) => x.manufacturerId === p.manufacturerId).length;
  if (plan.productLimit !== -1 && count > plan.productLimit) {
    throw Errors.forbidden(
      `当前版本「${plan.label}」最多 ${plan.productLimit} 款，你已有 ${count} 款，请先删除多余款或${upgradeHintFor(plan.label, plan.price)}`,
    );
  }

  if (patch.title !== undefined) {
    const t = String(patch.title).trim();
    if (t.length < 4) throw Errors.badRequest('款标题至少 4 个字');
    p.title = t;
  }
  if (patch.description !== undefined) p.description = String(patch.description).slice(0, 2000);
  if (patch.images !== undefined) {
    const imgs = (patch.images ?? []).filter(Boolean).slice(0, 18);
    if (!imgs.length) throw Errors.badRequest('至少保留 1 张款图');
    p.images = imgs;
  }
  if (patch.priceRange !== undefined) {
    p.priceRange = String(patch.priceRange);
    p.priceMin = Number((p.priceRange.match(/\d+(\.\d+)?/g) ?? ['0'])[0]) || p.priceMin;
  }
  if (patch.moq !== undefined) p.moq = Math.max(1, Number(patch.moq) || p.moq);
  if (patch.styleTag !== undefined) p.styleTag = patch.styleTag as StyleTag;
  if (patch.shipFrom !== undefined) p.shipFrom = String(patch.shipFrom);
  if (patch.videoUrl !== undefined) p.videoUrl = patch.videoUrl || undefined;

  // 编辑后重新做一次文本审核
  const audit = precheckText(`${p.title} ${p.description}`);
  p.status = audit.pass ? 'approved' : 'pending';
  return { ok: true as const, id: p.id, product: toProduct(store, p), auditStatus: p.status, hitWords: audit.hitWords };
}

/** DELETE /api/manufacturer/product/:id */
export function deleteProduct(store: Store, mf: User, id: number) {
  const p = store.products.get(id);
  if (!p) throw Errors.notFound('款不存在');
  if (p.manufacturerId !== mf.id && mf.role !== 'admin') throw Errors.forbidden('只能删除自己发布的款');
  store.products.delete(id);
  // 关联内容里的推荐位保留 id 但不再解析出款，避免前端拿到脏数据
  return { ok: true as const, id, title: p.title, deletedAt: new Date().toISOString() };
}
