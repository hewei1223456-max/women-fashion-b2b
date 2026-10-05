#!/usr/bin/env node
/**
 * 女装B2B行业平台 · 后端接口冒烟测试（零依赖，Node 18+ 内置 fetch）
 *
 * 用法：
 *   node scripts/smoke-api.mjs                       # 默认 http://localhost:3100
 *   node scripts/smoke-api.mjs http://localhost:3111 # 指定地址
 *
 * 覆盖：健康检查、演示账号登录、三大模块核心读接口、互动写链路
 *      （发布→点赞→评论→关注→未读数→私信）、加微记录、推荐与搜索、审核、管理后台。
 *
 * 退出码：0 = 全部通过；1 = 存在失败（输出失败清单与响应体，便于定位）。
 */

const BASE = (process.argv[2] || process.env.SMOKE_BASE || 'http://localhost:3100').replace(/\/$/, '');

let token = '';
let pass = 0;
let fail = 0;
const failures = [];
const warnings = [];

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

async function call(method, path, body, { auth = true, expectCode = 0 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`网络失败 ${method} ${path}: ${e.message}`);
  }
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { code: -1, message: `非 JSON 响应: ${text.slice(0, 120)}`, data: null };
  }
  if (json && json.code !== expectCode) {
    const err = new Error(`code=${json.code} message=${json.message}`);
    err.response = json;
    err.status = res.status;
    throw err;
  }
  return json;
}

/** 单个用例：记录通过/失败，失败不中断（除非标记 fatal） */
async function test(name, fn, { fatal = false, optional = false } = {}) {
  try {
    const out = await fn();
    pass++;
    const extra = typeof out === 'string' ? ` ${c.gray(out)}` : '';
    console.log(`  ${c.green('PASS')} ${name}${extra}`);
    return out;
  } catch (e) {
    if (optional) {
      warnings.push(`${name} → ${e.message}`);
      console.log(`  ${c.yellow('SKIP')} ${name} ${c.gray(e.message)}`);
      return null;
    }
    fail++;
    failures.push({ name, message: e.message, response: e.response ?? null });
    console.log(`  ${c.red('FAIL')} ${name}`);
    console.log(`       ${c.red(e.message)}`);
    if (e.response) console.log(`       ${c.gray(JSON.stringify(e.response).slice(0, 400))}`);
    if (fatal) {
      report();
      process.exit(1);
    }
    return null;
  }
}

function section(title) {
  console.log(`\n${c.bold(title)}`);
}

function report() {
  console.log(`\n${c.bold('='.repeat(60))}`);
  console.log(`${c.bold('冒烟结果')}  ${c.green(`通过 ${pass}`)}  ${fail ? c.red(`失败 ${fail}`) : c.gray('失败 0')}  ${warnings.length ? c.yellow(`跳过 ${warnings.length}`) : c.gray('跳过 0')}`);
  if (failures.length) {
    console.log(`\n${c.red('失败明细：')}`);
    for (const f of failures) console.log(`  - ${f.name}\n    ${f.message}`);
  }
  if (warnings.length) {
    console.log(`\n${c.yellow('跳过明细（相关模块可能尚未实现）：')}`);
    for (const w of warnings) console.log(`  - ${w}`);
  }
  console.log(`${c.bold('='.repeat(60))}\n`);
}

const ok = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const has = (arr, msg) => ok(Array.isArray(arr) && arr.length > 0, msg);

async function main() {
  console.log(`\n${c.bold('女装B2B行业平台 · API 冒烟测试')}  →  ${BASE}\n`);

  /* ---------------- 系统 ---------------- */
  section('1. 系统与健康');
  const health = await test('GET /api/health', () => call('GET', '/api/health', undefined, { auth: false }), { fatal: true });
  console.log(
    `       ${c.gray(
      `driver=${health.data.driver} 用户=${health.data.counts?.users} 款=${health.data.counts?.products} 内容=${health.data.counts?.articles} AI=${health.data.capabilities?.ai ? '已配置' : '降级模式'}`,
    )}`,
  );
  await test('GET /api/system/stats', () => call('GET', '/api/system/stats', undefined, { auth: false }));
  await test('GET /api/routes（路由表）', () => call('GET', '/api/routes', undefined, { auth: false }));
  await test('404 语义正确', async () => {
    try {
      await call('GET', '/api/definitely-not-exist', undefined, { auth: false });
    } catch (e) {
      ok(e.status === 404, `期望 HTTP 404，实际 ${e.status}`);
      return 'HTTP 404';
    }
    throw new Error('不存在的接口竟然返回成功');
  });
  await test('未登录访问受保护接口返回 401', async () => {
    const res = await fetch(`${BASE}/api/auth/me`);
    const body = await res.json();
    ok(body.code === 401, `期望 code=401，实际 ${body.code}`);
    return `code=${body.code}`;
  });

  /* ---------------- 认证 ---------------- */
  section('2. 认证与个人主页');
  const accounts = await test('GET /api/auth/demo-accounts', () => call('GET', '/api/auth/demo-accounts', undefined, { auth: false }), { fatal: true });
  console.log(`       ${c.gray(`演示账号 ${accounts.data.length} 个：${accounts.data.slice(0, 5).map((u) => `${u.id}-${u.nickname}`).join(', ')}`)}`);

  const owner = accounts.data.find((u) => u.role === 'shop_owner');
  const manufacturer = accounts.data.find((u) => u.role === 'manufacturer');
  ok(owner, '演示数据缺少 shop_owner');
  ok(manufacturer, '演示数据缺少 manufacturer');

  const login = await test(`POST /api/auth/login（店主 #${owner.id}）`, () =>
    call('POST', '/api/auth/login', { demoUserId: owner.id }, { auth: false }), { fatal: true });
  token = login.data.token;
  ok(token && token.split('.').length === 3, 'token 不是合法 JWT');

  const me = await test('GET /api/auth/me', () => call('GET', '/api/auth/me'));
  ok(me.data.id === owner.id, '返回的不是当前登录用户');

  await test('POST /api/auth/certify（提交认证）', () =>
    call('POST', '/api/auth/certify', {
      role: 'shop_owner',
      companyName: '小满服饰（冒烟测试）',
      licenseUrl: 'https://picsum.photos/seed/smoke-license/800/600',
      legalName: '张三',
      idCardFrontUrl: 'https://picsum.photos/seed/id-front/600/400',
      idCardBackUrl: 'https://picsum.photos/seed/id-back/600/400',
      faceVerifyId: 'face-smoke-001',
      bankAmount: 0.03,
      styleTags: ['韩系'],
      priceBand: '200-500',
      sourcingCities: ['杭州'],
    }));
  await test('GET /api/auth/certify/status', () => call('GET', '/api/auth/certify/status'));

  await test(`GET /api/profile/${owner.id}`, async () => {
    const r = await call('GET', `/api/profile/${owner.id}`);
    ok(r.data.user, '缺少 user 字段');
    ok(typeof r.data.followerCount === 'number', '缺少 followerCount');
    return `粉丝 ${r.data.followerCount} / 内容 ${r.data.contentCount}`;
  });
  await test('PUT /api/profile（编辑资料）', () =>
    call('PUT', '/api/profile', { bio: `冒烟测试更新于 ${new Date().toISOString().slice(0, 16)}` }));
  await test('GET /api/profile/:id/content', () => call('GET', `/api/profile/${owner.id}/content?page=1&pageSize=5`), { optional: true });
  await test('GET /api/profile/:id/collect', () => call('GET', `/api/profile/${owner.id}/collect?page=1&pageSize=5`), { optional: true });
  await test('GET /api/profile/:id/likes', () => call('GET', `/api/profile/${owner.id}/likes?page=1&pageSize=5`), { optional: true });
  await test('GET /api/profile/:id/followers', () => call('GET', `/api/profile/${owner.id}/followers?page=1&pageSize=5`), { optional: true });

  /* ---------------- 资讯 ---------------- */
  section('3. 资讯板块');
  const infoFeed = await test('GET /api/info/feed（推荐流）', async () => {
    const r = await call('GET', '/api/info/feed?page=1&pageSize=10&styleTags=韩系');
    has(r.data.list, '返回空列表');
    ok(typeof r.data.strategy === 'string', '缺少 strategy 字段（规则引擎说明）');
    return `strategy="${String(r.data.strategy).slice(0, 60)}" 冷启动=${r.data.coldStart}`;
  });
  const firstArticle = infoFeed?.data?.list?.[0];
  if (firstArticle) {
    await test(`GET /api/info/detail/${firstArticle.id}`, async () => {
      const r = await call('GET', `/api/info/detail/${firstArticle.id}`);
      ok(r.data.title, '缺少 title');
      ok(Array.isArray(r.data.relatedProducts), '缺少 relatedProducts（资讯→货源联动）');
      return `关联款 ${r.data.relatedProducts.length} 个 / 相关推荐 ${(r.data.related ?? []).length} 条`;
    });
  }
  await test('GET /api/info/distillation（游学资料库）', () => call('GET', '/api/info/distillation?page=1&pageSize=5'), { optional: true });
  await test('GET /api/info/course/list', () => call('GET', '/api/info/course/list?page=1&pageSize=5'), { optional: true });
  await test('GET /api/landmark/list', () => call('GET', '/api/landmark/list?page=1&pageSize=5'), { optional: true });

  /* ---------------- 货源 ---------------- */
  section('4. 货源板块');
  const sourceFeed = await test('GET /api/source/feed（推荐流）', async () => {
    const r = await call('GET', '/api/source/feed?page=1&pageSize=10&styleTags=法式');
    has(r.data.list, '返回空列表');
    return `首条：${String(r.data.list[0].title).slice(0, 30)} ¥${r.data.list[0].priceRange}`;
  });
  const firstProduct = sourceFeed?.data?.list?.[0];
  if (firstProduct) {
    await test(`GET /api/source/detail/${firstProduct.id}`, async () => {
      const r = await call('GET', `/api/source/detail/${firstProduct.id}`);
      ok(typeof r.data.contactRate === 'number', '缺少 contactRate（加微转化率）');
      ok(Array.isArray(r.data.related), '缺少 related（相似款）');
      return `加微率 ${r.data.contactRate} / 相似款 ${r.data.related.length}`;
    });
  }
  await test('GET /api/source/manufacturers', () => call('GET', '/api/source/manufacturers?page=1&pageSize=5'), { optional: true });

  /* ---------------- 加微（货源→厂家看板） ---------------- */
  section('5. 加微追踪 → 厂家看板');
  let contactsBefore = null;
  await test('GET /api/manufacturer/contact/dashboard（登录前基线）', async () => {
    // 用厂家身份查基线
    const mLogin = await call('POST', '/api/auth/login', { demoUserId: manufacturer.id }, { auth: false });
    const r = await call('GET', '/api/manufacturer/contact/dashboard', undefined, { auth: false });
    void mLogin;
    return r;
  }, { optional: true });

  if (firstProduct) {
    await test('POST /api/contact/log（店主点击加微信）', async () => {
      const r = await call('POST', '/api/contact/log', {
        manufacturerId: firstProduct.manufacturerId ?? manufacturer.id,
        productId: firstProduct.id,
        source: 'product_detail',
      });
      ok(r.data.logged !== false, '未记录加微');
      ok(r.data.wechatId, '未返回微信号');
      return `微信号 ${r.data.wechatId} / 联动入口 ${(r.data.suggestions ?? []).length} 个`;
    });
    contactsBefore = true;
  }

  await test('POST /api/manufacturer/contact/send（配额限制）', async () => {
    const mLogin = await call('POST', '/api/auth/login', { demoUserId: manufacturer.id }, { auth: false });
    const savedToken = token;
    const r = await fetch(`${BASE}/api/manufacturer/contact/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mLogin.data.token}` },
      body: JSON.stringify({ shopOwnerId: owner.id, content: '冒烟测试：我们新到了一批韩系外套，要不要看图册？' }),
    });
    const body = await r.json();
    token = savedToken;
    ok(body.code === 0, `code=${body.code} ${body.message}`);
    return body.data.sent ? `已发送，剩余配额 ${body.data.remainingQuota}` : `被配额拦截：${body.data.reason}`;
  });

  await test('GET /api/manufacturer/contact/dashboard（曝光/加微/转化率）', async () => {
    const mLogin = await call('POST', '/api/auth/login', { demoUserId: manufacturer.id }, { auth: false });
    const r = await fetch(`${BASE}/api/manufacturer/contact/dashboard`, {
      headers: { Authorization: `Bearer ${mLogin.data.token}` },
    });
    const body = await r.json();
    ok(body.code === 0, `code=${body.code} ${body.message}`);
    ok(typeof body.data.exposure === 'number', '缺少 exposure');
    ok(typeof body.data.contactRate === 'number', '缺少 contactRate');
    return `曝光 ${body.data.exposure} / 加微 ${body.data.contacts} / 转化率 ${body.data.contactRate}`;
  });

  /* ---------------- 互动写链路 ---------------- */
  section('6. UGC 发布 → 互动 → 通知 → 私信');
  let publishedId = null;
  await test('POST /api/content/publish（发布图文）', async () => {
    const r = await call('POST', '/api/content/publish', {
      board: 'info',
      contentType: 'image_text',
      title: `冒烟测试内容 ${new Date().toISOString().slice(11, 19)}`,
      content: '这是冒烟测试自动发布的内容，用于验证发布→审核→互动链路是否打通。#冒烟测试 @小满',
      images: ['https://picsum.photos/seed/smoke-post-1/800/600'],
      styleTags: ['韩系'],
      topics: ['冒烟测试'],
      visibility: 'public',
    });
    ok(r.data.id, '未返回内容 id');
    publishedId = r.data.id;
    return `id=${r.data.id} auditStatus=${r.data.auditStatus} 同步审核=${r.data.textAudit?.pass ? '通过' : '不通过'} 媒体任务=${(r.data.mediaTaskIds ?? []).length} 个`;
  });

  await test('POST /api/audit/content（敏感词拦截）', async () => {
    const r = await call('POST', '/api/audit/content', { text: '清仓处理，A货高仿同款，加微信秒发货' }, { auth: false });
    ok(r.data.pass === false, '敏感词竟然通过审核');
    return `pass=false 命中=${JSON.stringify(r.data.hitWords)}`;
  });

  if (publishedId) {
    await test('POST /api/interaction/like（点赞）', async () => {
      const r = await call('POST', '/api/interaction/like', { targetType: 'article', targetId: publishedId });
      ok(r.data.liked !== false, '点赞状态未生效');
      return `likeCount=${r.data.likeCount}`;
    });
    await test('DELETE /api/interaction/like（取消点赞后重新点赞）', async () => {
      await call('DELETE', '/api/interaction/like', { targetType: 'article', targetId: publishedId });
      const r = await call('POST', '/api/interaction/like', { targetType: 'article', targetId: publishedId });
      return `likeCount=${r.data.likeCount}`;
    });
    await test('POST /api/interaction/comment（评论 + @提及）', async () => {
      const r = await call('POST', '/api/interaction/comment', {
        targetType: 'article',
        targetId: publishedId,
        content: '冒烟测试评论：这个组货结构很实用 @小满',
        mentions: [owner.id],
      });
      ok(r.data.id, '未返回评论 id');
      return `commentId=${r.data.id}`;
    });
    await test('GET /api/interaction/comments/article/:id', async () => {
      const r = await call('GET', `/api/interaction/comments/article/${publishedId}?page=1&pageSize=10`);
      has(r.data.list, '评论列表为空');
      return `${r.data.total} 条`;
    });
    await test('POST /api/interaction/collect（收藏到分类夹）', async () => {
      const r = await call('POST', '/api/interaction/collect', { targetType: 'article', targetId: publishedId, folderName: '冒烟测试夹' });
      ok(r.data.collected !== false, '收藏未生效');
      return `collectCount=${r.data.collectCount}`;
    });
    await test('POST /api/interaction/share（转发记录）', () =>
      call('POST', '/api/interaction/share', { targetType: 'article', targetId: publishedId, channel: 'wechat' }));
    await test('POST /api/interaction/follow（关注厂家）', async () => {
      const r = await call('POST', '/api/interaction/follow', { userId: manufacturer.id });
      ok(r.data.followed !== false, '关注未生效');
      return 'followed=true';
    });
    await test('PUT /api/content/:id/top（置顶）', () => call('PUT', `/api/content/${publishedId}/top`));
    await test('GET /api/content/:id/analytics（内容看板）', async () => {
      const r = await call('GET', `/api/content/${publishedId}/analytics`);
      ok(typeof r.data.viewCount === 'number', '缺少 viewCount');
      ok(Array.isArray(r.data.trafficSource), '缺少 trafficSource');
      return `浏览 ${r.data.viewCount} / 来源 ${r.data.trafficSource.length} 项`;
    });
    await test('GET /api/content/my（我的内容）', async () => {
      const r = await call('GET', '/api/content/my?board=info&page=1&pageSize=10');
      has(r.data.list, '我的内容为空');
      return `${r.data.total} 条`;
    });
    await test('PUT /api/content/:id（7 天内可编辑）', () =>
      call('PUT', `/api/content/${publishedId}`, { content: '冒烟测试：编辑后的正文内容。' }));
    await test('POST/GET/DELETE /api/content/draft（草稿箱）', async () => {
      const saved = await call('POST', '/api/content/draft', {
        board: 'info',
        contentType: 'image_text',
        title: '冒烟测试草稿',
        content: '草稿正文',
        styleTags: ['法式'],
      });
      ok(saved.data.id, '未返回草稿 id');
      const list = await call('GET', '/api/content/draft');
      has(list.data, '草稿列表为空');
      await call('DELETE', `/api/content/draft/${saved.data.id}`);
      return `草稿 ${list.data.length} 条`;
    });
  }

  await test('GET /api/notification/list', () => call('GET', '/api/notification/list?page=1&pageSize=10'));
  await test('GET /api/notification/unread-count', async () => {
    const r = await call('GET', '/api/notification/unread-count');
    ok(typeof r.data.total === 'number', '缺少 total');
    return `通知 ${r.data.notification} / 私信 ${r.data.message} / 合计 ${r.data.total}`;
  });
  await test('PUT /api/notification/read-all（全部已读）', () => call('PUT', '/api/notification/read-all'));
  await test('GET /api/message/conversations', async () => {
    const r = await call('GET', '/api/message/conversations');
    return `${Array.isArray(r.data) ? r.data.length : 0} 个会话`;
  });
  await test('POST /api/message/send（私信厂家）', async () => {
    const r = await call('POST', '/api/message/send', {
      receiverId: manufacturer.id,
      contentType: 'text',
      content: '冒烟测试私信：请问这款起订量能到 20 件吗？',
    });
    ok(r.data.id, '未返回消息 id');
    return `messageId=${r.data.id}`;
  });

  /* ---------------- 功能板块 ---------------- */
  section('7. 功能板块（10 个工具 + AI 网关）');
  const tools = [
    ['rewrite', { text: '这款碎花连衣裙面料很舒服，版型显瘦，适合通勤穿。', style: '法式', tone: '种草', platform: 'xiaohongshu' }],
    ['trending', { style: '韩系', platform: 'xiaohongshu' }],
    ['remove-watermark', { url: 'https://v.douyin.com/iSmokeTest/' }],
    ['account-analysis', { accountUrl: 'https://www.xiaohongshu.com/user/profile/smoke', platform: 'xiaohongshu' }],
    ['ai-image', { prompt: '法式碎花连衣裙商品主图，米色背景，柔光', style: '法式', ratio: '3:4' }],
    ['remove-bg', { imageUrl: 'https://picsum.photos/seed/smoke-product/800/800' }],
    ['teleprompter', { text: '大家好，今天给大家带来三款秋季必入的韩系外套。' }],
  ];
  const TOOL_PATHS = {
    rewrite: '/api/tools/rewrite',
    trending: '/api/tools/trending',
    'remove-watermark': '/api/tools/remove-watermark',
    'account-analysis': '/api/tools/account-analysis',
    'ai-image': '/api/tools/generate-image',
    'remove-bg': '/api/tools/remove-bg',
    teleprompter: '/api/tools/teleprompter',
  };
  for (const [name, body] of tools) {
    await test(`POST ${TOOL_PATHS[name]}`, async () => {
      const r = await call('POST', TOOL_PATHS[name], body);
      const d = r.data;
      const hasContent = !!(d.text || (d.items && d.items.length) || d.imageUrl || d.attachments?.length);
      ok(hasContent, '结果没有任何内容（text/items/imageUrl 全为空）');
      return `aiPowered=${d.aiPowered} 额度 ${d.quotaUsed}/${d.quotaLimit}${d.notice ? ` · ${String(d.notice).slice(0, 40)}` : ''}`;
    });
  }
  await test('GET /api/tools/quota（今日用量）', () => call('GET', '/api/tools/quota'), { optional: true });

  await test('免费额度用尽返回 429', async () => {
    // account-analysis 免费额度 1 次/日，第二次应被拦截
    for (let i = 0; i < 3; i++) {
      try {
        await call('POST', '/api/tools/account-analysis', { accountUrl: 'https://x.com/smoke', platform: 'douyin' });
      } catch (e) {
        if (e.response?.code === 429) return 'code=429 已正确拦截';
        throw e;
      }
    }
    throw new Error('连续请求 3 次仍未触发额度限制（检查 TOOL_FREE_QUOTA 计数）');
  });

  /* ---------------- 推荐与搜索 ---------------- */
  section('8. 推荐规则引擎与搜索排序');
  await test('规则引擎打散生效（每 10 条至少 2 种风格）', async () => {
    const r = await call('GET', '/api/recommend/feed?board=info&page=1&pageSize=10&styleTags=韩系');
    const list = r.data.list ?? [];
    has(list, '返回空列表');
    const styles = new Set(list.map((x) => (x.styleTags ?? [])[0]).filter(Boolean));
    ok(styles.size >= 2, `10 条内只有 ${styles.size} 种风格，打散未生效`);
    return `${list.length} 条 / ${styles.size} 种风格`;
  });
  await test('GET /api/recommend/meta', () => call('GET', '/api/recommend/meta'), { optional: true });
  await test('GET /api/search（含 scoreBreakdown）', async () => {
    const r = await call('GET', '/api/search?keyword=碎花&page=1&pageSize=10');
    ok(typeof r.data.total === 'number', '缺少 total');
    const bd = r.data.scoreBreakdown;
    if (bd && bd.length) {
      const s = bd[0];
      return `命中 ${r.data.total} · 首条分解 基础${s.base}/表现${s.performance}/反馈${s.feedback}/整体${s.overall} → ${s.total}`;
    }
    return `命中 ${r.data.total}（未返回 scoreBreakdown）`;
  });
  await test('GET /api/search/hot-keywords', () => call('GET', '/api/search/hot-keywords'), { optional: true });

  /* ---------------- 组局 ---------------- */
  section('9. 拼单 / 订货会 / 话题');
  let groupBuyId = null;
  await test('POST /api/groupbuy/create', async () => {
    const r = await call('POST', '/api/groupbuy/create', {
      title: '冒烟测试拼单：韩系外套凑 20 件',
      description: '冒烟测试自动创建',
      targetCount: 20,
      styleTag: '韩系',
      market: '十三行',
      deadlineAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    });
    ok(r.data.id, '未返回拼单 id');
    groupBuyId = r.data.id;
    return `id=${r.data.id} 状态=${r.data.status}`;
  });
  await test('GET /api/groupbuy/list', async () => {
    const r = await call('GET', '/api/groupbuy/list?page=1&pageSize=10');
    has(r.data.list, '拼单广场为空');
    return `${r.data.total} 个拼单`;
  });
  if (groupBuyId) {
    await test(`POST /api/groupbuy/join/${groupBuyId}`, async () => {
      const r = await call('POST', `/api/groupbuy/join/${groupBuyId}`);
      return `当前人数 ${r.data.currentCount}/${r.data.targetCount}`;
    });
  }
  await test('GET /api/ordering-fair/list', () => call('GET', '/api/ordering-fair/list?page=1&pageSize=10'), { optional: true });
  await test('GET /api/topic/list', async () => {
    const r = await call('GET', '/api/topic/list?page=1&pageSize=10');
    has(r.data.list, '话题榜为空');
    return `${r.data.total} 个话题`;
  }, { optional: true });

  /* ---------------- 审核与后台 ---------------- */
  section('10. 内容审核与运营后台');
  await test('GET /api/audit/queue（人工复审队列）', async () => {
    const r = await call('GET', '/api/audit/queue?page=1&pageSize=10&reviewStatus=manual_pending');
    return `待复审 ${r.data.total} 条`;
  }, { optional: true });
  await test('POST /api/audit/callback（异步媒体审核回调）', async () => {
    const r = await call('POST', '/api/audit/callback', {
      ToUserName: 'gh_smoke',
      FromUserName: 'o_smoke_user',
      CreateTime: Math.floor(Date.now() / 1000),
      MsgType: 'event',
      Event: 'wxa_media_check',
      trace_id: `smoke-${Date.now()}`,
      result: { suggest: 'risky', label: 20001 },
    }, { auth: false });
    ok(r.data.ok !== false, '回调未被接受');
    return r.data.message ?? 'ok';
  });
  await test('GET /api/audit/callback（微信 URL 校验回显 echostr）', async () => {
    const res = await fetch(`${BASE}/api/audit/callback?echostr=smoke-echo-123`);
    const text = await res.text();
    ok(text.includes('smoke-echo-123'), `未回显 echostr，实际返回：${text.slice(0, 80)}`);
    return 'echostr 已回显';
  });

  // 后台需要 admin 身份
  const adminUser = accounts.data.find((u) => u.role === 'admin');
  ok(adminUser, '演示数据缺少 admin');
  const adminLogin = await call('POST', '/api/auth/login', { demoUserId: adminUser.id }, { auth: false });
  const adminToken = adminLogin.data.token;
  const asAdmin = async (path, init) => {
    const res = await fetch(`${BASE}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, ...(init?.headers ?? {}) } });
    return res.json();
  };

  await test('GET /api/admin/overview（含核心指标 KPI）', async () => {
    const body = await asAdmin('/api/admin/overview');
    ok(body.code === 0, `code=${body.code} ${body.message}`);
    has(body.data.kpi, '缺少 kpi 数组');
    const kpi = body.data.kpi.map((k) => `${k.label}=${k.value}${k.unit}${k.pass ? '✓' : '✗'}`).join(' ');
    return kpi.slice(0, 150);
  });
  await test('GET /api/admin/users', async () => {
    const body = await asAdmin('/api/admin/users?page=1&pageSize=10');
    ok(body.code === 0, `code=${body.code} ${body.message}`);
    has(body.data.list, '用户列表为空');
    return `${body.data.total} 人`;
  });

  /* ---------------- 多模块联动 ---------------- */
  section('11. 三模块联动闭环（资讯→货源→功能→资讯）');
  if (firstArticle) {
    await test('资讯详情返回 relatedProducts（资讯→货源）', async () => {
      const r = await call('GET', `/api/info/detail/${firstArticle.id}`);
      has(r.data.relatedProducts, 'relatedProducts 为空');
      return `${r.data.relatedProducts.length} 个关联款`;
    });
  }
  if (firstProduct) {
    await test('款详情返回 toolEntries（货源→功能）', async () => {
      const r = await call('GET', `/api/source/detail/${firstProduct.id}`);
      has(r.data.toolEntries, 'toolEntries 为空');
      return r.data.toolEntries.map((t) => t.label).join(' / ');
    });
  }
  await test('工具结果返回 recommendedArticles（功能→资讯）', async () => {
    const r = await call('POST', '/api/tools/trending', { style: '韩系', platform: 'xiaohongshu' });
    has(r.data.recommendedArticles, 'recommendedArticles 为空');
    return `${r.data.recommendedArticles.length} 篇推荐阅读`;
  });

  report();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n${c.red('冒烟测试异常终止：')} ${e.message}`);
  console.error(e.stack);
  process.exit(1);
});
