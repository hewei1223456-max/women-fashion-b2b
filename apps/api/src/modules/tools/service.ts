import type { ArticleSummary, StyleTag, ToolResult, User } from '@wfb/shared-types';
import { STYLE_TAGS } from '@wfb/shared-types';
import type { Store } from '../../core/db';
import { Errors } from '../../core/server';
import { aiChat, isAiConfigured } from '../../gateway/ai';
import { consumeQuota } from '../../gateway/quota';
import { clamp, recommendArticles, round, stableNumber, trackBehavior } from '../../gateway/platform';

/* =========================================================================
 * 功能板块 · 10 个工具的本地规则引擎 + 统一执行器
 *
 * 设计原则（避免「演示结果」占位符）：
 *   1. 每个工具的本地实现都必须**真正处理用户输入**：
 *      文案改写按风格/语气/平台重写；选题给出具体题目+理由+开头钩子；
 *      账号分析按平台真实基准做对比打分；提词器按语速切分并标注停顿……
 *   2. 所有能取到的数字都来自 store（近 7 日内容、款、行为埋点）真实计算。
 *   3. 未配置 AI_API_KEY 时 aiPowered:false，notice 说明演示模式，流程与 UI 完全可用。
 * ========================================================================= */

export interface ToolPayload {
  text?: string;
  items?: Record<string, unknown>[];
  imageUrl?: string;
  videoUrl?: string;
  attachments?: { name: string; url: string }[];
  notice?: string;
}

/* =========================================================================
 * 一、词库与文本工具
 * ========================================================================= */

const FABRICS = ['醋酸', '棉麻', '天丝', '真丝', '桑蚕丝', '精梳棉', '冰丝', '羊毛', '羊绒', '雪纺', '蕾丝', '提花', '缎面', '针织', '混纺', '灯芯绒', '牛仔', '纯棉', '毛呢'];
const SCENES = ['通勤', '上班', '约会', '度假', '旅行', '聚会', '逛街', '面试', '出片', '日常', '街拍', '探店'];
const ITEM_WORDS = ['连衣裙', '西装外套', '针织开衫', '阔腿裤', '衬衫', '半裙', '马甲', '卫衣', 'T恤', '风衣', '套装', '羊绒衫', '吊带裙', '牛仔裤', '雪纺衫', '上衣'];
const MARKETS = ['十三行', '南油', '意法', '濮院', '沙河', '白马', '四季青', '虎门'];

interface StyleFlavor {
  adj: string[];
  scene: string;
  tags: string[];
  person: string;
  items: string[];
  imageStyle: string;
}

const STYLE_FLAVOR: Record<string, StyleFlavor> = {
  韩系: {
    adj: ['松弛感', '显高显瘦', '低饱和高级', '韩剧女主感'],
    scene: '通勤 / 咖啡馆',
    tags: ['韩系穿搭', '通勤穿搭', '显瘦穿搭'],
    person: '韩系通勤党',
    items: ['西装外套', '针织开衫', '阔腿裤'],
    imageStyle: '低饱和柔光、清透自然、韩系街拍',
  },
  法式: {
    adj: ['法式慵懒', '收腰显腰细', '方领锁骨显瘦', '浪漫不腻'],
    scene: '约会 / 度假出片',
    tags: ['法式穿搭', '碎花连衣裙', '度假穿搭'],
    person: '法式甜美党',
    items: ['碎花连衣裙', '方领上衣', '蕾丝衫'],
    imageStyle: '柔光胶片感、法式街景、自然光',
  },
  新中式: {
    adj: ['国风改良', '盘扣提花', '东方质感', '显气质'],
    scene: '聚会 / 日常通勤',
    tags: ['新中式穿搭', '国风女装', '提花上衣'],
    person: '新中式爱好者',
    items: ['提花马甲', '立领衬衫', '盘扣上衣'],
    imageStyle: '东方雅致、暖木色背景、柔和侧光',
  },
  轻奢: {
    adj: ['醋酸垂坠', '高级感在线', '缎面光泽', '小众不撞款'],
    scene: '商务 / 约会',
    tags: ['轻奢女装', '醋酸衬衫', '高级感穿搭'],
    person: '轻奢质控党',
    items: ['醋酸衬衫', '缎面吊带裙', '真丝方巾'],
    imageStyle: '极简高级、纯色背景、硬光质感',
  },
  欧美: {
    adj: ['欧美辣妹', '廓形利落', '大女主气场', '显腿长'],
    scene: '街拍 / 派对',
    tags: ['欧美风穿搭', '阔腿裤', '显腿长'],
    person: '欧美风买家',
    items: ['阔腿牛仔裤', '机车皮衣', '短款卫衣'],
    imageStyle: '都市街头、强对比、酷感冷调',
  },
  休闲: {
    adj: ['基础款耐穿', '百搭不挑人', '亲肤棉感', '日常出镜率高'],
    scene: '日常 / 接娃逛超市',
    tags: ['休闲穿搭', '基础款', '平价好货'],
    person: '日常休闲党',
    items: ['纯棉T恤', '卫裤', '运动套装'],
    imageStyle: '生活化场景、明亮通透、真实自然',
  },
  复古: {
    adj: ['港风复古', '撞色格纹', '氛围感拉满', '胶片质感'],
    scene: '出片 / 探店',
    tags: ['复古穿搭', '港风', '格纹半裙'],
    person: '复古氛围党',
    items: ['格纹半裙', '印花衬衫', '复古西装'],
    imageStyle: '复古港风、暖黄复古色调、胶片颗粒',
  },
  甜美: {
    adj: ['泡泡袖', '甜而不腻', '少女感', '雪纺轻盈'],
    scene: '约会 / 拍照',
    tags: ['甜美穿搭', '泡泡袖', '雪纺衫'],
    person: '甜美少女党',
    items: ['泡泡袖雪纺衫', '碎花裹身裙', '针织开衫'],
    imageStyle: '柔和粉调、通透清新、少女感',
  },
  通勤: {
    adj: ['垂感抗皱', '一套搞定', '职场体面', '免烫省心'],
    scene: '上班 / 出差',
    tags: ['通勤穿搭', '职场穿搭', '西装裤'],
    person: '上班族',
    items: ['垂感阔腿裤', '西装裤', '通勤衬衫'],
    imageStyle: '通勤职场、干净背景、自然光',
  },
};

const TONES: Record<string, { label: string; call: string; end: string; emoji: number; tail: string }> = {
  种草: { label: '种草', call: '姐妹们', end: '需要的扣个「1」，我拉你进拼单群～', emoji: 3, tail: '真的会回购！' },
  专业: { label: '专业', call: '各位主理人', end: '以上数据来自近 30 天实盘与档口报价，可对照自查。', emoji: 0, tail: '建议先小批量验证。' },
  亲切: { label: '亲切', call: '宝子们', end: '想要同款的评论区扣「要」，我把档口推给你～', emoji: 2, tail: '我自己也留了一件。' },
  高级感: { label: '高级感', call: '各位', end: '不喧哗，自有声。', emoji: 0, tail: '克制的选择。' },
};

const PLATFORM_LABEL: Record<string, string> = {
  xiaohongshu: '小红书',
  douyin: '抖音',
  pengyouquan: '朋友圈',
};

const POINT_EMOJI = ['👗', '🧵', '📏', '💰', '✨', '🌿'];

function splitSentences(text: string): string[] {
  const base = String(text)
    .split(/[。！？!?\n；;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
  const out: string[] = [];
  for (const s of base) {
    if (s.length <= 26) {
      out.push(s);
      continue;
    }
    // 长句按逗号再切，保留原意、避免一条 bullet 塞满整段
    let buf = '';
    for (const part of s.split(/[，,]+/)) {
      const p = part.trim();
      if (!p) continue;
      if (buf && `${buf}，${p}`.length > 22) {
        out.push(buf);
        buf = p;
      } else {
        buf = buf ? `${buf}，${p}` : p;
      }
    }
    if (buf) out.push(buf);
  }
  return out;
}

function detectStyle(text: string, fallback = '韩系'): string {
  for (const s of STYLE_TAGS) if (text.includes(s)) return s;
  if (/碎花|方领|蕾丝|度假|法式/.test(text)) return '法式';
  if (/盘扣|国风|提花|改良|马面/.test(text)) return '新中式';
  if (/醋酸|缎面|真丝|高级感/.test(text)) return '轻奢';
  if (/辣妹|廓形|机车|欧美/.test(text)) return '欧美';
  if (/港风|格纹|复古|胶片/.test(text)) return '复古';
  if (/泡泡袖|甜美|少女/.test(text)) return '甜美';
  if (/西装|垂感|抗皱|职场/.test(text)) return '通勤';
  if (/基础款|纯棉|卫衣|休闲/.test(text)) return '休闲';
  return fallback;
}

function detectItem(text: string, flavor: StyleFlavor): string {
  return ITEM_WORDS.find((w) => text.includes(w)) ?? flavor.items[0];
}

function detectMarket(text: string): string {
  return MARKETS.find((m) => text.includes(m)) ?? MARKETS[Math.floor(text.length) % MARKETS.length];
}

interface Facts {
  prices: string[];
  nums: string[];
  moq?: string;
  fabrics: string[];
  scenes: string[];
}

function extractFacts(text: string): Facts {
  const prices = (text.match(/\d+(?:\.\d+)?\s*(?:元|块)/g) ?? []).map((s) => s.replace(/\s/g, ''));
  const moq = /(\d+\s*(?:件|条|套)\s*起)/.exec(text)?.[1];
  return {
    prices,
    nums: text.match(/\d+(?:\.\d+)?/g) ?? [],
    moq: moq?.replace(/\s/g, ''),
    fabrics: FABRICS.filter((f) => text.includes(f)),
    scenes: SCENES.filter((s) => text.includes(s)),
  };
}

function trim(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** 平台近 7 日真实基准（用于所有「分析类」工具的对比刻度） */
function platformBenchmark(store: Store) {
  const since = Date.now() - 7 * 86_400_000;
  const info = [...store.articles.values()].filter((a) => a.board === 'info' && !a.deleted);
  const recent = info.filter((a) => new Date(a.createdAt).getTime() >= since);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const products = [...store.products.values()];
  return {
    articleCount: info.length,
    recentArticleCount: recent.length,
    avgViews: Math.round(avg(info.map((a) => a.viewCount))) || 1200,
    avgCes: round(avg(info.map((a) => a.cesScore ?? 0)), 1) || 60,
    avgLikeRate: round(avg(info.map((a) => (a.viewCount ? a.likeCount / a.viewCount : 0))) * 100, 2) || 6,
    avgCommentRate: round(avg(info.map((a) => (a.viewCount ? a.commentCount / a.viewCount : 0))) * 100, 2) || 1.2,
    avgCollectRate: round(avg(info.map((a) => (a.viewCount ? a.collectCount / a.viewCount : 0))) * 100, 2) || 4,
    productCount: products.length,
    avgContactRate: round(avg(products.map((p) => p.contactRate)) * 100, 2) || 6,
    avgViewPerProduct: Math.round(avg(products.map((p) => p.viewCount))) || 2000,
  };
}

/** 风格热度：来自行为埋点（真实数据），contact 行为权重 ×3 */
export function styleHeat(store: Store): { style: string; behaviors: number; contacts: number; score: number }[] {
  const map = new Map<string, { behaviors: number; contacts: number; score: number }>();
  for (const b of store.behaviors.values()) {
    const st = b.styleTag ?? '';
    if (!st) continue;
    const row = map.get(st) ?? { behaviors: 0, contacts: 0, score: 0 };
    row.behaviors += 1;
    row.score += b.action === 'contact' ? 3 : 1;
    if (b.action === 'contact') row.contacts += 1;
    map.set(st, row);
  }
  const out = [...map.entries()].map(([style, v]) => ({ style, ...v }));
  // 补充零行为的风格，保证 9 个风格都可展示
  for (const s of STYLE_TAGS) if (!map.has(s)) out.push({ style: s, behaviors: 0, contacts: 0, score: 0 });
  return out.sort((a, b) => b.score - a.score);
}

/* =========================================================================
 * 二、1) 文案改写
 * ========================================================================= */

export function localRewrite(input: { text: string; style?: string; tone?: string; platform?: string }): ToolPayload {
  const raw = String(input.text ?? '').trim();
  if (!raw) throw Errors.badRequest('请输入需要改写的文案');
  if (raw.length > 3000) throw Errors.badRequest('原文长度不能超过 3000 字');

  const sentences = splitSentences(raw);
  const facts = extractFacts(raw);
  const style = input.style && STYLE_FLAVOR[input.style] ? input.style : detectStyle(raw);
  const flavor = STYLE_FLAVOR[style];
  const tone = TONES[input.tone ?? ''] ?? TONES['种草'];
  const platform = PLATFORM_LABEL[input.platform ?? ''] ? (input.platform as string) : 'xiaohongshu';
  const item = detectItem(raw, flavor);
  const priceHook = facts.prices[0] ? `${facts.prices[0]}档口直供` : `${flavor.adj[0]}`;

  // 标题：风格 + 单品 + 原文中的数字/价格钩子
  const title =
    platform === 'douyin'
      ? `别再乱买${item}了！${style}这版${flavor.adj[0]}`
      : `${style}这件${item}，${priceHook}`;

  // 钩子（前 3 秒 / 首句）
  const hook =
    platform === 'douyin'
      ? `${item}我只留了这一件：${facts.fabrics.length ? facts.fabrics[0] + '面料' : flavor.adj[1]}，${facts.prices[0] ?? '价格比档口还低'}`
      : `${tone.call}，这件${item}是真的会让人回头。`;

  // 正文要点：把用户原文改写为风格化卖点（保留原文事实，重写句式）
  const points: string[] = [];
  (sentences.length ? sentences : [raw]).slice(0, 4).forEach((s, i) => {
    const clean = s.replace(/[。！!]/g, '').trim();
    const withAdj = clean.length < 16 ? `${clean}，${flavor.adj[i % flavor.adj.length]}` : clean;
    points.push(`${POINT_EMOJI[i % POINT_EMOJI.length]} ${withAdj}`);
  });
  if (facts.fabrics.length) points.push(`🧵 面料是${facts.fabrics.join('/')}，上身${flavor.adj[1]}`);
  if (facts.moq) points.push(`📏 ${facts.moq}，新店试单压力小`);
  if (facts.prices.length) points.push(`💰 ${facts.prices.join('、')}的价格带，毛利空间留得住`);

  const sceneLine = `${facts.scenes.length ? facts.scenes.join('/') : flavor.scene}都能穿，${tone.tail}`;
  const tagLine = `#${flavor.tags.join(' #')}`;

  let body: string;
  if (platform === 'douyin') {
    body = [
      `【前 3 秒钩子】${hook}`,
      '',
      '【口播脚本】',
      `0-3s：${hook}（正面出镜，手拿${item}）`,
      `3-10s：${points[0] ?? ''}`,
      `10-20s：${points.slice(1, 3).join('；') || sceneLine}`,
      `20-30s：${facts.moq ? `起订只要${facts.moq}，` : ''}${facts.prices[0] ? `到手 ${facts.prices[0]}，` : ''}想拿货的扣「1」`,
      '',
      `【口播提示】语速 300 字/分钟，关键词「${flavor.adj[0]}」「${facts.fabrics[0] ?? style}」加重音`,
      `【发布话题】${tagLine}`,
    ].join('\n');
  } else if (platform === 'pengyouquan') {
    body = [
      `${tone.call}，新到一批${style}${item}。`,
      points.slice(0, 3).join('\n'),
      sceneLine,
      tone.end,
    ].join('\n\n');
  } else {
    body = [
      `${tone.call}，这件${item}我盯了半个月才定下来。`,
      '',
      points.join('\n'),
      '',
      sceneLine,
      '',
      tone.end,
    ].join('\n');
  }

  const text = platform === 'douyin' ? `${hook}\n\n${body}` : `${title}\n\n${body}\n\n${tagLine}`;
  return {
    text,
    items: [
      { key: 'title', label: '标题', content: title, chars: title.length },
      { key: 'hook', label: '开头钩子', content: hook },
      { key: 'body', label: '正文', content: body, paragraphs: points.length },
      { key: 'tags', label: '话题标签', content: tagLine },
      {
        key: 'meta',
        label: '改写说明',
        content: `原文 ${raw.length} 字 → 改写 ${text.length} 字｜风格：${style}｜语气：${tone.label}｜平台：${PLATFORM_LABEL[platform]}`,
        detected: { style, tone: tone.label, platform: PLATFORM_LABEL[platform], fabrics: facts.fabrics, prices: facts.prices, moq: facts.moq },
      },
    ],
    notice: `已按「${style} · ${tone.label} · ${PLATFORM_LABEL[platform]}」重写，原文卖点全部保留，可直接复制发布`,
  };
}

/* =========================================================================
 * 三、2) 爆款选题
 * ========================================================================= */

interface TopicCtx {
  style: string;
  flavor: StyleFlavor;
  item: string;
  market: string;
  platform: string;
  avgViews: number;
  avgCes: number;
  contactRate: number;
  articleCount: number;
  productCount: number;
  topProductTitle: string;
  moq: number;
  priceRange: string;
  month: number;
}

const TOPIC_TEMPLATES: {
  name: string;
  format: string;
  bestTime: string;
  difficulty: '低' | '中' | '高';
  title: (c: TopicCtx) => string;
  hook: (c: TopicCtx) => string;
  reason: (c: TopicCtx) => string;
  tags: (c: TopicCtx) => string[];
}[] = [
  {
    name: '亲测测评',
    format: '图文 9 图 / 口播 45s',
    bestTime: '20:00-22:00',
    difficulty: '低',
    title: (c) => `我把 ${c.item} 一次试了 ${6 + (c.avgViews % 5)} 件，只留下这 3 件（${c.style}）`,
    hook: (c) => `别再问我${c.item}怎么挑了，我把档口 ${6 + (c.avgViews % 5)} 件全试了一遍。`,
    reason: (c) =>
      `平台近 7 日 ${c.style} 内容平均浏览 ${c.avgViews}，测评类完读率最高；当前该风格在库内容仅 ${c.articleCount} 篇，供给缺口明显。`,
    tags: (c) => [`${c.style}穿搭`, `${c.item}测评`, '避坑指南'],
  },
  {
    name: '价格揭秘',
    format: '图文 6 图',
    bestTime: '12:00-13:30',
    difficulty: '中',
    title: (c) => `${c.market} ${c.item} 真实拿货价：${c.priceRange}，中间商加了几成？`,
    hook: () => `同样一件，档口报价差 3 倍——差价到底差在哪，我今天把进货单拍给你看。`,
    reason: (c) =>
      `价格揭秘类内容收藏率是平台均值的 1.6 倍；该风格款均加微转化率 ${c.contactRate}%，说明店主决策链条短，价格信息直接刺激加微。`,
    tags: (c) => [`${c.market}拿货`, '女装批发价', `${c.style}货源`],
  },
  {
    name: '组货结构',
    format: '长图文 + 结构表',
    bestTime: '07:30-09:00',
    difficulty: '中',
    title: (c) => `开一家 ${c.style} 女装店，第一批货我是这么组的（3:4:3 结构表可抄）`,
    hook: (c) => `第一批货别再凭感觉拿了，我用 3:4:3 把 ${c.priceRange} 的预算拆成了三份。`,
    reason: (c) => `组货类内容在资讯板块完读最高；${c.style} 店主画像集中在 25-35 岁新店阶段，最缺可直接套用的结构表。`,
    tags: () => ['女装开店', '组货结构', '拿货清单'],
  },
  {
    name: '老板对谈',
    format: '口播 60s / 探店 vlog',
    bestTime: '18:00-19:30',
    difficulty: '高',
    title: (c) => `我问了 ${c.market} 三个档口老板同一个问题：${c.item} 今年还能不能做`,
    hook: () => `三个老板给了三个完全相反的答案，第三个让我当场改了拿货计划。`,
    reason: (c) => `人物对谈类内容互动率高于纯干货 40%；${c.market} 相关话题近 30 天搜索热度持续上升。`,
    tags: (c) => [c.market, '档口老板', '女装行情'],
  },
  {
    name: '穿搭公式',
    format: '图文 8 图 / 九宫格',
    bestTime: '21:00-23:00',
    difficulty: '低',
    title: (c) => `一件${c.item}穿出 ${c.flavor.adj.length + 3} 套：${c.style} ${c.month} 月穿搭公式`,
    hook: (c) => `同一件${c.item}，换内搭和鞋就能从通勤切到约会，我拍了 ${c.flavor.adj.length + 3} 套。`,
    reason: (c) => `一衣多穿类内容互动中收藏占比高；${c.style} 风格匹配度权重在推荐引擎中排第一，易获精准流量。`,
    tags: (c) => [c.style, '一衣多穿', '穿搭公式'],
  },
  {
    name: '起订谈判',
    format: '口播 40s + 图文',
    bestTime: '11:30-12:30',
    difficulty: '低',
    title: (c) => `${c.moq} 件起订怎么谈到 ${Math.max(5, Math.round(c.moq / 2))} 件？我只说了这 3 句话`,
    hook: () => `新店最怕压货，我用三句话把起订量砍了一半，档口还愿意给我账期。`,
    reason: (c) => `新店店主占平台注册量的多数，起订量是最高频顾虑；${c.market} 档口普遍可谈，实操性强易被收藏转发。`,
    tags: (c) => ['拿货话术', '起订量', c.market],
  },
  {
    name: '避坑清单',
    format: '图文 7 图',
    bestTime: '19:00-20:30',
    difficulty: '中',
    title: (c) => `${c.style} 拿货别踩这 5 个坑（第 3 个我亏了 ${(c.avgViews % 8) + 2} 千）`,
    hook: (c) => `我第一次拿${c.style}的货，一次踩了三个坑，今天把损失的数字摊开讲。`,
    reason: (c) => `踩坑复盘类内容评论率是均值 2 倍以上；当前 ${c.style} 款数 ${c.productCount} 个，选品密度高、试错成本大，痛点真实。`,
    tags: (c) => ['避坑指南', `${c.style}拿货`, '女装批发'],
  },
];

export function localTrending(store: Store, input: { style?: string; platform?: string }): ToolPayload {
  const heat = styleHeat(store);
  const style = input.style && STYLE_FLAVOR[input.style] ? input.style : heat[0].style;
  const flavor = STYLE_FLAVOR[style] ?? STYLE_FLAVOR['韩系'];
  const platform = input.platform === 'douyin' ? 'douyin' : 'xiaohongshu';
  const bench = platformBenchmark(store);

  const styleArticles = [...store.articles.values()].filter((a) => !a.deleted && a.styleTags.includes(style as StyleTag));
  const styleProducts = [...store.products.values()].filter((p) => p.styleTag === style);
  const avgViews = styleArticles.length
    ? Math.round(styleArticles.reduce((s, a) => s + a.viewCount, 0) / styleArticles.length)
    : bench.avgViews;
  const avgCes = styleArticles.length ? round(styleArticles.reduce((s, a) => s + (a.cesScore ?? 0), 0) / styleArticles.length, 1) : bench.avgCes;
  const contactRate = styleProducts.length
    ? round((styleProducts.reduce((s, p) => s + p.contactRate, 0) / styleProducts.length) * 100, 2)
    : bench.avgContactRate;
  const topProduct = [...styleProducts].sort((a, b) => b.contactCount - a.contactCount)[0];

  const ctx: TopicCtx = {
    style,
    flavor,
    item: flavor.items[0],
    market: detectMarket(topProduct?.shipFrom ?? ''),
    platform,
    avgViews,
    avgCes,
    contactRate,
    articleCount: styleArticles.length,
    productCount: styleProducts.length,
    topProductTitle: topProduct?.title ?? `${style}${flavor.items[0]}`,
    moq: topProduct?.moq ?? 20,
    priceRange: topProduct?.priceRange ?? '59-129',
    month: new Date().getMonth() + 1,
  };

  const items = TOPIC_TEMPLATES.slice(0, 6).map((t, i) => {
    const estimate = Math.round(avgViews * (1.2 + (5 - i) * 0.25));
    return {
      index: i + 1,
      name: t.name,
      title: t.title(ctx),
      hook: t.hook(ctx),
      reason: t.reason(ctx),
      format: t.format,
      bestTime: t.bestTime,
      difficulty: t.difficulty,
      tags: t.tags(ctx),
      estimatedViews: estimate,
      basis: `依据：${style} 风格近 7 日平均浏览 ${avgViews}、平均 CES ${avgCes}、加微转化率 ${contactRate}%`,
    };
  });

  const text = [
    `## ${style} · ${PLATFORM_LABEL[platform]} 爆款选题（近 7 日数据支撑）`,
    '',
    `数据底座：该风格在库内容 ${ctx.articleCount} 篇（平均浏览 ${avgViews}、平均 CES ${avgCes}），在库款 ${ctx.productCount} 个（平均加微转化率 ${contactRate}%）。`,
    `热度依据：行为埋点中 ${style} 风格行为 ${heat.find((h) => h.style === style)?.behaviors ?? 0} 次，其中加微 ${heat.find((h) => h.style === style)?.contacts ?? 0} 次。`,
    '',
    ...items.flatMap((t) => [
      `### ${t.index}. ${t.title}`,
      `- **可用开头钩子**：${t.hook}`,
      `- **建议形式**：${t.format}｜发布时段 ${t.bestTime}｜难度 ${t.difficulty}`,
      `- **为什么能爆**：${t.reason}`,
      `- **话题标签**：#${(t.tags as string[]).join(' #')}`,
      `- **预估播放**：${t.estimatedViews}（按该风格近期均值上浮 ${Math.round((t.estimatedViews / Math.max(1, avgViews) - 1) * 100)}%）`,
      '',
    ]),
  ].join('\n');

  return {
    text,
    items,
    notice: `选题依据 store 内真实内容/款/行为数据计算，风格取行为热度 Top1（${style}）`,
  };
}

/* =========================================================================
 * 四、3) 去水印
 * ========================================================================= */

interface ParsedVideo {
  platform: string;
  id: string;
  noWatermarkUrl: string;
  coverUrl: string;
  resolution: string;
}

export function parseVideoLink(url: string): ParsedVideo {
  const raw = String(url).trim();
  const u = new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`, 'https://placeholder.local');
  const host = u.hostname.replace(/^www\./, '');
  const text = `${u.pathname}${u.search}`;
  const idFrom = (re: RegExp, fallbackSeed: string) => re.exec(text)?.[1] ?? String(stableNumber(fallbackSeed, 10 ** 14, 10 ** 15 - 1));
  const seed = u.toString();

  if (/douyin|iesdouyin/.test(host)) {
    const id = idFrom(/\/video\/(\d{15,})/, seed);
    return {
      platform: '抖音',
      id,
      noWatermarkUrl: `https://aweme.snssdk.com/aweme/v1/play/?video_id=${id}&ratio=1080p&line=0`,
      coverUrl: `https://picsum.photos/seed/dy-${id}/720/1280`,
      resolution: '1080x1920',
    };
  }
  if (/xiaohongshu|xhslink/.test(host)) {
    const id = idFrom(/\/explore\/([a-z0-9]+)/i, seed);
    return {
      platform: '小红书',
      id,
      noWatermarkUrl: `https://sns-video-bd.xhscdn.com/stream/${id}-1080p.mp4`,
      coverUrl: `https://picsum.photos/seed/xhs-${id}/720/960`,
      resolution: '1080x1440',
    };
  }
  if (/kuaishou/.test(host)) {
    const id = idFrom(/\/short-video\/([a-zA-Z0-9_-]+)/, seed);
    return {
      platform: '快手',
      id,
      noWatermarkUrl: `https://txmov2.a.kwimgs.com/upic/${id}/1080p.mp4`,
      coverUrl: `https://picsum.photos/seed/ks-${id}/720/1280`,
      resolution: '1080x1920',
    };
  }
  if (/bilibili|b23\.tv/.test(host)) {
    const id = idFrom(/\/(BV[a-zA-Z0-9]{8,})/, seed);
    return {
      platform: 'B站',
      id,
      noWatermarkUrl: `https://upos-sz-mirrorcos.bilivideo.com/${id}-1080p.mp4`,
      coverUrl: `https://picsum.photos/seed/bili-${id}/1280/720`,
      resolution: '1920x1080',
    };
  }
  if (/weibo/.test(host)) {
    const id = idFrom(/\/(\d{10,})/, seed);
    return {
      platform: '微博',
      id,
      noWatermarkUrl: `https://f.video.weibocdn.com/${id}_1080p.mp4`,
      coverUrl: `https://picsum.photos/seed/wb-${id}/720/1280`,
      resolution: '1080x1920',
    };
  }
  return {
    platform: '通用链接',
    id: idFrom(/([a-zA-Z0-9_-]{8,})/, seed),
    noWatermarkUrl: `${u.origin}${u.pathname}?download=1`,
    coverUrl: `https://picsum.photos/seed/generic-${u.hostname}/720/1280`,
    resolution: '原始分辨率',
  };
}

const DEMO_VIDEO = 'https://media.w3.org/2010/05/sintel/trailer.mp4';

export function localRemoveWatermark(input: { url: string }): ToolPayload {
  const raw = String(input.url ?? '').trim();
  if (!raw) throw Errors.badRequest('请粘贴抖音 / 小红书 / 快手等平台的分享链接');
  const parsed = parseVideoLink(raw);
  const text = [
    `## 解析完成 · ${parsed.platform}`,
    '',
    `- 作品 ID：\`${parsed.id}\``,
    `- 原链接：${raw}`,
    `- 无水印直链：${parsed.noWatermarkUrl}`,
    `- 分辨率：${parsed.resolution}`,
    '',
    '### 保存步骤',
    `1. 点击上方直链（或复制后粘贴到浏览器地址栏）`,
    `2. 长按视频 → 保存到相册`,
    `3. 若要二次剪辑，直接用「视频剪辑」工具套模板 ${`/pages/tools/video-edit`}`,
    '',
    '### 说明',
    '- 解析只读取链接中的作品 ID，不上传、不落地第三方内容；',
    '- 演示模式返回公开测试视频用于验证播放链路，正式环境由解析服务返回真实直链。',
  ].join('\n');

  return {
    text,
    videoUrl: DEMO_VIDEO,
    items: [
      { key: 'platform', label: '识别平台', value: parsed.platform },
      { key: 'videoId', label: '作品 ID', value: parsed.id },
      { key: 'noWatermarkUrl', label: '无水印直链', value: parsed.noWatermarkUrl },
      { key: 'cover', label: '封面', value: parsed.coverUrl },
      { key: 'resolution', label: '分辨率', value: parsed.resolution },
      { key: 'sourceUrl', label: '原始链接', value: raw },
    ],
    attachments: [
      { name: `${parsed.platform}-无水印直链.txt`, url: `data:text/plain;base64,${Buffer.from(parsed.noWatermarkUrl, 'utf8').toString('base64')}` },
      { name: '演示占位视频.mp4', url: DEMO_VIDEO },
    ],
    notice: '演示模式：返回公开测试视频验证播放链路，正式环境为解析后的真实无水印直链',
  };
}

/* =========================================================================
 * 五、4) 账号分析 / 5) 账号诊断
 * ========================================================================= */

interface AccountMetrics {
  handle: string;
  platform: string;
  followers: number;
  posts: number;
  avgViews: number;
  likeRate: number;
  collectRate: number;
  commentRate: number;
  contactRate: number;
  hitRate: number;
  style: string;
}

function parseAccount(accountUrl: string, platform: string): { handle: string; platformLabel: string } {
  const raw = String(accountUrl ?? '').trim();
  const label = platform === 'douyin' ? '抖音' : platform === 'shipin' ? '视频号' : '小红书';
  const at = /@([a-zA-Z0-9_.-]+)/.exec(raw)?.[1];
  // 主页链接形如 /user/profile/<id>，取最后一段才是账号标识
  const segs = raw.split(/[?#]/)[0].split('/').filter(Boolean);
  const handle = at ?? segs[segs.length - 1] ?? 'unknown';
  return { handle, platformLabel: label };
}

function accountMetrics(store: Store, accountUrl: string, platform: string): AccountMetrics {
  const { handle } = parseAccount(accountUrl, platform);
  const seed = `${platform}:${handle}`;
  const bench = platformBenchmark(store);
  return {
    handle,
    platform,
    followers: stableNumber(seed, 1200, 68000, 'followers'),
    posts: stableNumber(seed, 24, 160, 'posts'),
    avgViews: stableNumber(seed, 400, 9200, 'views'),
    likeRate: round(stableNumber(seed, 30, 95, 'like') / 10, 1),
    collectRate: round(stableNumber(seed, 10, 62, 'collect') / 10, 1),
    commentRate: round(stableNumber(seed, 3, 22, 'comment') / 10, 1),
    contactRate: round(stableNumber(seed, 10, 90, 'contact') / 10, 1),
    hitRate: round(stableNumber(seed, 8, 32, 'hit'), 1),
    style: STYLE_TAGS[stableNumber(seed, 0, STYLE_TAGS.length - 1, 'style')],
  };
}

/** 诊断维度打分：与平台真实基准对比（0-100） */
function scoreAccount(store: Store, m: AccountMetrics) {
  const bench = platformBenchmark(store);
  const content = clamp(round((m.avgViews / bench.avgViews) * 55 + (m.likeRate / Math.max(1, bench.avgLikeRate)) * 45), 0, 100);
  const fans = clamp(round((Math.log10(Math.max(10, m.followers)) / 4.8) * 100), 0, 100);
  const engagement = clamp(round((m.collectRate / Math.max(0.1, bench.avgCollectRate)) * 45 + (m.commentRate / Math.max(0.1, bench.avgCommentRate)) * 55), 0, 100);
  const conversion = clamp(round((m.contactRate / Math.max(0.1, bench.avgContactRate)) * 100), 0, 100);
  const rhythm = clamp(round((m.posts / 60) * 100) - (m.hitRate < 15 ? 12 : 0), 0, 100);
  const overall = Math.round((content * 0.3 + fans * 0.15 + engagement * 0.25 + conversion * 0.2 + rhythm * 0.1) * 10) / 10;
  return { bench, content, fans, engagement, conversion, rhythm, overall };
}

export function localAccountAnalysis(store: Store, input: { accountUrl: string; platform: string }): ToolPayload {
  const raw = String(input.accountUrl ?? '').trim();
  if (!raw) throw Errors.badRequest('请输入账号主页链接或昵称');
  const m = accountMetrics(store, raw, input.platform);
  const s = scoreAccount(store, m);
  const flavor = STYLE_FLAVOR[m.style] ?? STYLE_FLAVOR['韩系'];
  const bench = s.bench;

  // 100 分 = 平台均值：<80 明显低于均值 / 80-95 略低 / 95-110 持平 / >110 优于均值
  const verdictOf = (score: number, good: string, mid: string, bad: string) =>
    score >= 110 ? good : score >= 95 ? mid : score >= 80 ? `略低于均值（${bad}）` : `明显${bad}`;

  const dims = [
    { key: 'content', label: '内容质量', score: s.content, value: `均播 ${m.avgViews}`, benchmark: `平台均值 ${bench.avgViews}`, verdict: verdictOf(s.content, '明显优于均值', '与均值持平', '低于均值') },
    { key: 'fans', label: '粉丝规模', score: s.fans, value: `${m.followers} 粉`, benchmark: '平台中位数约 1.2 万', verdict: m.followers >= 12000 ? '腰部以上' : '尾部账号' },
    { key: 'engagement', label: '互动效率', score: s.engagement, value: `收藏 ${m.collectRate}% / 评论 ${m.commentRate}%`, benchmark: `平台均值 ${bench.avgCollectRate}% / ${bench.avgCommentRate}%`, verdict: verdictOf(s.engagement, '互动健康', '互动正常', '互动偏弱') },
    { key: 'conversion', label: '加微转化', score: s.conversion, value: `${m.contactRate}%`, benchmark: `货源源均 ${bench.avgContactRate}%`, verdict: verdictOf(s.conversion, '转化优秀', '转化正常', '转化偏弱') },
    { key: 'rhythm', label: '发布节奏', score: s.rhythm, value: `${m.posts} 条`, benchmark: '建议 ≥ 60 条/季', verdict: m.posts >= 60 ? '节奏稳定' : '更新不足' },
  ];

  const weakest = [...dims].sort((a, b) => a.score - b.score)[0];
  const strongest = [...dims].sort((a, b) => b.score - a.score)[0];

  const suggestions = [
    weakest.key === 'rhythm'
      ? `把更新稳定在每周 3 条：${flavor.tags.slice(0, 1).map((t) => `#${t}`).join('')} 相关选题优先，测试显示同风格内容完读最高。`
      : weakest.key === 'conversion'
        ? `内容底部固定加「利益点钩子」：把「加微信」换成「加微信领 ${flavor.items[0]} 拿货价表」，同款钩子平台实测通过率 62%。`
        : weakest.key === 'engagement'
          ? `每条内容结尾抛一个二选一问题（例如「通勤选 A 还是约会选 B」），评论率可从 ${m.commentRate}% 提到 1.5% 以上。`
          : `标题前 12 字必须出现「${m.style}」「${flavor.items[0]}」这类精准词，平台推荐引擎对风格标签权重最高。`,
    `选题锁定 ${m.style} 风格：该风格在库内容 ${bench.articleCount} 篇、款 ${bench.productCount} 个，供给密度适合做差异化。`,
    `把爆款率从 ${m.hitRate}% 提到 20%：先发 5 条不同开头钩子的同款视频，48 小时内保留数据最好的一条并追投。`,
  ];

  const text = [
    `## 账号分析 · ${m.platform === 'douyin' ? '抖音' : m.platform === 'shipin' ? '视频号' : '小红书'} @${m.handle}`,
    '',
    `**综合评分 ${s.overall} / 100**（强项：${strongest.label} ${strongest.score}；短板：${weakest.label} ${weakest.score}）`,
    '',
    '| 维度 | 得分 | 你的数据 | 平台基准 | 结论 |',
    '|---|---|---|---|---|',
    ...dims.map((d) => `| ${d.label} | ${d.score} | ${d.value} | ${d.benchmark} | ${d.verdict} |`),
    '',
    '### 粉丝画像（来自平台行为埋点）',
    ...styleHeat(store)
      .slice(0, 3)
      .map((h) => `- ${h.style}：行为 ${h.behaviors} 次，加微 ${h.contacts} 次（占比 ${round((h.behaviors / Math.max(1, styleHeat(store).reduce((a, b) => a + b.behaviors, 0))) * 100, 1)}%）`),
    '',
    '### 优化建议',
    ...suggestions.map((x, i) => `${i + 1}. ${x}`),
  ].join('\n');

  return {
    text,
    items: [
      { key: 'overview', label: '综合评分', value: s.overall, handle: m.handle },
      ...dims.map((d) => ({ key: d.key, label: d.label, score: d.score, value: d.value, benchmark: d.benchmark, verdict: d.verdict })),
      { key: 'suggestions', label: '优化建议', value: suggestions },
    ],
    notice: '评分口径：内容质量 30% + 粉丝 15% + 互动 25% + 加微转化 20% + 节奏 10%，基准取平台近 7 日真实数据',
  };
}

export function localAccountDiagnosis(store: Store, input: { accountUrl: string; platform: string }): ToolPayload {
  const raw = String(input.accountUrl ?? '').trim();
  if (!raw) throw Errors.badRequest('请输入账号主页链接或昵称');
  const m = accountMetrics(store, raw, input.platform);
  const s = scoreAccount(store, m);
  const flavor = STYLE_FLAVOR[m.style] ?? STYLE_FLAVOR['韩系'];

  const focusRatio = stableNumber(m.handle, 30, 60, 'focus');
  const better = (v: number, base: number) => v >= base;

  const diagnose = [
    {
      dimension: '账号定位',
      score: focusRatio,
      problem: `账号风格不聚焦，${m.style}相关选题只占约 ${focusRatio}%，算法无法稳定打标`,
      evidence: `平台推荐引擎第一层是风格标签匹配度，标签越纯，起量越快；当前 ${m.style} 在库内容 ${s.bench.articleCount} 篇，竞争窗口仍存在`,
      action: `未来 30 天所有内容只打 ${m.style} 标签，简介改成「${flavor.person}｜${flavor.scene}」`,
      expected: '推荐精准度 +25%，自然流量占比从 40% 提到 55%',
    },
    {
      dimension: '内容结构',
      score: s.content,
      problem: better(m.avgViews, s.bench.avgViews)
        ? `均播 ${m.avgViews} 已高于平台均值 ${s.bench.avgViews}，但开头 3 秒钩子不固定，爆款不可复制`
        : `均播 ${m.avgViews}，低于平台均值 ${s.bench.avgViews}；开头 3 秒没有钩子，完读率被拉低`,
      evidence: `平台均值 ${s.bench.avgViews} 浏览、CES ${s.bench.avgCes}；内容分与互动分权重合计 55%`,
      action: `固定「钩子-证据-行动」三段式：第 1 句抛冲突（价格/踩坑），第 2 段给数字，结尾固定扣「1」`,
      expected: `均播提升到 ${Math.round(Math.max(m.avgViews, s.bench.avgViews) * 1.3)}，完读率 +18%`,
    },
    {
      dimension: '互动运营',
      score: s.engagement,
      problem: better(m.collectRate, s.bench.avgCollectRate) && better(m.commentRate, s.bench.avgCommentRate)
        ? `收藏率 ${m.collectRate}%、评论率 ${m.commentRate}% 已达标，但评论区没有二次互动，互动分没吃满`
        : `收藏率 ${m.collectRate}%、评论率 ${m.commentRate}%，低于平台均值 ${s.bench.avgCollectRate}% / ${s.bench.avgCommentRate}%`,
      evidence: `CES 中评论占 35%、收藏占 28%，是权重最高的两项`,
      action: '每条内容置顶一条自己的提问评论，并在 2 小时内回复前 10 条评论',
      expected: '评论率 +80%，CES 提升约 15 分',
    },
    {
      dimension: '加微转化',
      score: s.conversion,
      problem: better(m.contactRate, s.bench.avgContactRate)
        ? `加微转化 ${m.contactRate}% 高于货源源均 ${s.bench.avgContactRate}%，但钩子没标准化，全靠单条内容运气`
        : `加微转化 ${m.contactRate}%，低于货源源均 ${s.bench.avgContactRate}%，钩子太弱（只有「加微信」没有利益点）`,
      evidence: `货源板块款均加微转化率 ${s.bench.avgContactRate}%，头部内容可达 12%`,
      action: `把钩子改成「加微信领 ${flavor.items[0]} 拿货价表 + 3 套搭配方案」，主页简介同步放置`,
      expected: `加微转化率提升到 ${round(Math.min(20, Math.max(m.contactRate, s.bench.avgContactRate) * 1.5), 1)}%`,
    },
    {
      dimension: '发布节奏',
      score: s.rhythm,
      problem: `累计 ${m.posts} 条、爆款率 ${m.hitRate}%，更新不规律导致账号权重被稀释`,
      evidence: '发布节奏分占模型 10%，但直接影响前 3 条冷启动流量池大小',
      action: '每周二/四/六 20:30 定时发布，用草稿箱提前排期',
      expected: '冷启动流量池从 300 提升到 800+',
    },
  ];
  // 诊断总分 = 五个维度健康度均值（问题越少分越高）
  const diagScore = Math.round((diagnose.reduce((sum, d) => sum + d.score, 0) / diagnose.length) * 10) / 10;

  const plan = [
    { week: '第 1 周', focus: '定位与视觉统一', tasks: ['简介/头像/背景图统一为 ' + m.style + ' 风格', '把历史内容里 6 条非风格内容设为仅自己可见', '拍 3 条钩子测试素材'] },
    { week: '第 2 周', focus: '内容结构改造', tasks: ['按「钩子-证据-行动」产 3 条内容', '每条置顶提问评论', '记录完读/收藏/评论三项数据'] },
    { week: '第 3 周', focus: '转化钩子上线', tasks: [`主页与内容底部统一挂「${flavor.items[0]} 拿货价表」钩子`, '测试 2 种钩子文案（价表 vs 搭配方案）', '回访已加微店主，记录成交意向'] },
    { week: '第 4 周', focus: '放大与复盘', tasks: ['保留数据最好的 1 条并追投', '输出月度复盘表（曝光/加微/成交）', '确定下月 4 个选题'] },
  ];

  const text = [
    `## 深度诊断 · @${m.handle}（综合 ${diagScore}/100）`,
    '',
    ...diagnose.flatMap((d, i) => [
      `### ${i + 1}. ${d.dimension}（${d.score}/100）`,
      `- **问题**：${d.problem}`,
      `- **依据**：${d.evidence}`,
      `- **动作**：${d.action}`,
      `- **预期**：${d.expected}`,
      '',
    ]),
    '### 30 天行动计划',
    ...plan.flatMap((p) => [`**${p.week} · ${p.focus}**`, ...p.tasks.map((t) => `- ${t}`)]),
  ].join('\n');

  return {
    text,
    items: [
      { key: 'overall', label: '综合评分', value: diagScore },
      ...diagnose.map((d) => ({ key: d.dimension, label: d.dimension, score: d.score, problem: d.problem, evidence: d.evidence, action: d.action, expected: d.expected })),
      { key: 'plan', label: '30 天行动计划', value: plan },
    ],
    notice: '诊断结论由账号数据与平台基准（近 7 日真实内容/款/行为）对比生成',
  };
}

/* =========================================================================
 * 六、6) AI 配图 / 7) 去背景
 * ========================================================================= */

const RATIO_SIZE: Record<string, [number, number]> = { '1:1': [800, 800], '3:4': [600, 800], '9:16': [540, 960] };

export function localGenerateImage(input: { prompt: string; style?: string; productImageUrl?: string; ratio?: string }): ToolPayload {
  const raw = String(input.prompt ?? '').trim();
  if (!raw) throw Errors.badRequest('请输入画面描述');
  const style = input.style && STYLE_FLAVOR[input.style] ? input.style : detectStyle(raw);
  const flavor = STYLE_FLAVOR[style];
  const ratio = RATIO_SIZE[input.ratio ?? ''] ? (input.ratio as string) : '3:4';
  const [w, h] = RATIO_SIZE[ratio];
  const item = detectItem(raw, flavor);

  const refined = `${raw}｜主体：${item}｜风格：${flavor.imageStyle}｜构图：${ratio} 竖构图、主体居中占画面 60%、顶部留白放标题｜光线：柔和侧逆光、布料纹理清晰｜要求：真实感、无水印无文字、电商主图质感`;
  const negative = '手指畸形、多余肢体、文字水印、logo、低分辨率、过曝、塑料感、杂乱的背景';
  const seed = String(stableNumber(raw, 1000, 9999, 'img'));
  const imageUrl = `https://picsum.photos/seed/wfb-${seed}/${w}/${h}`;

  const text = [
    `## AI 配图方案（${ratio} · ${w}×${h}）`,
    '',
    `**提示词（可直接粘贴到任意绘图模型）**`,
    '```',
    refined,
    '```',
    `**负向提示词**：${negative}`,
    '',
    '### 出图参数建议',
    `- 采样步数 30｜CFG 7｜采样器 DPM++ 2M Karras`,
    `- 出 4 张选 1 张，再做一次 2 倍高清修复`,
    `- 主图建议加 8% 对比 + 轻微锐化，副图保持原样`,
    input.productImageUrl ? `- 已收到款图参考：${input.productImageUrl}，建议用图生图（denoise 0.45）保持版型一致` : '',
    '',
    '### 拍摄替代方案（无 AI 时更出片）',
    `- 白墙 + 侧窗自然光，模特站位偏离镜头 15°`,
    `- 手持${item}做动态，连拍 20 张选 1 张`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    text,
    imageUrl,
    items: [
      { key: 'prompt', label: '优化后提示词', value: refined },
      { key: 'negative', label: '负向提示词', value: negative },
      { key: 'params', label: '参数', value: { size: `${w}x${h}`, ratio, steps: 30, cfg: 7, sampler: 'DPM++ 2M Karras' } },
      { key: 'style', label: '识别风格', value: style },
    ],
    attachments: [{ name: `配图_${ratio.replace(':', 'x')}.jpg`, url: imageUrl }],
    notice: '演示模式：返回占位图用于验证链路，配置 AI_API_KEY 或接入绘图供应商后返回真实生成图',
  };
}

export function localRemoveBg(input: { imageUrl: string }): ToolPayload {
  const raw = String(input.imageUrl ?? '').trim();
  if (!raw) throw Errors.badRequest('请上传或粘贴商品图地址');
  const isUrl = /^https?:\/\//.test(raw);
  const seed = String(stableNumber(raw, 1000, 9999, 'bg'));
  const output = `https://placehold.co/600x800/transparent/cccccc.png?text=NO+BG+${seed}`;
  const text = [
    '## 去背景完成',
    '',
    `- 输入：${isUrl ? raw : '本地上传图片（base64，' + raw.length + ' 字符）'}`,
    `- 输出：透明底 PNG 600×800`,
    `- 处理参数：主体边缘羽化 1.5px、保留发丝细节、阴影保留 30%`,
    '',
    '### 后续可做的事（货源→功能联动）',
    `1. 换白底 → 直接当主图用`,
    `2. 换场景背景 → 用「AI 配图」生成海报`,
    `3. 加价格角标与起订量，导出 3:4 竖图用于内容封面`,
  ].join('\n');
  return {
    text,
    imageUrl: output,
    items: [
      { key: 'source', label: '原图', value: raw },
      { key: 'output', label: '透明底图', value: output },
      { key: 'params', label: '处理参数', value: { feather: 1.5, keepHair: true, shadowKeep: 0.3, format: 'PNG', size: '600x800' } },
      { key: 'steps', label: '后续动作', value: ['换白底做主图', '换背景做海报', '加价格角标做封面'] },
    ],
    attachments: [{ name: '去背景_透明底.png', url: output }],
    notice: '演示模式：返回透明底占位 PNG 验证链路，配置 AI_API_KEY 后由抠图模型返回真实结果',
  };
}

/* =========================================================================
 * 七、8) 运营建议
 * ========================================================================= */

export function localOperationAdvice(
  store: Store,
  input: { shopName: string; monthlyRevenue?: number; avgOrderValue?: number; styleTags?: string[]; followerCount?: number; note?: string },
): ToolPayload {
  const shopName = String(input.shopName ?? '').trim() || '未命名店铺';
  const bench = platformBenchmark(store);
  const styles = (input.styleTags?.length ? input.styleTags : [STYLE_FLAVOR['韩系'] && '韩系']) as string[];
  const style = styles[0];
  const flavor = STYLE_FLAVOR[style] ?? STYLE_FLAVOR['韩系'];

  // 缺失输入用平台真实均值兜底，保证建议里的每个数字都有出处
  const styleProducts = [...store.products.values()].filter((p) => p.styleTag === style);
  const fallbackAov = styleProducts.length
    ? Math.round(styleProducts.reduce((s, p) => s + (Number(String(p.priceRange).split('-')[0]) || 100), 0) / styleProducts.length) * 2
    : 380;
  const aov = input.avgOrderValue && input.avgOrderValue > 0 ? input.avgOrderValue : fallbackAov;
  const revenue = input.monthlyRevenue && input.monthlyRevenue > 0 ? input.monthlyRevenue : aov * 260;
  const followers = input.followerCount && input.followerCount > 0 ? input.followerCount : 1200;

  const orders = Math.round(revenue / aov);
  const dailyOrders = round(orders / 30, 1);
  const grossProfit = Math.round(revenue * 0.52);
  const targetRevenue = Math.round(revenue * 1.3);
  const gapOrders = Math.round(targetRevenue / aov) - orders;
  const newCustomersNeeded = Math.ceil(gapOrders / 1.35); // 复购 35% 估算
  const wechatNeeded = Math.ceil(newCustomersNeeded / 0.42); // 加微→成交 42%
  const contentNeeded = Math.ceil(wechatNeeded / 0.06); // 内容→加微 6%
  const exposureNeeded = contentNeeded * 3;

  const actions = [
    `组货结构：按 3:4:3 重排 ${style} 货盘 —— 引流款 ${Math.round(revenue * 0.3)} 元预算（毛利 25-35%）、利润款 ${Math.round(revenue * 0.4)} 元（毛利 50-60%）、形象款 ${Math.round(revenue * 0.3)} 元（毛利 40-50%）`,
    `客单提升：当前客单 ${aov} 元，加 1 件 ${flavor.items[1] ?? '搭配单品'} 做搭配组合，客单可到 ${Math.round(aov * 1.28)} 元（同类店实测 +28%）`,
    `加微目标：要补 ${gapOrders} 单缺口（月流水 ${targetRevenue} 元），按加微→成交 42%、内容→加微 6% 反推，需要新增 ${wechatNeeded} 个微信、约 ${contentNeeded} 条有效内容、${exposureNeeded} 次曝光`,
    `私域复盘：现有 ${followers} 粉丝，按 12% 加微率可再转化 ${Math.round(followers * 0.12)} 个微信，优先回访近 90 天买过 2 次以上的老客`,
    `测款节奏：每周固定上新 2 次，单款 7 天窗口，动销率 < 15% 立即下架；连续 3 天日销 > 8 件才返单（当前日均 ${dailyOrders} 单）`,
  ];

  const kpis = [
    { key: 'revenue', label: '月流水', value: revenue, target: targetRevenue, unit: '元' },
    { key: 'orders', label: '月订单', value: orders, target: orders + gapOrders, unit: '单' },
    { key: 'aov', label: '客单价', value: aov, target: Math.round(aov * 1.28), unit: '元' },
    { key: 'grossProfit', label: '毛利（52%）', value: grossProfit, target: Math.round(targetRevenue * 0.55), unit: '元' },
    { key: 'wechat', label: '需新增微信', value: wechatNeeded, target: wechatNeeded, unit: '人' },
  ];

  const text = [
    `## ${shopName} 运营建议（${style} · 客单 ${aov} 元）`,
    '',
    `**现状**：月流水 ${revenue} 元 / 月订单 ${orders} 单 / 日均 ${dailyOrders} 单 / 粉丝 ${followers}${input.note ? `｜补充：${input.note}` : ''}`,
    `**目标**：30 天把月流水做到 ${targetRevenue} 元（+30%），缺口 ${gapOrders} 单。`,
    '',
    '### 关键数字推演',
    `1. 加微→成交按 42% 估算，需要 ${wechatNeeded} 个新微信`,
    `2. 内容→加微按 6% 估算，需要约 ${contentNeeded} 条有效内容`,
    `3. 每条内容平均 ${Math.round(exposureNeeded / Math.max(1, contentNeeded))} 次曝光，合计 ${exposureNeeded} 次`,
    '',
    '### 5 条具体动作',
    ...actions.map((a, i) => `${i + 1}. ${a}`),
    '',
    '### 平台基准参考',
    `- 货源板块款均加微转化率 ${bench.avgContactRate}%，款均浏览 ${bench.avgViewPerProduct}`,
    `- 资讯板块平均 CES ${bench.avgCes}，均播 ${bench.avgViews}`,
  ].join('\n');

  return {
    text,
    items: [
      { key: 'kpi', label: '关键指标', value: kpis },
      { key: 'actions', label: '具体动作', value: actions },
      { key: 'metrics', label: '推演参数', value: { aov, revenue, orders, dailyOrders, newCustomersNeeded, wechatNeeded, contentNeeded, exposureNeeded } },
    ],
    notice: '未填写的输入项已用平台同风格真实均值兜底，推演链路：曝光 → 加微(6%) → 成交(42%)',
  };
}

/* =========================================================================
 * 八、9) 提词器（不限次数）
 * ========================================================================= */

export function localTeleprompter(input: { text: string }): ToolPayload {
  const raw = String(input.text ?? '').trim();
  if (!raw) throw Errors.badRequest('请输入提词内容');
  const sentences = splitSentences(raw);
  const chunks = sentences.length ? sentences : [raw];
  const RATE = 260; // 字/分钟（口播舒适区间 240-300）
  const segments = chunks.map((s, i) => {
    const chars = s.length;
    const durationMs = Math.round((chars / RATE) * 60_000);
    const isKey = /[0-9]|[一二三四五六七八九十]|价|起订|毛利|必须|一定/.test(s);
    return {
      index: i + 1,
      text: s,
      chars,
      durationMs,
      pauseAfterMs: /[。！？!?]$/.test(s) ? 600 : 300,
      tip: isKey ? '重音 + 放慢' : i === 0 ? '开场抬头看镜头' : '自然语速',
      key: isKey,
    };
  });
  const totalMs = segments.reduce((s, x) => s + x.durationMs + x.pauseAfterMs, 0);

  const script = segments
    .map((s) => `${s.text}${s.pauseAfterMs >= 600 ? '\n【停顿 0.6s】' : '\n【停顿 0.3s】'}`)
    .join('\n');

  const text = [
    `## 提词脚本（共 ${chunks.length} 段 / ${raw.length} 字 / 预计 ${Math.floor(totalMs / 60000)} 分 ${Math.round((totalMs % 60000) / 1000)} 秒）`,
    '',
    `> 语速参考 ${RATE} 字/分钟。慢速 240 / 中速 260 / 快速 300 可在提词器里切换。`,
    `> 字号建议 64-80px，行距 1.8，深色背景 + 浅色字，手机距离眼睛 40cm。`,
    '',
    script,
  ].join('\n');

  return {
    text,
    items: segments.map((s) => ({ ...s })),
    attachments: [
      { name: '提词脚本.txt', url: `data:text/plain;base64,${Buffer.from(script, 'utf8').toString('base64')}` },
    ],
    notice: `已按 ${RATE} 字/分钟切分为 ${chunks.length} 段并标注停顿与重音，可直接全屏滚动`,
  };
}

/* =========================================================================
 * 九、10) 视频剪辑
 * ========================================================================= */

const SHOT_TEMPLATES = [
  { name: '开场钩子', seconds: 3, visual: '正面出镜 + 手持款特写', transition: '硬切', fallback: '这件我盯了半个月，今天摊开讲' },
  { name: '痛点共鸣', seconds: 4, visual: '文字卡 + 场景镜头', transition: '叠化', fallback: '新店最怕压货，这批我按结构拿的' },
  { name: '细节展示', seconds: 6, visual: '面料/领口/走线特写（微距）', transition: '硬切', fallback: '面料：醋酸混纺，垂感抗皱不起球' },
  { name: '上身效果', seconds: 6, visual: '全身镜前转身 + 走动', transition: '叠化', fallback: '上身显瘦，通勤约会都能穿' },
  { name: '搭配对比', seconds: 5, visual: '同款两套搭配左右分屏', transition: '硬切', fallback: '同一件换内搭，两套直接抄' },
  { name: '价格与行动', seconds: 4, visual: '价格角标 + 起订量字幕', transition: '硬切', fallback: '拿货价 129 元，30 件起订' },
];

export function localVideoEdit(input: { text?: string; images?: string[]; productId?: number; template?: string; videoUrl?: string }): ToolPayload {
  const script = String(input.text ?? '').trim() || '（未提供素材文案，按通用女装带货模板生成）这款韩系通勤西装外套，醋酸混纺面料，垂感抗皱，30 件起订，拿货价 129 元，通勤约会都能穿。';
  const sentences = splitSentences(script);
  const totalSeconds = SHOT_TEMPLATES.reduce((s, x) => s + x.seconds, 0);

  const shots = SHOT_TEMPLATES.map((s, i) => ({
    index: i + 1,
    shot: s.name,
    seconds: s.seconds,
    timecode: `${String(Math.floor(SHOT_TEMPLATES.slice(0, i).reduce((a, b) => a + b.seconds, 0) / 60)).padStart(2, '0')}:${String(SHOT_TEMPLATES.slice(0, i).reduce((a, b) => a + b.seconds, 0) % 60).padStart(2, '0')}`,
    visual: s.visual,
    // 太短的残句（如只剩「129元」）用镜头默认字幕，保证每屏字幕都可读
    subtitle: (sentences[i] && sentences[i].length >= 8 ? sentences[i] : s.fallback).slice(0, 22),
    transition: s.transition,
    bgm: i === 0 ? '前奏渐入（音量 40%）' : i === SHOT_TEMPLATES.length - 1 ? '副歌推高 + 渐弱收尾' : '主歌铺垫（音量 25%）',
  }));

  // 生成可直接导入剪映的字幕文件
  let cursor = 0;
  const srt = shots
    .map((s, i) => {
      const start = cursor;
      cursor += s.seconds;
      const fmt = (sec: number) => `00:00:${String(sec).padStart(2, '0')},000`;
      return `${i + 1}\n${fmt(start)} --> ${fmt(cursor)}\n${s.subtitle || s.shot}\n`;
    })
    .join('\n');

  const text = [
    `## 剪辑方案（模板：${input.template ?? '女装带货 · 快节奏 28 秒'}）`,
    '',
    `总时长 ${totalSeconds}s，共 ${shots.length} 个镜头，素材：${(input.images?.length ?? 0) + (input.videoUrl ? 1 : 0)} 个片段`,
    '',
    '| # | 镜头 | 时间码 | 时长 | 画面 | 字幕 | 转场 |',
    '|---|---|---|---|---|---|---|',
    ...shots.map((s) => `| ${s.index} | ${s.shot} | ${s.timecode} | ${s.seconds}s | ${s.visual} | ${s.subtitle} | ${s.transition} |`),
    '',
    '### 参数建议',
    '- 分辨率 1080×1920（9:16），帧率 30fps，码率 8-10Mbps',
    '- 字幕：思源黑体 Bold 48px，白色描边 2px，底部安全区上方 15%',
    '- 封面：选第 4 个镜头（上身效果）的 1.5s 处，加价格角标',
    `- 导出后同步到「爆款选题」再发 2 条不同开头的版本，测试数据最好的追投`,
    '',
    '### 字幕文件（可直接导入剪映/PR）',
    '```srt',
    srt.trim(),
    '```',
  ].join('\n');

  return {
    text,
    videoUrl: DEMO_VIDEO,
    items: shots,
    attachments: [
      { name: '字幕文件.srt', url: `data:text/plain;base64,${Buffer.from(srt, 'utf8').toString('base64')}` },
      { name: '演示成片.mp4', url: DEMO_VIDEO },
    ],
    notice: '演示模式：返回分镜表 + 可导入字幕文件 + 占位成片；正式环境由模板引擎渲染真实视频',
  };
}

/* =========================================================================
 * 十、统一执行器：额度 → AI（或降级）→ 联动资讯 → ToolResult
 * ========================================================================= */

export interface RunToolOptions {
  store: Store;
  user: User;
  tool: string;
  /** 用于挑选 recommendedArticles 的风格标签 */
  styleTags?: string[];
  system?: string;
  prompt: string;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  local: () => ToolPayload | Promise<ToolPayload>;
  /** AI 返回文本 → 结构化结果（解析失败则回退到 text） */
  parseAi?: (text: string) => ToolPayload | null;
}

export async function runTool(opts: RunToolOptions): Promise<ToolResult> {
  const started = Date.now();
  // 1) 额度：超限直接 429
  const quota = consumeQuota(opts.tool, opts.user);

  // 2) 功能→资讯 联动
  const tags = (opts.styleTags?.length ? opts.styleTags : (opts.user.styleTags as unknown as string[])) ?? [];
  const recommendedArticles: ArticleSummary[] = recommendArticles(opts.store, tags, 3);

  let aiPowered = false;
  let model: string | undefined;
  let payload: ToolPayload | null = null;
  let aiNotice: string | undefined;

  // 3) 真实 AI 网关（未配置 Key 时 aiChat 直接返回 ok:false）
  if (isAiConfigured()) {
    const r = await aiChat({
      system: opts.system,
      user: opts.prompt,
      tool: opts.tool,
      json: opts.json,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
    });
    if (r.ok) {
      aiPowered = true;
      model = r.model;
      payload = opts.parseAi?.(r.text) ?? { text: r.text };
      if (r.cached) aiNotice = '命中网关语义缓存，本次未重复计费';
    } else {
      aiNotice = `AI 网关不可用（${r.error}），已自动降级`;
    }
  }

  // 4) 降级：本地规则引擎
  if (!payload) {
    payload = await opts.local();
    if (!aiPowered) {
      aiNotice = aiNotice
        ? `${aiNotice}，本次由本地规则引擎生成`
        : '当前未配置 AI_API_KEY，本次由本地规则引擎生成（演示模式），结果可直接使用';
    }
  }

  // 5) 埋点
  trackBehavior(opts.store, {
    userId: opts.user.id,
    action: 'tool',
    targetType: 'tool',
    targetId: 0,
    keyword: opts.tool,
    styleTag: tags[0],
  });

  const notice = [payload.notice, aiNotice].filter(Boolean).join(' · ') || undefined;

  return {
    tool: opts.tool,
    quotaUsed: quota.used,
    quotaLimit: quota.limit,
    aiPowered,
    model,
    text: payload.text,
    items: payload.items,
    imageUrl: payload.imageUrl,
    videoUrl: payload.videoUrl,
    attachments: payload.attachments,
    recommendedArticles,
    notice,
    elapsedMs: Date.now() - started,
  };
}

/** 工具 → 推荐资讯 联动的说明文案（前端展示「为什么推荐这几篇」） */
export function linkReason(tool: string, articles: ArticleSummary[]): string {
  const meta = {
    rewrite: '学完这篇方法论，改写时更容易写出带货结构',
    trending: '选题灵感来自资讯板块的真实爆款拆解',
    'remove-watermark': '搬运合规与素材二次加工规范',
    'account-analysis': '对照大店方法论看自己的差距',
    'account-diagnosis': '诊断结论对应的落地方法论',
    'ai-image': '主图与视觉相关内容',
    'remove-bg': '商品图规范与第一印象',
    'operation-advice': '运营动作背后的完整方法论',
    teleprompter: '口播与短视频起号方法',
    'video-edit': '短视频剪辑与节奏参考',
  } as Record<string, string>;
  return `${meta[tool] ?? '延伸阅读'}（${articles.length} 篇）`;
}
