import type { Store } from './db';
import { nextId, syncSequences } from './db';
import { img } from './images';

/* =========================================================================
 * 演示数据播种（SEED）
 *
 * 目标：让 Demo 一启动就是一个「看起来已经在运营」的平台：
 *   18 个用户（店主 / 厂家 / 地标大店 / 讲师 / 运营 + 厂家子账号）
 *   60 个款、60+ 篇内容（含组局/吐槽/实评三类 UGC）、8 家大店、6 门课程、
 *   拼单、订货会、组局、评论、私信、通知
 *
 * 图片策略：**不使用外链 CDN**。演示图由后端 `/uploads/demo/img.svg` 托管，
 * 按 seed 确定性生成渐变占位图（见 core/images.ts 与 core/placeholder.ts）。
 * 这样离线 / 内网 / CDN 不可达时界面依然完整，不会出现一片灰色空白。
 * 生产环境把 core/images.ts 的 img() 换成 OSS 直链即可。
 * ========================================================================= */

const SEED = 20261005;
const now = Date.now();
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
    // ---- 扩充到 60 款：让店主在列表/筛选里有足够多的样本 ----
    '法式茶歇裙 碎花雪纺 收腰显瘦',
    '韩系西装阔腿裤套装 通勤两件套',
    '新中式盘扣外套 香云纱质感',
    '轻奢羊毛混纺大衣 双面呢',
    '欧美复古牛仔外套 做旧水洗',
    '休闲宽松卫衣 落肩纯棉 情侣款',
    '复古灯芯绒衬衫 秋冬加厚',
    '甜美针织开衫 珍珠扣小外套',
    '通勤衬衫 醋酸垂感 免烫',
    '法式泡泡袖连衣裙 度假风长裙',
    '韩系修身针织衫 高领打底',
    '新中式马面裙 织金提花',
    '轻奢西装外套 收腰垫肩',
    '欧美工装裤 高腰直筒',
    '休闲运动裤 加绒束脚',
    '复古格纹西服 学院风',
    '甜美蕾丝上衣 木耳边',
    '通勤半身裙 A字显瘦',
    '法式方领上衣 荷叶边',
    '韩系阔腿牛仔裤 拖地显高',
    '新中式对襟上衣 真丝提花',
    '轻奢羊绒衫 圆领基础款',
    '欧美风衣 长款过膝',
    '休闲夹克 棒球领',
    '复古印花连衣裙 港风',
    '甜美蝴蝶结衬衫',
    '通勤马甲 西装配件',
    '法式条纹针织衫 海魂风',
    '韩系百褶裙 短款学院',
    '新中式旗袍改良 日常可穿',
    '轻奢羽绒服 短款面包服',
    '欧美皮裙 高腰包臀',
    '休闲连帽卫衣 抓绒加厚',
    '复古丝绒连衣裙 年会礼服',
    '甜美娃娃领衬衫 减龄',
    '通勤风衣 卡其双排扣',
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

    /* ---------------- 真实的批发交易信息 ----------------
     * 店主真正关心的不是「价格带 199-219」，而是：
     *   拿货价（单件起拿）→ 起提量价（阶梯）→ 可否拼单 → 档口形态 → 拿货地
     *
     * 价格必须落在**女装批发市场的真实区间**（工厂出货价）：
     *   T 恤/背心 十几到三十几，衬衫/卫衣 三十到六十几，连衣裙 五十到九十几，
     *   西装/风衣 八十几到一百五，羊毛大衣/羽绒 两百到四百。
     * 早期版本按 22~358 均匀取档位，出现「西装裤拿货价 ¥172」「衬衫 ¥364」这种
     * 明显不真实的数（店主一眼就会觉得假），所以这里按**品类**定基准价。
     */
    const basePriceOf = (t: string): number => {
      if (/T恤|背心|吊带/.test(t)) return 18;
      if (/卫衣|针织|毛衫|羊绒|开衫/.test(t)) return 42;
      if (/衬衫|上衣|马甲|半身裙|百褶/.test(t)) return 38;
      if (/裤|牛仔|工装|卫裤|短裤/.test(t)) return 48;
      if (/连衣裙|裙|旗袍|马面/.test(t)) return 62;
      if (/西服|西装|风衣|夹克|皮衣|皮裙|外套/.test(t)) return 95;
      if (/大衣|羽绒|双面呢|羊毛/.test(t)) return 215;
      if (/丝巾|配饰/.test(t)) return 15;
      return 55;
    };
    // 同品类内再做 ±12% 浮动，避免所有同品类款价格一样（真实市场也有价差）
    const wholesalePrice = Math.max(12, Math.round(basePriceOf(title) * (0.88 + rand() * 0.24)));
    const moq = [5, 10, 20, 30, 50][idx % 5];
    const step = moq <= 10 ? 15 : moq <= 30 ? 30 : 50;
    const supportsDropship = idx % 3 !== 0;
    const dropshipPrice = supportsDropship ? Math.round(wholesalePrice * 1.45) : undefined;
    const supportsGroupBuy = idx % 4 !== 3;
    /**
     * 拼单成团数必须**小于起提量**才成立：
     * 拼单是「一个人够不到起批量，几个人凑一下」，所以门槛只会更低、不会更高。
     * 早期写成 max(10, moq*2)，出现「50件起订 / 100件成团」这种自相矛盾的展示。
     */
    const groupBuyMinQty = supportsGroupBuy ? Math.max(3, Math.min(10, Math.round(wholesalePrice > 120 ? 10 : moq / 2))) : undefined;
    /**
     * 阶梯价的第一档就是拼单档：比拿货价略高（凑单也要走一遍分拣打包，成本更高），
     * 这样价格阶梯在数学上严格递减，店主不会看到「5件¥17 / 3件¥15」这种倒挂。
     */
    const tierPrices = [
      ...(groupBuyMinQty ? [{ minQty: groupBuyMinQty, price: Math.round(wholesalePrice * 1.08) }] : []),
      { minQty: moq, price: wholesalePrice },
      { minQty: moq + step, price: Math.round(wholesalePrice * 0.94) },
      { minQty: moq + step * 2, price: Math.round(wholesalePrice * 0.88) },
    ];

    /** 档口形态与厂家类型对应：原创设计=工厂+档口，针织厂=纯工厂，南油=有档口，十三行=纯展厅 */
    const stallTypeByMf: Record<number, string> = {
      [mf1]: 'factory_stall',
      [mf2]: 'factory',
      [mf3]: 'stall',
      [mf4]: 'showroom',
    };
    const stallAddressByMf: Record<number, string> = {
      [mf1]: '意法服饰城 5 楼 B12 / 自有版房在番禺',
      [mf2]: '桐乡濮院工厂 3 号车间（可预约看厂）',
      [mf3]: '南油原创设计中心 B 座 2 楼 208',
      [mf4]: '十三行 6 楼 A 区展厅（仅看样）',
    };
    /** 拿货地（产业带）必须与厂家所在地一致 */
    const marketByMf: Record<number, string> = { [mf1]: '意法', [mf2]: '濮院', [mf3]: '南油', [mf4]: '十三行' };

    const capabilityPool: string[][] = [
      ['spot_goods', 'fast_return', 'own_pattern_room'],
      ['futures', 'oem', 'sample_support'],
      ['spot_goods', 'small_batch', 'quality_inspect'],
      ['spot_goods', 'oem', 'fast_return', 'quality_inspect'],
      ['futures', 'own_pattern_room', 'sample_support'],
    ];
    const capabilities = capabilityPool[idx % capabilityPool.length];

    const priceMin = wholesalePrice;
    const priceMax = Math.round(wholesalePrice * 1.18);
    const viewCount = Math.round(320 + rand() * 4200);
    const contactCount = Math.round(viewCount * (0.03 + rand() * 0.12));
    // 款图 3-6 张（用户反馈「照片数量太少了」）
    const imageCount = 3 + (idx % 4);
    const images = Array.from({ length: imageCount }, (_, k) => img(`p-${idx}-${k + 1}`, 600, 800, title));

    store.products.set(id, {
      id,
      manufacturerId: mfId,
      title,
      images,
      priceRange: `${priceMin}-${priceMax}`,
      priceMin,
      moq,
      styleTag: style as never,
      shipFrom: MF_CITY[mfId] ?? CITIES[idx % 4],
      wholesalePrice,
      tierPrices,
      supportsGroupBuy,
      groupBuyMinQty,
      supportsDropship,
      dropshipPrice,
      stallType: stallTypeByMf[mfId] as never,
      stallAddress: stallAddressByMf[mfId],
      capabilities: capabilities as never,
      market: marketByMf[mfId],
      fabric: ['醋酸混纺 68%+涤纶 32%', '棉麻 55%+天丝 45%', '精梳棉 100%', '真丝混纺 30%+粘纤 70%', '天丝 95%+氨纶 5%'][idx % 5],
      sizes: [['S', 'M', 'L', 'XL'], ['均码'], ['M', 'L', 'XL', '2XL'], ['S', 'M', 'L']][idx % 4],
      colorCount: 3 + (idx % 6),
      listedAt: iso(60 * (idx * 9 + 3)),
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

  /* --------------------- 三类新 UGC：槽点 / 拿货实评 / 组局 ---------------------
   * 用户反馈「资讯里就只剩下游学了，用户要能自己发内容、组局、吐槽、评价」，
   * 这三类是首页信息流的必要内容 —— 不能只有平台生产的资料。
   */

  // 1) 行业吐槽（rant）：真实、口语化、带情绪
  const RANTS: { authorId: number; title: string; content: string; style: string; minsAgo: number }[] = [
    {
      authorId: owner4,
      title: '吐槽：档口报的「现货」，到了说要排单 15 天',
      content:
        '上周在南油订了 200 件醋酸衬衫，档口拍着胸脯说现货、第二天就发。\n\n结果第三天告诉我「排单了，15 天」。我的店等着上架，活动都排好了。\n\n**教训**：以后一律要求拍**当天库存视频**，并且写进订单备注。口说无凭。',
      style: '欧美',
      minsAgo: 42,
    },
    {
      authorId: owner2,
      title: '同行恶意压价的都是什么心态',
      content:
        '隔壁新开的店，同款我卖 268，他挂 199。三个月后关门了。\n\n低价不是策略，是没算清楚成本。房租、人工、损耗、退换，全都得算进去。\n\n我们这行**拼的是组货能力和复购**，不是谁更能亏。',
      style: '法式',
      minsAgo: 180,
    },
    {
      authorId: owner5,
      title: '开店半年，被「一件代发」坑了三次',
      content:
        '第一次：代发的款图和实物色差巨大，客户全退了。\n第二次：代发价比我拿货价还贵，白折腾。\n第三次：发货慢，客户直接给差评。\n\n**结论**：新店可以先用代发测款，但只要开始出单，就一定要自己囤货、自己发货。',
      style: '甜美',
      minsAgo: 400,
    },
    {
      authorId: owner1,
      title: '拿货被「炒货档」加价 40%，怎么识别',
      content:
        '问三个问题就能筛掉大部分炒货档：\n\n1. 「这款是你们自己打的版吗？」→ 支支吾吾的多半不是\n2. 「有现货吗？能拍个今天的库存视频吗？」→ 拍不出来的基本是中间商\n3. 「洗标是你们自己的品牌吗？」→ 白标大概率是炒货\n\n我这批被加价 40%，就是因为没问第二句。',
      style: '韩系',
      minsAgo: 900,
    },
  ];
  RANTS.forEach((r) =>
    pushArticle({
      authorId: r.authorId,
      type: 'ugc',
      board: 'info',
      contentType: 'rant',
      title: r.title,
      summary: r.content.slice(0, 40).replace(/\n/g, ' '),
      content: r.content,
      styleTags: [r.style],
      minutesAgo: r.minsAgo,
      topics: ['行业吐槽', '踩坑'],
    }),
  );

  // 2) 拿货实评（review）：带评分与是否愿意复购
  const REVIEWS: {
    authorId: number;
    title: string;
    content: string;
    style: string;
    rating: number;
    rebuy: boolean;
    minsAgo: number;
    productIdx: number;
  }[] = [
    {
      authorId: owner1,
      title: '实评｜法式碎花裙：色差小，但腰围偏大',
      content:
        '拿了 60 件，整体满意。\n\n**好的地方**：面料和样衣一致，没有色差；缝线整齐，没有跳线。\n**问题**：腰围比标注大 2cm，有几个客户反馈偏松。\n\n已经和档口反馈，他们说下一批会调版。整体还是**值得再拿**。',
      style: '法式',
      rating: 4,
      rebuy: true,
      minsAgo: 120,
      productIdx: 0,
    },
    {
      authorId: owner3,
      title: '实评｜濮院毛衫：起球严重，不建议新店上',
      content:
        '拿了 80 件，价格确实便宜，但穿两次就起球。\n\n客户退了三件，我只能自己贴钱换。**不建议新店碰这个料子**，会影响评分。\n\n想做毛衫的话，加 15 块换成抗起球纱线那批，我试过没问题。',
      style: '通勤',
      rating: 2,
      rebuy: false,
      minsAgo: 320,
      productIdx: 5,
    },
    {
      authorId: owner4,
      title: '实评｜南油醋酸衬衫：这个价位算天花板了',
      content:
        '拿货价 68，我卖 199，毛利率 65%。\n\n垂感好、不皱、不易起球，客户复购率高。**已经返单 3 次**。\n\n唯一的问题：颜色偏少，只有 4 个色。希望厂家多出几个。',
      style: '轻奢',
      rating: 5,
      rebuy: true,
      minsAgo: 600,
      productIdx: 3,
    },
  ];
  REVIEWS.forEach((r, i) => {
    const pid = productIds[r.productIdx % productIds.length];
    const id = nextId(store, 'articles');
    articleIds.push(id);
    const viewCount = Math.round(260 + rand() * 2200);
    const commentCount = Math.round(viewCount * 0.014);
    const collectCount = Math.round(viewCount * 0.05);
    const shareCount = Math.round(collectCount * 0.3);
    const likeCount = Math.round(viewCount * 0.07);
    store.articles.set(id, {
      id,
      authorId: r.authorId,
      board: 'info',
      type: 'ugc',
      contentType: 'review',
      title: r.title,
      content: r.content,
      summary: r.content.slice(0, 40).replace(/\n/g, ' '),
      coverUrl: img(`review-${id}`, 800, 600, '拿货实拍'),
      images: [img(`review-${id}-1`, 800, 600, '实拍'), img(`review-${id}-2`, 800, 600, '细节')],
      attachments: [],
      relatedProducts: [pid],
      productId: pid,
      rating: r.rating,
      wouldRebuy: r.rebuy,
      visibility: 'public',
      auditStatus: 'approved',
      styleTags: [r.style] as never,
      topics: ['拿货实评', '真实反馈'],
      viewCount,
      likeCount,
      collectCount,
      commentCount,
      shareCount,
      contactCount: 0,
      cesScore: Math.round((commentCount * 0.35 + collectCount * 0.28 + viewCount * 0.18 + shareCount * 0.12 + likeCount * 0.07) * 100) / 100,
      topped: false,
      deleted: false,
      createdAt: iso(r.minsAgo),
    });
  });

  // 3) 组局（meetup）：参考闪动，必须带时间/地点/集合点/报名方式/报名条件
  const MEETUPS: {
    initiator: number;
    kind: string;
    title: string;
    description: string;
    city: string;
    venue: string;
    gatheringPoint: string;
    startOffsetDays: number;
    startHour: number;
    durationHours: number;
    signupMethod: string;
    signupRequirement: string;
    capacity: number;
    fee: string;
    market: string;
    styleTags: string[];
    targetAudience: string;
    attendees: number[];
    daysAgo: number;
  }[] = [
    {
      initiator: owner1,
      kind: 'sourcing',
      title: '周三早市一起去十三行扫款',
      description:
        '每周三早市是上新最全的时候。我固定去 6 楼和 7 楼，主要看韩系和法式。\n\n新手可以跟着我走，我教你怎么问起批量、怎么砍价、怎么判断是不是炒货档。',
      city: '广州',
      venue: '十三行服装批发商圈',
      gatheringPoint: '十三行 6 楼 B12 档口门口（扶梯右手第一家）',
      startOffsetDays: 2,
      startHour: 7,
      durationHours: 4,
      signupMethod: '站内点击报名，报名后我会私信拉你进当日群',
      signupRequirement: '认证店主即可，能早起。新手优先（每次最多带 3 个新人）',
      capacity: 8,
      fee: 'AA 制，各自拿货各自付；车费自理',
      market: '十三行',
      styleTags: ['韩系', '法式'],
      targetAudience: '刚开店、想学怎么在档口拿货的新手店主',
      attendees: [owner2, owner5],
      daysAgo: 1,
    },
    {
      initiator: owner3,
      kind: 'production',
      title: '凑单一起做新中式提花马甲，50 件起做',
      description:
        '这款马甲工厂要求 50 件起做，我一个人吃不下。\n\n我这边要 20 件，还差 30 件。可以各自选颜色，工厂按色分开做。\n\n面料是提花缎，成本 78 一件，做成后我这边零售价 268。',
      city: '深圳',
      venue: '南油原创设计中心',
      gatheringPoint: '南油 B 座 2 楼 208（森岛档口）',
      startOffsetDays: 4,
      startHour: 14,
      durationHours: 3,
      signupMethod: '站内报名后加微信群，统一收款下单',
      signupRequirement: '需认证店主，单次起订 10 件以上；能接受 15 天工期',
      capacity: 6,
      fee: '按件分摊，每人 10-30 件不等',
      market: '南油',
      styleTags: ['新中式'],
      targetAudience: '做新中式、有稳定客群的店主',
      attendees: [owner1],
      daysAgo: 2,
    },
    {
      initiator: lm1,
      kind: 'study',
      title: '四季青大店游学局：跟店一天看完整流程',
      description:
        '带 5 个人跟我店里一天，从开门理货、陈列调整、接待、到晚上盘数据，全程开放。\n\n重点看三件事：**怎么筛款**、**怎么记数据**、**怎么动陈列**。',
      city: '杭州',
      venue: '四季青服装市场',
      gatheringPoint: '四季青 3 号门集合（门口有红色雨棚）',
      startOffsetDays: 6,
      startHour: 8,
      durationHours: 10,
      signupMethod: '站内报名，我审核通过后发具体行程',
      signupRequirement: '认证店主，有实体店铺；需提前说明自己的店型与客单价',
      capacity: 5,
      fee: '免费（游学卡会员优先）',
      market: '四季青',
      styleTags: ['韩系', '通勤'],
      targetAudience: '单店年销 300-1000 万、想突破瓶颈的店主',
      attendees: [owner1, owner2],
      daysAgo: 3,
    },
    {
      initiator: owner4,
      kind: 'exchange',
      title: '南油档口老板交流局：旺季备货怎么排',
      description:
        '做秋冬的都在纠结备货节奏。这次找几个做南油、十三行的同行坐下来聊聊：\n\n- 你们什么时候开始压秋冬第一批\n- 压多少比例\n- 卖不动怎么清',
      city: '广州',
      venue: '南油商圈茶室',
      gatheringPoint: '南油大厦 1 楼星巴克门口',
      startOffsetDays: 8,
      startHour: 15,
      durationHours: 3,
      signupMethod: '站内报名，满 6 人成局',
      signupRequirement: '有一年以上实体店/档口经验，愿意分享真实数据',
      capacity: 10,
      fee: '场地费 AA，人均 60 左右',
      market: '南油',
      styleTags: ['欧美', '休闲'],
      targetAudience: '年销 500 万以上的实体店主与档口老板',
      attendees: [owner1, owner3, owner5],
      daysAgo: 0,
    },
  ];

  MEETUPS.forEach((m) => {
    const id = nextId(store, 'meetups');
    const start = new Date(now + m.startOffsetDays * 86_400_000);
    start.setHours(m.startHour, 0, 0, 0);
    const end = new Date(start.getTime() + m.durationHours * 3_600_000);
    const cover = img(`meetup-${id}`, 800, 500, m.title);
    store.meetups.set(id, {
      id,
      initiatorId: m.initiator,
      kind: m.kind as never,
      title: m.title,
      description: m.description,
      coverUrl: cover,
      city: m.city,
      venue: m.venue,
      gatheringPoint: m.gatheringPoint,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      signupMethod: m.signupMethod,
      signupRequirement: m.signupRequirement,
      capacity: m.capacity,
      joinedCount: 0,
      fee: m.fee,
      market: m.market,
      styleTags: m.styleTags as never,
      targetAudience: m.targetAudience,
      status: 'recruiting',
      createdAt: iso(60 * 24 * m.daysAgo + 120),
      initiator: undefined as never,
    });
    // 报名记录（含发起人）
    [m.initiator, ...m.attendees].forEach((uid) => {
      const sid = nextId(store, 'meetupSignups');
      store.meetupSignups.set(sid, {
        id: sid,
        meetupId: id,
        userId: uid,
        note: uid === m.initiator ? '发起人' : undefined,
        createdAt: iso(60 * 24 * m.daysAgo + 60),
      });
    });
    // 同步发一条资讯流内容（与 createMeetup 行为一致，这样首页能看到组局）
    const aid = nextId(store, 'articles');
    articleIds.push(aid);
    const kindLabel =
      ({ sourcing: '一起去拿货', production: '一起做货/拼单下单', study: '一起学习交流', exchange: '同业交流局' } as Record<string, string>)[
        m.kind
      ] ?? '组局';
    const viewCount = Math.round(420 + rand() * 2600);
    const commentCount = Math.round(viewCount * 0.016);
    const collectCount = Math.round(viewCount * 0.055);
    const shareCount = Math.round(collectCount * 0.28);
    const likeCount = Math.round(viewCount * 0.075);
    store.articles.set(aid, {
      id: aid,
      authorId: m.initiator,
      board: 'info',
      type: 'ugc',
      contentType: 'meetup',
      title: `${kindLabel}｜${m.title}`,
      summary: `${m.city} · ${m.venue}`,
      content: `${m.description}\n\n**集合点**：${m.gatheringPoint}\n**报名方式**：${m.signupMethod}\n**报名条件**：${m.signupRequirement}`,
      coverUrl: cover,
      images: [cover],
      attachments: [],
      relatedProducts: [],
      visibility: 'public',
      auditStatus: 'approved',
      styleTags: m.styleTags as never,
      topics: ['组局', m.city, kindLabel],
      viewCount,
      likeCount,
      collectCount,
      commentCount,
      shareCount,
      contactCount: 0,
      cesScore: Math.round((commentCount * 0.35 + collectCount * 0.28 + viewCount * 0.18 + shareCount * 0.12 + likeCount * 0.07) * 100) / 100,
      topped: false,
      deleted: false,
      createdAt: iso(60 * 24 * m.daysAgo + 120),
    });
    store.meetups.get(id)!.articleId = aid;
  });

  syncSequences(store);
}

function contactCountOf(rand: () => number, viewCount: number): number {
  return viewCount * (0.02 + rand() * 0.06);
}
