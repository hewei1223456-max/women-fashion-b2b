import type { Store } from './db';
import { nextId, syncSequences } from './db';
import { svgPlaceholder, type SvgRatio } from './placeholder';

/* =========================================================================
 * 演示数据播种（SEED）
 *
 * 目标：让 Demo 一启动就是一个「看起来已经在运营」的平台：
 *   18 个用户（店主 / 厂家 / 地标大店 / 讲师 / 运营 + 厂家子账号）
 *   24 个款、30+ 篇内容、8 家大店、6 门课程、拼单、订货会、评论、私信、通知
 *
 * 图片策略：**不使用外链 CDN**。演示图改由后端 `/uploads/demo/*.svg` 托管，
 * 内容是按 seed 确定性生成的渐变占位图（见 core/placeholder.ts）。
 * 这样离线 / 内网 / CDN 不可达时界面依然完整，不会出现一片灰色空白。
 * 生产环境把下面的 img() 换成 OSS 直链即可。
 * ========================================================================= */

const SEED = 20261005;
const now = Date.now();

/** 生成由 /uploads 托管的演示图地址（支持按内容写文字） */
const img = (seed: string, w = 600, h = 800, label = ''): string => {
  const ratio: SvgRatio = w === h ? 'square' : w > h ? (w / h >= 1.6 ? 'wide' : 'landscape') : 'portrait';
  const q = new URLSearchParams({ seed, ratio, w: String(w), h: String(h) });
  if (label) q.set('label', label);
  return `/uploads/demo/img.svg?${q.toString()}`;
};
const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

/** 简易稳定伪随机，保证每次播种数据一致 */
function rnd(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface SeedUser {
  nickname: string;
  role: 'shop_owner' | 'manufacturer' | 'landmark' | 'lecturer' | 'admin';
  memberLevel: string;
  styleTags: string[];
  companyName?: string;
  bio: string;
  cities?: string[];
}

const SEED_USERS: SeedUser[] = [
  {
    nickname: '七叔',
    role: 'admin',
    memberLevel: 'free',
    styleTags: ['韩系', '新中式'],
    companyName: '女装B2B平台',
    bio: '平台运营。行业认知的搬运工，只讲能落地的。',
  },
  {
    nickname: '杭州·小满家（主理人）',
    role: 'shop_owner',
    memberLevel: 'shark',
    styleTags: ['韩系', '通勤'],
    companyName: '小满服饰',
    bio: '杭州四季青起家，4 家店。主做韩系通勤，客单 380。',
    cities: ['杭州', '四季青'],
  },
  {
    nickname: '郑州·衣瞬间',
    role: 'shop_owner',
    memberLevel: 'elite',
    styleTags: ['法式', '甜美'],
    companyName: '衣瞬间',
    bio: '郑州二七商圈 2 家店，法式甜美风，专攻 18-25 岁客群。',
    cities: ['郑州'],
  },
  {
    nickname: '成都·阿May',
    role: 'shop_owner',
    memberLevel: 'tour',
    styleTags: ['新中式', '轻奢'],
    companyName: 'MAY 集合店',
    bio: '春熙路 1 家 120 平店，新中式轻奢，参加过第 5/6 期游学。',
    cities: ['成都', '濮院'],
  },
  {
    nickname: '广州·南油阿强',
    role: 'shop_owner',
    memberLevel: 'elite',
    styleTags: ['欧美', '休闲'],
    companyName: '阿强服饰',
    bio: '南油档口 8 年，欧美休闲，量大价低。',
    cities: ['广州', '南油'],
  },
  {
    nickname: '西安·楠楠',
    role: 'shop_owner',
    memberLevel: 'free',
    styleTags: ['甜美', '休闲'],
    bio: '刚开店的 95 后，还在摸索风格，来学习组货。',
    cities: ['西安'],
  },
  {
    nickname: '广州·意法·简派制衣',
    role: 'manufacturer',
    memberLevel: 'manufacturer_pro',
    styleTags: ['法式', '轻奢'],
    companyName: '广州简派制衣有限公司',
    bio: '意法原创设计，法式轻奢连衣裙，30 件起订，支持贴牌。',
    cities: ['广州', '意法'],
  },
  {
    nickname: '杭州·濮院·牧云针织',
    role: 'manufacturer',
    memberLevel: 'manufacturer_basic',
    styleTags: ['韩系', '通勤'],
    companyName: '桐乡牧云针织',
    bio: '濮院羊毛衫源头厂，毛织全品类，现货+期货。',
    cities: ['桐乡', '濮院'],
  },
  {
    nickname: '深圳·南油·森岛',
    role: 'manufacturer',
    memberLevel: 'manufacturer_enterprise',
    styleTags: ['新中式', '复古'],
    companyName: '深圳森岛服饰',
    bio: '南油原创，新中式/复古，自有版房 30 人，日产能 3000 件。',
    cities: ['深圳', '南油'],
  },
  {
    nickname: '杭州·十三行·棉时代',
    role: 'manufacturer',
    memberLevel: 'manufacturer_free',
    styleTags: ['休闲', '甜美'],
    companyName: '杭州棉时代',
    bio: '基础款棉 T / 卫衣，走量为主，20 件起订。',
    cities: ['杭州', '十三行'],
  },
  {
    nickname: '杭州·四季青·标杆店「三姐妹」',
    role: 'landmark',
    memberLevel: 'free',
    styleTags: ['韩系', '通勤'],
    companyName: '三姐妹服饰',
    bio: '四季青标杆大店，年销 3200 万，韩系快反模式，单店 SKU 800+。',
    cities: ['杭州', '四季青'],
  },
  {
    nickname: '广州·十三行·「发财树」',
    role: 'landmark',
    memberLevel: 'free',
    styleTags: ['欧美', '休闲'],
    companyName: '发财树服饰',
    bio: '十三行 6 楼头部档口，日均出货 1.5 万件，主攻下沉市场爆款。',
    cities: ['广州', '十三行'],
  },
  {
    nickname: '讲师·李陈列',
    role: 'lecturer',
    memberLevel: 'free',
    styleTags: ['轻奢'],
    companyName: '陈列研究所',
    bio: '前太平鸟陈列总监，主讲《小店也能做的陈列动线》。',
  },
  {
    nickname: '讲师·王短视频',
    role: 'lecturer',
    memberLevel: 'free',
    styleTags: ['韩系'],
    companyName: '短视频陪跑营',
    bio: '女装账号 0-1 起号，3 个月做到 12 万粉。',
  },
];

const POST_IMAGES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const STYLE_CYCLE = ['韩系', '法式', '新中式', '轻奢', '欧美', '休闲', '复古', '甜美', '通勤'];

export function seedStore(store: Store): void {
  const rand = rnd(SEED);

  /* ------------------------------ 用户 ------------------------------ */
  const userIds: number[] = [];
  SEED_USERS.forEach((s, idx) => {
    const id = nextId(store, 'users');
    userIds.push(id);
    const createdAt = iso(60 * 24 * (60 - idx));
    store.users.set(id, {
      id,
      phone: `1380000${String(1000 + idx)}`,
      nickname: s.nickname,
      avatarUrl: img(`avatar-${idx + 1}`, 200, 200),
      bio: s.bio,
      role: s.role,
      certStatus: s.role === 'shop_owner' || s.role === 'manufacturer' ? 'approved' : s.role === 'admin' ? 'none' : 'approved',
      companyName: s.companyName,
      certLicenseUrl: img(`license-${idx + 1}`, 800, 600),
      styleTags: s.styleTags as never,
      priceBand: s.role === 'shop_owner' ? '200-500' : undefined,
      sourcingCities: s.cities ?? [],
      memberLevel: s.memberLevel as never,
      memberExpireAt: s.memberLevel === 'free' ? undefined : new Date(now + 300 * 86_400_000).toISOString(),
      pushEnabled: idx % 5 !== 0,
      createdAt,
      updatedAt: createdAt,
    });
  });
  const [adminId, owner1, owner2, owner3, owner4, owner5, mf1, mf2, mf3, mf4, lm1, lm2, lect1, lect2] = userIds;
  void lect2;

  /* ------------------------------ 厂家款 ------------------------------ */
  const PRODUCT_TITLES = [
    '2026春夏 法式碎花方领连衣裙 收腰显瘦',
    '韩系通勤 冰丝混纺西装外套 一件代发',
    '新中式盘扣提花上衣 国风改良日常款',
    '轻奢缎面吊带裙 内搭外穿两用',
    '欧美风 阔腿高腰牛仔裤 显腿长',
    '休闲基础款 纯棉短袖T恤 12色现货',
    '复古港风 撞色格纹半裙',
    '甜美泡泡袖 雪纺衫 春秋款',
    '通勤垂感阔腿裤 抗皱免烫',
    '法式方领针织开衫 薄款防晒',
    '韩系小香风 粗花呢套装裙',
    '新中式提花马甲 叠穿神器',
    '轻奢醋酸衬衫 垂坠不易皱',
    '欧美街头 短款卫衣 落肩宽松',
    '休闲运动套装 两件套 亲肤棉',
    '复古印花衬衫 港风花衬衣',
    '甜美碎花裹身裙 度假风',
    '通勤西装裤 直筒微喇 显瘦',
    '法式蕾丝拼接 长袖上衣',
    '韩系针织连衣裙 秋冬打底',
    '新中式立领衬衫 桑蚕丝混纺',
    '轻奢真丝方巾 配饰提升质感',
    '欧美皮衣外套 短款机车风',
    '休闲卫裤 束脚加绒 冬季款',
  ];
  const MF_IDS = [mf1, mf2, mf3, mf4];
  const MF_STYLES: Record<number, string> = { [mf1]: '法式', [mf2]: '韩系', [mf3]: '新中式', [mf4]: '休闲' };
  const CITIES = ['广州', '桐乡', '深圳', '杭州'];
  /** 厂家 → 发货地，保证「发货地」与厂家所在地一致（拿货地匹配算法才有意义） */
  const MF_CITY: Record<number, string> = { [mf1]: '广州', [mf2]: '桐乡', [mf3]: '深圳', [mf4]: '杭州' };
  /** 风格 → 最擅长该风格的厂家（厂家池只有 4 家，故一家覆盖多种风格） */
  const MF_BY_STYLE: Record<string, number> = {
    法式: mf1,
    轻奢: mf1,
    通勤: mf2,
    韩系: mf2,
    新中式: mf3,
    复古: mf3,
    休闲: mf4,
    甜美: mf4,
    欧美: mf4,
  };
  /** 标题关键词 → 风格标签（顺序即优先级，先匹配到的生效） */
  const STYLE_FROM_TITLE: { key: string; tag: string }[] = [
    { key: '韩系', tag: '韩系' },
    { key: '法式', tag: '法式' },
    { key: '新中式', tag: '新中式' },
    { key: '轻奢', tag: '轻奢' },
    { key: '欧美', tag: '欧美' },
    { key: '复古', tag: '复古' },
    { key: '港风', tag: '复古' },
    { key: '甜美', tag: '甜美' },
    { key: '通勤', tag: '通勤' },
    { key: '小香风', tag: '轻奢' },
    { key: '休闲', tag: '休闲' },
    { key: '运动', tag: '休闲' },
    { key: '基础款', tag: '休闲' },
  ];

  const productIds: number[] = [];
  PRODUCT_TITLES.forEach((title, idx) => {
    const id = nextId(store, 'products');
    productIds.push(id);
    /**
     * 风格标签从**标题关键词**推导，而不是按索引轮转。
     * 早期版本用 `idx % 4 === 0 ? STYLE_CYCLE[idx%9] : MF_STYLES[mfId]` 轮转，
     * 会出现「休闲基础款纯棉T恤」被标成「韩系」这种与标题自相矛盾的脏数据。
     *
     * 厂家与发货地都**由风格反推**：
     *   风格 → 最擅长该风格的厂家（MF_BY_STYLE）→ 厂家所在城市（拿货地）。
     * 这样「标题 ↔ 风格标签 ↔ 厂家 ↔ 发货地」四者自洽，
     * 前端的风格/发货地筛选与推荐引擎的「拿货地匹配」才有真实意义。
     * 厂家池只有 4 家而风格有 9 种，所以厂家覆盖多种风格（现实中也是如此）。
     */
    const style = STYLE_FROM_TITLE.find((s) => title.includes(s.key))?.tag ?? STYLE_CYCLE[idx % STYLE_CYCLE.length];
    const mfId = MF_BY_STYLE[style] ?? MF_IDS[idx % MF_IDS.length];
    const priceMin = [39, 59, 89, 129, 199, 259, 329, 459][idx % 8];
    const priceMax = priceMin + [20, 40, 60, 100][idx % 4];
    const viewCount = Math.round(320 + rand() * 4200);
    const contactCount = Math.round(viewCount * (0.03 + rand() * 0.12));
    store.products.set(id, {
      id,
      manufacturerId: mfId,
      title,
      images: [img(`p-${idx}-1`, 600, 800, title), img(`p-${idx}-2`, 600, 800, title), img(`p-${idx}-3`, 600, 800, title)],
      priceRange: `${priceMin}-${priceMax}`,
      priceMin,
      moq: [10, 20, 30, 50][idx % 4],
      styleTag: style as never,
      shipFrom: MF_CITY[mfId] ?? CITIES[idx % 4],
      description: `${title}。源头工厂直供，支持一件代发与贴牌。面料：${['醋酸混纺', '棉麻', '天丝', '真丝混纺', '精梳棉'][idx % 5]}；版型：${['修身', '宽松', 'A字', '直筒'][idx % 4]}；现货充足，48 小时内发出。`,
      status: 'approved',
      viewCount,
      contactCount,
      collectCount: Math.round(viewCount * 0.06),
      likeCount: Math.round(viewCount * 0.08),
      commentCount: Math.round(viewCount * 0.012),
      contactRate: Math.round((contactCount / viewCount) * 1000) / 1000,
      createdAt: iso(60 * (idx * 9 + 3)),
      manufacturer: undefined,
    });
  });

  /* ------------------------------ 大店 ------------------------------ */
  const LANDMARKS = [
    { userId: lm1, shopName: '四季青·三姐妹服饰', city: '杭州', annualRevenue: '3200万', styleDescription: '韩系快反，单店 SKU 800+，每周上新 3 次，7 天返单。', periods: 3 },
    { userId: lm2, shopName: '十三行·发财树服饰', city: '广州', annualRevenue: '5800万', styleDescription: '欧美休闲爆款打法，直播+档口双线，日均 1.5 万件。', periods: 2 },
  ];
  // 补足 8 家大店（复用店主的身份做展示，Demo 阶段不严格要求）
  const EXTRA_LANDMARKS = [
    { userId: owner1, shopName: '杭州·小满集合店', city: '杭州', annualRevenue: '960万', styleDescription: '韩系通勤，4 家店，私域 1.2 万粉。', periods: 1 },
    { userId: owner2, shopName: '郑州·衣瞬间', city: '郑州', annualRevenue: '520万', styleDescription: '法式甜美，商场店+街边店组合。', periods: 1 },
    { userId: owner3, shopName: '成都·MAY 集合店', city: '成都', annualRevenue: '780万', styleDescription: '新中式轻奢，客单 680，复购率 41%。', periods: 2 },
    { userId: owner4, shopName: '广州·阿强服饰', city: '广州', annualRevenue: '2100万', styleDescription: '南油档口起家，欧美休闲，批发为主。', periods: 0 },
    { userId: owner5, shopName: '西安·楠楠小铺', city: '西安', annualRevenue: '180万', styleDescription: '新店，甜美休闲，社区团购+小红书引流。', periods: 0 },
    { userId: mf1, shopName: '广州·简派制衣（工厂店）', city: '广州', annualRevenue: '4200万', styleDescription: '意法原创设计，自有版房，法式轻奢连衣裙。', periods: 1 },
  ];
  const landmarkIds: number[] = [];
  [...LANDMARKS, ...EXTRA_LANDMARKS].forEach((l, idx) => {
    const id = nextId(store, 'landmarks');
    landmarkIds.push(id);
    store.landmarks.set(id, {
      id,
      userId: l.userId,
      shopName: l.shopName,
      city: l.city,
      annualRevenue: l.annualRevenue,
      styleDescription: l.styleDescription,
      coverUrl: img(`landmark-${idx + 1}`, 800, 500, l.shopName),
      articleCount: 3 + (idx % 4),
      followerCount: 200 + idx * 317,
      periods: l.periods,
      createdAt: iso(60 * 24 * (90 - idx * 5)),
    });
  });

  /* ------------------------------ 内容（资讯 + 货源 UGC） ------------------------------ */
  const NEWS_TITLES = [
    '10月女装批发市场行情：秋冬毛织提前启动，意法档口租金环比上涨 8%',
    '濮院羊毛衫订货会本周开启，源头厂给出 15 天账期',
    '抖音女装类目新规：10 月起要求标注面料成分，违规扣分',
    '十三行 5-7 楼改造完成，档口从 1200 家精简到 860 家',
    '面料预警：醋酸原料价格连续 3 周上涨，成本或传导至终端',
    '小红书上线「店播」功能，中小店主可零粉开播',
    '阿里 1688 推出源头厂认证，女装类目首批 320 家通过',
    '南油原创设计周落幕，新中式订单量同比增长 62%',
  ];
  const METHOD_TITLES = [
    '韩系店铺夏季组货逻辑：3:4:3 结构怎么排',
    '小店也能做的陈列动线：把进门 3 米还给顾客',
    '定价策略：为什么你的爆款不赚钱，引流款与利润款怎么配',
    '低成本测款：用 2000 块跑通一个款的完整流程',
    '从 0 到 1 做私域：500 个精准客户怎么攒出来',
    '拿货谈判的 7 个筹码：起订量、账期、返单速度怎么谈',
    '搭配思路：一件白衬衫的 6 套卖货搭配',
    '橱窗改造实录：从门可罗雀到日进 40 人',
    '爆款节奏表：什么时候该补货，什么时候该清货',
    '短视频起号 30 天：女装账号前 10 条素材怎么拍',
  ];
  const GUIDE_TITLES = [
    '十三行拿货攻略：楼层品类分布 + 起批规则 + 砍价话术',
    '南油档口避坑指南：如何识别「炒货档」',
    '意法原创 vs 沙河跟单：差价 3 倍，差在哪里',
    '濮院毛衫拿货：批次色差、缩水率怎么验收',
  ];

  const articleIds: number[] = [];
  const pushArticle = (a: {
    authorId: number;
    type: string;
    board: 'info' | 'source';
    contentType?: string;
    title: string;
    summary: string;
    content: string;
    styleTags: string[];
    visibility?: string;
    period?: number;
    minutesAgo: number;
    relatedProducts?: number[];
    images?: string[];
    videoUrl?: string;
    topics?: string[];
    productId?: number;
  }) => {
    const id = nextId(store, 'articles');
    articleIds.push(id);
    const viewCount = Math.round(180 + rand() * 5200);
    const commentCount = Math.round(viewCount * (0.008 + rand() * 0.02));
    const collectCount = Math.round(viewCount * (0.02 + rand() * 0.06));
    const shareCount = Math.round(collectCount * 0.35);
    const likeCount = Math.round(viewCount * (0.04 + rand() * 0.08));
    // CES 评分：评论35% + 收藏28% + 完读18% + 分享12% + 点赞7%（第六篇）
    const ces =
      commentCount * 0.35 + collectCount * 0.28 + viewCount * 0.18 + shareCount * 0.12 + likeCount * 0.07;
    store.articles.set(id, {
      id,
      authorId: a.authorId,
      type: a.type as never,
      contentType: (a.contentType ?? 'image_text') as never,
      title: a.title,
      content: a.content,
      summary: a.summary,
      coverUrl: a.images?.[0] ?? img(`art-${id}`, 800, 600, a.title),
      images: a.images ?? [img(`art-${id}-1`, 800, 600, a.title), img(`art-${id}-2`, 800, 600, a.title)],
      videoUrl: a.videoUrl,
      period: a.period,
      attachments:
        a.type === 'distillation'
          ? [
              { name: `第${a.period ?? 5}期游学现场PPT.pdf`, url: '/uploads/demo/period-ppt.pdf', size: '8.4MB' },
              { name: `第${a.period ?? 5}期踩坑案例合集.pdf`, url: '/uploads/demo/pitfalls.pdf', size: '2.1MB' },
            ]
          : [],
      relatedProducts: (a.relatedProducts ?? []).length ? a.relatedProducts! : productIds.slice(0, 3 + (id % 3)),
      visibility: (a.visibility ?? 'public') as never,
      auditStatus: 'approved',
      styleTags: a.styleTags as never,
      topics: a.topics ?? ['女装B2B', a.styleTags[0]],
      location: undefined,
      viewCount,
      likeCount,
      collectCount,
      commentCount,
      shareCount,
      contactCount: a.board === 'source' ? Math.round(contactCountOf(rand, viewCount)) : 0,
      cesScore: Math.round(ces * 100) / 100,
      topped: id % 7 === 0,
      deleted: false,
      createdAt: iso(a.minutesAgo),
      board: a.board,
    });
  };

  NEWS_TITLES.forEach((title, i) =>
    pushArticle({
      authorId: adminId,
      type: 'news',
      board: 'info',
      title,
      summary: title.slice(0, 40),
      content: `## 今日要点\n\n${title}\n\n### 对店主意味着什么\n\n1. 供货端：源头厂交期普遍在 7-15 天，建议按 2 周安全库存备货。\n2. 价格端：同款差价主要集中在面料成分，采购时务必索要成分检测报告。\n3. 销售端：本周直播间客单环比提升 6%，中高客单款可以适度加推。\n\n### 建议动作\n\n- 本周内完成秋冬第一批测款，控制在 5 个款以内\n- 与 2-3 家源头厂建立直连，减少中间档口加价\n- 关注面料成分标注新规，避免违规扣分`,
      styleTags: [STYLE_CYCLE[i % 9]],
      minutesAgo: 60 * (2 + i * 6),
      topics: ['行业早报', '批发市场'],
    }),
  );

  METHOD_TITLES.forEach((title, i) =>
    pushArticle({
      authorId: i % 3 === 0 ? lm1 : i % 3 === 1 ? lm2 : lect1,
      type: 'methodology',
      board: 'info',
      title,
      summary: `${title} —— 来自一线大店的可复用方法论，含具体数字与执行清单。`,
      content: `## 为什么讲这个\n\n${title}。这不是理论，是我们自己店里跑出来的结论。\n\n## 核心结构\n\n**第一步：先定结构，再选款。**\n把货盘拆成三类：引流款（占 30%，毛利率 25-35%）、利润款（占 40%，毛利率 50-60%）、形象款（占 30%，毛利率 40-50%）。\n\n**第二步：用数据卡住节奏。**\n- 上新周期：每周固定 2 次，雷打不动\n- 测款窗口：单款 7 天，动销率 < 15% 立即下架\n- 返单阈值：连续 3 天日销 > 8 件才返单\n\n**第三步：把人留在店里。**\n进店 3 米内不要堆货，留出通道；模特身位与视线齐平；收银台旁边放搭配单品。\n\n## 常见踩坑\n\n1. 只看爆款不看结构 —— 爆款不赚钱，结构才赚钱\n2. 一次上新 30 个款 —— 注意力被摊薄，等于没上新\n3. 用感觉定价格 —— 必须按成本+目标毛利率倒推\n\n## 可复制的清单\n\n- [ ] 本周盘点货盘结构，算出三类占比\n- [ ] 设一个 7 天测款表，记录动销率\n- [ ] 调整进门动线，清掉 3 米内的堆头`,
      styleTags: [STYLE_CYCLE[i % 9], STYLE_CYCLE[(i + 3) % 9]],
      visibility: i < 4 ? 'public' : i < 8 ? 'elite' : 'shark',
      minutesAgo: 60 * (6 + i * 11),
      topics: ['大店方法论', '组货'],
    }),
  );

  GUIDE_TITLES.forEach((title, i) =>
    pushArticle({
      authorId: adminId,
      type: 'guide',
      board: 'info',
      title,
      summary: `${title.split('：')[0]}：一文讲清规则、坑点与实操话术。`,
      content: `## 市场规则速查\n\n${title}\n\n| 项目 | 规则 |\n|---|---|\n| 起批量 | 单款 5-10 件起 |\n| 付款方式 | 现金/微信，量大可谈 15 天账期 |\n| 退换 | 一般不支持，次品可换 |\n| 拿货时间 | 早上 6:00-11:00 最全 |\n\n## 怎么筛厂家\n\n1. 看有没有自有版房（问「这款是你们自己打的版吗」）\n2. 看吊牌与洗标是否齐全（炒货档通常没有）\n3. 看是否有现货（期货款交期普遍 10-20 天）\n\n## 砍价话术\n\n- 「我一个月大概走 300 件，你给我一个长期价」\n- 「这个款我先拿 30 件试，好的话每周返」\n- 「隔壁档口同样面料报 XX，你这能不能做到」`,
      styleTags: [STYLE_CYCLE[(i + 2) % 9]],
      minutesAgo: 60 * (20 + i * 17),
      topics: ['找厂家攻略', '拿货'],
    }),
  );

  // 游学蒸馏资料（按期数）
  [5, 6, 7].forEach((period, i) => {
    pushArticle({
      authorId: lm1,
      type: 'distillation',
      board: 'info',
      title: `第${period}期游学蒸馏：四季青标杆店 3 天全记录（含踩坑案例）`,
      summary: `第${period}期游学完整蒸馏：现场 PPT、问答记录、踩坑案例与可落地清单。`,
      content: `## 本期游学做了什么\n\n3 天时间，跟着 12 位店主把四季青头部大店从开门到打烊完整走了一遍。\n\n## 最有价值的 5 个结论\n\n1. **上新的本质是筛款，不是上款。** 该店每周上新 40 个款，7 天后只留 12 个。\n2. **店员不是卖货的，是记数据的。** 每人每天记录试穿转化率。\n3. **陈列每 3 天动一次。** 动的是黄金位，不动的是主推结构。\n4. **私域加微靠「利益点」而非「加个微信」。** 加微送搭配方案，通过率 62%。\n5. **清货要提前，不要等季末。** 动销 < 10% 立刻打折，季末清货毛利只剩 12%。\n\n## 现场问答节选\n\n> Q：小店没有数据团队怎么办？\n> A：一张 Excel 就够。记录款号、上架日期、7 天销量、试穿次数四项。\n\n> Q：怎么判断一个款能不能返单？\n> A：连续 3 天日销 > 8 件，且试穿转化率 > 30%。\n\n## 附件\n\n现场 PPT、问答全文、踩坑案例见附件下载。`,
      styleTags: ['韩系', '通勤'],
      visibility: 'elite',
      period,
      minutesAgo: 60 * (72 + i * 240),
      topics: ['游学', `第${period}期`],
    });
  });

  // 货源板块 UGC：拿货实拍 + 穿搭展示 + 款卡片
  const sourceUgc: { title: string; contentType: string; authorId: number; style: string; board: 'source' }[] = [
    { title: '南油踩点实录：这 3 家档口的醋酸衬衫值得长期合作', contentType: 'sourcing_shot', authorId: owner4, style: '休闲', board: 'source' },
    { title: '上新的 5 个款都在这了，法式碎花今年还能打', contentType: 'product_card', authorId: mf1, style: '法式', board: 'source' },
    { title: '韩系通勤一周穿搭：同一件西装换 5 种内搭', contentType: 'outfit', authorId: owner1, style: '韩系', board: 'source' },
    { title: '新中式马甲叠穿实测，客单直接拉到 680', contentType: 'outfit', authorId: owner3, style: '新中式', board: 'source' },
    { title: '濮院毛衫第一批现货到了，色卡实拍', contentType: 'sourcing_shot', authorId: mf2, style: '通勤', board: 'source' },
    { title: '棉 T 基础款怎么做出差异：领口和下摆是关键', contentType: 'product_card', authorId: mf4, style: '休闲', board: 'source' },
  ];
  sourceUgc.forEach((s, i) =>
    pushArticle({
      authorId: s.authorId,
      type: 'ugc',
      board: 'source',
      contentType: s.contentType,
      title: s.title,
      summary: s.title,
      content: `## 实拍说明\n\n${s.title}\n\n本次拿货地点：${['南油', '意法', '濮院', '十三行'][i % 4]}，共看了 ${3 + i} 家档口，最终确定 ${1 + (i % 2)} 家长期合作。\n\n### 为什么选它\n\n- 有自有版房，改版沟通成本低\n- 现货充足，48 小时内能发出\n- 支持小批量试单（20 件起）\n\n### 实测数据\n\n上架 7 天，动销率 ${35 + i * 4}%，返单 ${1 + (i % 3)} 次。`,
      styleTags: [s.style],
      minutesAgo: 60 * (4 + i * 13),
      relatedProducts: productIds.slice(i, i + 4),
      topics: ['拿货实拍', s.style],
      productId: productIds[i % productIds.length],
    }),
  );

  /* ------------------------------ 课程 ------------------------------ */
  const COURSES = [
    { title: '小店也能做的陈列动线（4 讲）', category: '陈列', lecturerId: lect1, price: 199, free: false, lessonCount: 4 },
    { title: '女装账号 0-1 起号实操（8 讲）', category: '短视频', lecturerId: lect2, price: 399, free: false, lessonCount: 8 },
    { title: '组货结构入门：3:4:3 怎么落地', category: '组货', lecturerId: lect1, price: 0, free: true, lessonCount: 3 },
    { title: '拿货谈判 7 个筹码（音频课）', category: '拿货', lecturerId: adminId, price: 99, free: false, lessonCount: 5 },
    { title: '搭配师入门：一衣多穿方法论', category: '搭配', lecturerId: lect1, price: 299, free: false, lessonCount: 6 },
    { title: '直播话术模板库（可直接抄）', category: '直播', lecturerId: lect2, price: 149, free: false, lessonCount: 10 },
  ];
  COURSES.forEach((c, i) => {
    const id = nextId(store, 'courses');
    store.courses.set(id, {
      id,
      lecturerId: c.lecturerId,
      title: c.title,
      category: c.category,
      coverUrl: img(`course-${i + 1}`, 800, 450, c.title),
      duration: `${30 + i * 12}分钟`,
      price: c.price,
      free: c.free,
      lessonCount: c.lessonCount,
      studentCount: 120 + i * 187,
      intro: `${c.title}。${['从 0 讲起，看完就能上手', '含模板与表单，直接套用', '一线案例拆解，不讲空话'][i % 3]}。`,
      lecturer: undefined,
    });
  });

  /* ------------------------------ 拼单 ------------------------------ */
  const GROUP_BUYS = [
    { title: '拼「简派制衣」法式碎花连衣裙，目标 30 人', target: 30, current: 18, style: '法式', market: '意法', days: 3, initiator: owner2 },
    { title: '拼濮院羊毛衫基础款，100 件起批价', target: 20, current: 20, style: '通勤', market: '濮院', days: -1, initiator: owner1 },
    { title: '拼森岛新中式提花马甲，凑 50 件拿批发价', target: 50, current: 12, style: '新中式', market: '南油', days: 6, initiator: owner3 },
    { title: '拼棉时代基础棉 T，凑量压价到 22 元', target: 100, current: 64, style: '休闲', market: '十三行', days: 2, initiator: owner4 },
  ];
  GROUP_BUYS.forEach((g, i) => {
    const id = nextId(store, 'groupBuys');
    store.groupBuys.set(id, {
      id,
      initiatorId: g.initiator,
      productId: productIds[i],
      title: g.title,
      description: `我这边已经确认过工厂，${g.current} 人时可拿到该价格。成团后统一收款、工厂直发，运费按人头平摊。\n\n需要的姐妹扣「1」，我拉你进拼单群。`,
      targetCount: g.target,
      currentCount: g.current,
      status: g.current >= g.target ? 'formed' : 'recruiting',
      styleTag: g.style as never,
      market: g.market,
      deadlineAt: new Date(now + g.days * 86_400_000).toISOString(),
      createdAt: iso(60 * (6 + i * 20)),
      initiator: undefined as never,
      joined: false,
    });
  });

  /* ------------------------------ 订货会 ------------------------------ */
  const FAIRS = [
    { title: '2026 秋冬濮院毛衫订货会', city: '桐乡', venue: '濮院国际羊绒城 3 号馆', theme: '毛织全品类 · 秋冬现货', days: 6, host: mf2 },
    { title: '南油原创设计秋冬选品会', city: '深圳', venue: '南油原创设计中心 B 座', theme: '新中式 / 复古原创', days: 12, host: mf3 },
    { title: '意法女装春季新品发布订货会', city: '广州', venue: '意法服饰城 5 楼中庭', theme: '法式轻奢连衣裙', days: -3, host: mf1 },
    { title: '十三行爆款现货对接会', city: '广州', venue: '十三行商圈会议中心', theme: '基础款现货 · 快反', days: 20, host: mf4 },
  ];
  FAIRS.forEach((f, i) => {
    const id = nextId(store, 'fairs');
    const start = new Date(now + f.days * 86_400_000);
    store.fairs.set(id, {
      id,
      hostId: f.host,
      title: f.title,
      city: f.city,
      venue: f.venue,
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + 2 * 86_400_000).toISOString(),
      theme: f.theme,
      signup: i % 2 === 0 ? '加微信 hzxx2026 报名，备注「订货会」' : '扫码进群报名（二维码见详情）',
      coverUrl: img(`fair-${i + 1}`, 800, 450, f.title),
      styleTags: [STYLE_CYCLE[i % 9]] as never,
      signupCount: 40 + i * 63,
      signedUp: false,
      host: undefined as never,
    });
  });

  /* ------------------------------ 评论 ------------------------------ */
  const COMMENT_TEXTS = [
    '这个结构表太有用了，我这周就按 3:4:3 重新排一遍货盘。',
    '请问引流款的毛利率压到 25% 会不会太低？我这边商场扣点高。',
    '已经在用了，动销率确实上来了，感谢分享。',
    '想看更多关于清货节奏的内容，季末压货太痛苦了。',
    '这个款的起订量能再低点吗？新店不敢压太多。',
    '面料是什么成分？上一批有起球的情况。',
    '已加微信，老板回复很快，样品当天就发了。',
    '实拍图很真实，比那些P过的好多了。',
  ];
  const commentIds: number[] = [];
  articleIds.slice(0, 22).forEach((aid, i) => {
    const count = 1 + (i % 3);
    for (let k = 0; k < count; k++) {
      const id = nextId(store, 'comments');
      commentIds.push(id);
      const author = userIds[(i + k + 2) % userIds.length];
      store.comments.set(id, {
        id,
        userId: author,
        targetType: 'article',
        targetId: aid,
        content: COMMENT_TEXTS[(i + k) % COMMENT_TEXTS.length],
        images: [],
        likeCount: Math.round(rand() * 40),
        replyCount: 0,
        status: 'approved',
        createdAt: iso(60 * (1 + i * 2 + k)),
        user: undefined as never,
      });
    }
  });
  // 两条二级回复
  articleIds.slice(0, 4).forEach((aid, i) => {
    const parent = commentIds[i];
    if (!parent) return;
    const id = nextId(store, 'comments');
    store.comments.set(id, {
      id,
      userId: adminId,
      targetType: 'comment',
      targetId: parent,
      parentId: parent,
      content: ['好问题，毛利率要看你的固定成本占比，商场店建议调到 30% 以上。', '这条我补充一下：清货提前 2 周，毛利能多留住 8 个点。'][i % 2],
      images: [],
      likeCount: 6 + i,
      replyCount: 0,
      status: 'approved',
      createdAt: iso(60 * (1 + i)),
      user: undefined as never,
    });
    const p = store.comments.get(parent)!;
    p.replyCount = (p.replyCount ?? 0) + 1;
  });

  /* ------------------------------ 点赞 / 收藏 / 关注 ------------------------------ */
  for (let i = 0; i < 120; i++) {
    const id = nextId(store, 'likes');
    const uid = userIds[Math.floor(rand() * userIds.length)];
    const targetType = rand() > 0.35 ? 'article' : 'product';
    const targetId =
      targetType === 'article' ? articleIds[Math.floor(rand() * articleIds.length)] : productIds[Math.floor(rand() * productIds.length)];
    store.likes.set(id, { id, userId: uid, targetType: targetType as never, targetId, createdAt: iso(Math.round(rand() * 5000)) });
  }
  for (let i = 0; i < 60; i++) {
    const id = nextId(store, 'collects');
    const uid = userIds[Math.floor(rand() * userIds.length)];
    const targetType = rand() > 0.5 ? 'article' : 'product';
    const targetId =
      targetType === 'article' ? articleIds[Math.floor(rand() * articleIds.length)] : productIds[Math.floor(rand() * productIds.length)];
    store.collects.set(id, {
      id,
      userId: uid,
      targetType: targetType as never,
      targetId,
      folderName: ['默认收藏夹', '要拿的款', '方法论', '待学课程'][Math.floor(rand() * 4)],
      createdAt: iso(Math.round(rand() * 6000)),
    });
  }
  for (let i = 0; i < 90; i++) {
    const id = nextId(store, 'follows');
    const followerId = userIds[Math.floor(rand() * userIds.length)];
    const followingId = userIds[Math.floor(rand() * userIds.length)];
    if (followerId === followingId) continue;
    store.follows.set(id, { id, followerId, followingId, createdAt: iso(Math.round(rand() * 8000)) });
  }

  /* ------------------------------ 加微记录 ------------------------------ */
  const SOURCES = ['product_detail', 'article_bottom', 'search', 'feed_card', 'groupbuy'];
  for (let i = 0; i < 48; i++) {
    const id = nextId(store, 'contactLogs');
    const owner = [owner1, owner2, owner3, owner4, owner5][Math.floor(rand() * 5)];
    const mf = MF_IDS[Math.floor(rand() * MF_IDS.length)];
    store.contactLogs.set(id, {
      id,
      shopOwnerId: owner,
      manufacturerId: mf,
      productId: productIds[Math.floor(rand() * productIds.length)],
      source: SOURCES[Math.floor(rand() * SOURCES.length)],
      contactedAt: iso(Math.round(rand() * 20_000)),
      followUpStatus: (['pending', 'contacted', 'converted', 'converted', 'invalid'] as const)[Math.floor(rand() * 5)],
    });
  }
  // 保证 mf1 今天有数据，便于看板演示
  for (let i = 0; i < 6; i++) {
    const id = nextId(store, 'contactLogs');
    store.contactLogs.set(id, {
      id,
      shopOwnerId: [owner1, owner2, owner3, owner4, owner5][i % 5],
      manufacturerId: mf1,
      productId: productIds[i],
      source: SOURCES[i % SOURCES.length],
      contactedAt: iso(30 + i * 40),
      followUpStatus: i < 2 ? 'converted' : 'contacted',
    });
  }

  /* ------------------------------ 会话与消息 ------------------------------ */
  const CONVOS: { a: number; b: number; msgs: { from: number; text: string; minsAgo: number }[] }[] = [
    {
      a: owner1,
      b: mf1,
      msgs: [
        { from: owner1, text: '你好，看到你们那款法式碎花连衣裙，起订量能到 20 件吗？', minsAgo: 180 },
        { from: mf1, text: '可以的，20 件起我们也能做，价格上浮 3 元一件。', minsAgo: 150 },
        { from: owner1, text: '行，我先拿 30 件试一下，麻烦给个版房确认单。', minsAgo: 120 },
        { from: mf1, text: '好的，稍后发你，另外这款还有同面料的衬衫款，要不要一起看下？', minsAgo: 40 },
      ],
    },
    {
      a: owner3,
      b: mf3,
      msgs: [
        { from: owner3, text: '新中式提花马甲还有现货吗？我想这周补 50 件。', minsAgo: 300 },
        { from: mf3, text: '现货有 200 件，颜色齐全，今天下单明天发。', minsAgo: 280 },
      ],
    },
    {
      a: owner2,
      b: mf2,
      msgs: [
        { from: owner2, text: '濮院的羊毛衫什么时候能上新款？', minsAgo: 600 },
        { from: mf2, text: '下周一到第一批，届时发你图册。', minsAgo: 580 },
      ],
    },
  ];
  const conversationIds: number[] = [];
  CONVOS.forEach((c) => {
    const id = nextId(store, 'conversations');
    conversationIds.push(id);
    const sorted = [c.a, c.b].sort((x, y) => x - y);
    const last = c.msgs[c.msgs.length - 1];
    const unread = c.a === owner1 || c.a === owner3 ? c.msgs.filter((m) => m.from !== c.a).length : 0;
    store.conversations.set(id, {
      id,
      userAId: sorted[0],
      userBId: sorted[1],
      unreadA: sorted[0] === c.a ? unread : 0,
      unreadB: sorted[1] === c.a ? unread : 0,
      unreadCount: unread,
      peer: undefined as never,
      lastMessage: last.text,
      lastMessageAt: iso(last.minsAgo),
    });
    c.msgs.forEach((m) => {
      const mid = nextId(store, 'messages');
      store.messages.set(mid, {
        id: mid,
        conversationId: id,
        senderId: m.from,
        receiverId: m.from === c.a ? c.b : c.a,
        contentType: 'text',
        content: m.text,
        isRead: m.minsAgo > 100,
        createdAt: iso(m.minsAgo),
      });
    });
  });

  /* ------------------------------ 厂家主动私信 ------------------------------ */
  for (let i = 0; i < 12; i++) {
    const id = nextId(store, 'contactMessages');
    const mf = MF_IDS[Math.floor(rand() * MF_IDS.length)];
    const owner = [owner1, owner2, owner3, owner4, owner5][Math.floor(rand() * 5)];
    store.contactMessages.set(id, {
      id,
      manufacturerId: mf,
      shopOwnerId: owner,
      content: `你好，看你在找${STYLE_CYCLE[i % 9]}风格的款，我们新到了一批，价格带 ${[59, 89, 129, 199][i % 4]} 元左右，要看看图册吗？`,
      productId: productIds[i],
      sentAt: iso(Math.round(rand() * 3000)),
      isRead: rand() > 0.5,
    });
  }

  /* ------------------------------ 接收偏好 ------------------------------ */
  [owner1, owner2, owner3, owner4, owner5].forEach((uid, i) => {
    const id = nextId(store, 'preferences');
    const u = store.users.get(uid)!;
    store.preferences.set(id, {
      id,
      shopOwnerId: uid,
      stylePreferences: u.styleTags,
      priceBandPreferences: [u.priceBand ?? '200-500'],
      dailyLimit: [5, 10, 10, 20, 3][i],
      blacklistManufacturerIds: i === 1 ? [mf4] : [],
      createdAt: u.createdAt,
    });
  });

  /* ------------------------------ 子账号 ------------------------------ */
  const SUBS: { mf: number; role: 'sales' | 'operation' | 'admin'; nickname: string }[] = [
    { mf: mf1, role: 'sales', nickname: '简派·客服小美' },
    { mf: mf1, role: 'operation', nickname: '简派·运营阿杰' },
    { mf: mf3, role: 'admin', nickname: '森岛·主管老周' },
    { mf: mf2, role: 'sales', nickname: '牧云·业务小刘' },
  ];
  SUBS.forEach((s, i) => {
    const uid = nextId(store, 'users');
    store.users.set(uid, {
      id: uid,
      phone: `1390000${2000 + i}`,
      nickname: s.nickname,
      avatarUrl: img(`sub-${i + 1}`, 200, 200),
      role: 'manufacturer',
      certStatus: 'approved',
      companyName: store.users.get(s.mf)?.companyName,
      styleTags: [],
      sourcingCities: [],
      memberLevel: 'manufacturer_free',
      pushEnabled: true,
      createdAt: iso(60 * 24 * 20),
      updatedAt: iso(60 * 24 * 20),
      bio: '厂家子账号',
    });
    const id = nextId(store, 'subAccounts');
    store.subAccounts.set(id, { id, manufacturerId: s.mf, subUserId: uid, role: s.role, createdAt: iso(60 * 24 * 18) });
  });

  /* ------------------------------ 通知 ------------------------------ */
  const NOTIFS: { userId: number; type: string; title: string; body: string; actor?: number; targetId?: number; read: boolean; minsAgo: number }[] = [
    { userId: owner1, type: 'like', title: '有人赞了你的内容', body: '《韩系通勤一周穿搭》收到了新的点赞', actor: owner3, targetId: articleIds[0], read: false, minsAgo: 12 },
    { userId: owner1, type: 'comment', title: '有人评论了你的内容', body: '「这个搭配我抄了，谢谢」', actor: owner2, targetId: articleIds[0], read: false, minsAgo: 35 },
    { userId: owner1, type: 'follow', title: '有人关注了你', body: '郑州·衣瞬间 关注了你', actor: owner2, read: false, minsAgo: 90 },
    { userId: owner1, type: 'message', title: '收到新私信', body: '简派制衣：这款还有同面料的衬衫款…', actor: mf1, read: false, minsAgo: 40 },
    { userId: owner1, type: 'audit', title: '内容审核通过', body: '你的内容已通过审核并发布', targetId: articleIds[0], read: true, minsAgo: 600 },
    { userId: mf1, type: 'contact', title: '有店主加了你的微信', body: '杭州·小满家 通过《法式碎花连衣裙》加了你', actor: owner1, targetId: productIds[0], read: false, minsAgo: 25 },
    { userId: mf1, type: 'contact', title: '有店主加了你的微信', body: '成都·阿May 通过搜索加了你', actor: owner3, targetId: productIds[4], read: false, minsAgo: 150 },
    { userId: mf1, type: 'like', title: '有人赞了你的款', body: '《法式碎花方领连衣裙》收到点赞', actor: owner2, targetId: productIds[0], read: true, minsAgo: 320 },
    { userId: owner3, type: 'reply', title: '有人回复了你', body: '七叔：好问题，毛利率要看你的固定成本占比…', actor: adminId, read: false, minsAgo: 55 },
    { userId: owner3, type: 'mention', title: '有人在内容中提到了你', body: '《新中式马甲叠穿实测》提到了 @成都·阿May', actor: owner2, read: true, minsAgo: 900 },
    { userId: adminId, type: 'system', title: '今日数据日报', body: '新增用户 12 人，内容曝光 3.2 万，加微 46 次', read: true, minsAgo: 240 },
    { userId: owner2, type: 'groupbuy', title: '拼单成团提醒', body: '你参与的「濮院羊毛衫基础款」已满 20 人', targetId: 2, read: false, minsAgo: 70 },
  ];
  NOTIFS.forEach((n) => {
    const id = nextId(store, 'notifications');
    store.notifications.set(id, {
      id,
      userId: n.userId,
      type: n.type as never,
      title: n.title,
      body: n.body,
      actor: n.actor ? ({ id: n.actor } as never) : undefined,
      targetId: n.targetId,
      isRead: n.read,
      createdAt: iso(n.minsAgo),
    });
  });

  /* ------------------------------ 行为埋点（推荐引擎输入） ------------------------------ */
  for (let i = 0; i < 300; i++) {
    const id = nextId(store, 'behaviors');
    const uid = userIds[Math.floor(rand() * userIds.length)];
    const action = (['view', 'view', 'view', 'like', 'collect', 'comment', 'share', 'contact', 'search'] as const)[Math.floor(rand() * 9)];
    const targetId =
      rand() > 0.4 ? articleIds[Math.floor(rand() * articleIds.length)] : productIds[Math.floor(rand() * productIds.length)];
    store.behaviors.set(id, {
      id,
      userId: uid,
      action,
      targetType: rand() > 0.4 ? 'article' : 'product',
      targetId,
      keyword: action === 'search' ? ['法式碎花', '韩系外套', '新中式', '羊毛衫', '醋酸衬衫'][Math.floor(rand() * 5)] : undefined,
      styleTag: STYLE_CYCLE[Math.floor(rand() * STYLE_CYCLE.length)],
      createdAt: iso(Math.round(rand() * 20_000)),
    });
  }

  /* ------------------------------ 组织 / 审计 ------------------------------ */
  [
    { ownerId: mf1, name: '广州简派制衣有限公司', role: 'manufacturer' },
    { ownerId: mf2, name: '桐乡牧云针织有限公司', role: 'manufacturer' },
    { ownerId: mf3, name: '深圳森岛服饰有限公司', role: 'manufacturer' },
    { ownerId: mf4, name: '杭州棉时代服饰有限公司', role: 'manufacturer' },
    { ownerId: owner1, name: '杭州小满服饰（个体工商户）', role: 'shop_owner' },
  ].forEach((o) => {
    const id = nextId(store, 'organizations');
    store.organizations.set(id, { id, ...o, createdAt: iso(60 * 24 * 40) });
  });

  const AUDIT_ROWS: { reviewStatus: string; bizType: string; text: string; result: string; minsAgo: number }[] = [
    { reviewStatus: 'manual_pending', bizType: 'article', text: '清仓处理，A货高仿同款，加微信秒发货', result: 'risky', minsAgo: 15 },
    { reviewStatus: 'auto_pass', bizType: 'article', text: '韩系通勤一周穿搭分享', result: 'pass', minsAgo: 62 },
    { reviewStatus: 'manual_pending', bizType: 'comment', text: '有没有做刷单的，一起', result: 'risky', minsAgo: 88 },
    { reviewStatus: 'auto_reject', bizType: 'comment', text: '博彩推广加我', result: 'block', minsAgo: 140 },
    { reviewStatus: 'auto_pass', bizType: 'product', text: '法式碎花方领连衣裙', result: 'pass', minsAgo: 210 },
    { reviewStatus: 'manual_pass', bizType: 'article', text: '濮院毛衫验收标准分享', result: 'risky', minsAgo: 400 },
    { reviewStatus: 'auto_pass', bizType: 'image', text: '[图片] 款图 3 张', result: 'pass', minsAgo: 26 },
    { reviewStatus: 'manual_pending', bizType: 'image', text: '[图片] 疑似违规水印', result: 'risky', minsAgo: 34 },
  ];
  AUDIT_ROWS.forEach((a) => {
    const id = nextId(store, 'auditLogs');
    store.auditLogs.set(id, {
      id,
      contentType: a.bizType === 'image' ? 'image' : 'text',
      contentId: undefined,
      contentUrl: a.bizType === 'image' ? img(`audit-${id}`, 400, 400) : undefined,
      auditSource: a.result === 'pass' ? 'mock-sec-check' : 'mock-sec-check',
      auditResult: a.result,
      auditDetail: { suggestion: a.result === 'pass' ? 'pass' : 'review', label: a.result === 'block' ? 20001 : 10001 },
      reviewStatus: a.reviewStatus as never,
      bizType: a.bizType,
      bizId: articleIds[(id + 3) % articleIds.length],
      text: a.text,
      createdAt: iso(a.minsAgo),
    });
  });

  syncSequences(store);
}

function contactCountOf(rand: () => number, viewCount: number): number {
  return viewCount * (0.02 + rand() * 0.06);
}
