/**
 * 验收证据采集脚本（Lead 用）
 * 汇总 PRD 三大模块与核心指标的可复现证据，输出到 stdout。
 *
 * 用法：node scripts/acceptance-evidence.mjs [baseUrl]
 */
const B = (process.argv[2] || 'http://localhost:3120').replace(/\/$/, '');

const j = async (path, init) => {
  const res = await fetch(B + path, init);
  return res.json();
};
const post = (path, body, token) =>
  j(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
const get = (path, token) => j(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

const line = (s = '') => console.log(s);

async function main() {
  line(`\n验收证据采集  →  ${B}\n${'='.repeat(70)}`);

  // ---------- 登录 ----------
  const owner = (await post('/api/auth/login', { demoUserId: 2 })).data;
  const mf = (await post('/api/auth/login', { demoUserId: 7 })).data;
  const admin = (await post('/api/auth/login', { demoUserId: 1 })).data;
  line(`\n[账号] 店主=${owner.user.nickname}(#${owner.user.id})  厂家=${mf.user.nickname}(#${mf.user.id})  运营=${admin.user.nickname}(#${admin.user.id})`);

  // ---------- 核心指标 ----------
  const o = (await get('/api/admin/overview', admin.token)).data;
  line(`\n[核心指标仪表盘 · PRD 第十三篇]`);
  for (const k of o.kpi) line(`  ${k.pass ? '达成' : '未达'}  ${k.label}: ${k.value}${k.unit}  (目标 ${k.target}${k.unit})`);
  line(`  用户总数 ${o.users.total}（店主 ${o.users.shopOwner} / 厂家 ${o.users.manufacturer} / 大店 ${o.users.landmark}）`);
  line(`  内容 ${o.content.total}（待审 ${o.content.pending} / 驳回 ${o.content.rejected}）  款 ${o.products.total}`);
  line(`  加微 今日 ${o.contacts.today} / 累计 ${o.contacts.total}，转化率 ${(o.contacts.rate * 100).toFixed(2)}%`);
  line(`  MRR ¥${o.revenue.mrr}  版本分布 ${o.revenue.byLevel.map((x) => `${x.level}:${x.count}家/¥${x.amount}`).join('  ')}`);

  // ---------- 资讯推荐 ----------
  const feed = (await get('/api/info/feed?page=1&pageSize=10&styleTags=韩系', owner.token)).data;
  const styles = feed.list.map((a) => (a.styleTags || [])[0]);
  line(`\n[资讯推荐流 · 规则引擎]`);
  line(`  strategy: ${feed.strategy}`);
  line(`  前10条风格: ${styles.join(' , ')}  → 不同风格 ${new Set(styles).size} 种（打散下限 2）`);

  // ---------- 货源推荐 ----------
  const sfeed = (await get('/api/source/feed?page=1&pageSize=10&styleTags=法式', owner.token)).data;
  const ships = sfeed.list.map((p) => p.shipFrom);
  line(`\n[货源推荐流 · 规则引擎]`);
  line(`  strategy: ${sfeed.strategy}`);
  line(`  发货地: ${ships.join(' , ')}  → 不同发货地 ${new Set(ships).size} 种（打散下限 1）`);

  // ---------- 搜索排序 ----------
  const search = (await get('/api/search?keyword=碎花&page=1&pageSize=5', owner.token)).data;
  line(`\n[搜索排序 · 四维加权 25/35/25/15]`);
  line(`  命中 ${search.total}（货源 ${search.products.length} / 资讯 ${search.articles.length}）`);
  for (const s of (search.scoreBreakdown || []).slice(0, 3)) {
    line(`    款#${s.productId}: 基础${s.base} 表现${s.performance} 反馈${s.feedback} 整体${s.overall} → 总分 ${s.total}`);
  }

  // ---------- 三模块联动 ----------
  line(`\n[三模块联动闭环]`);
  const detail = (await get('/api/info/detail/1', owner.token)).data;
  line(`  资讯→货源  relatedProducts: ${(detail.relatedProducts || []).length} 个关联款`);
  const prod = (await get('/api/source/detail/1', owner.token)).data;
  line(`  货源→功能  toolEntries: ${(prod.toolEntries || []).map((t) => t.label).join(' / ')}`);
  const trending = (await post('/api/tools/trending', { style: '韩系' }, owner.token)).data;
  line(`  功能→资讯  recommendedArticles: ${(trending.recommendedArticles || []).length} 篇 | 选题 ${(trending.items || []).length} 条`);
  line(`  选题样例: ${(trending.items || []).slice(0, 2).map((i) => i.title || i.content).join(' ｜ ')}`);

  // ---------- 加微闭环 ----------
  const log = (await post('/api/contact/log', { manufacturerId: mf.user.id, productId: 1, source: 'product_detail' }, owner.token)).data;
  const dash = (await get('/api/manufacturer/contact/dashboard', mf.token)).data;
  line(`\n[加微追踪闭环]`);
  line(`  店主点击加微信 → 返回微信号 ${log.wechatId}，联动入口 ${(log.suggestions || []).length} 个`);
  line(`  厂家看板 → 曝光 ${dash.exposure} / 加微 ${dash.contacts} / 转化率 ${(dash.contactRate * 100).toFixed(2)}%`);
  line(`  转化漏斗: ${dash.funnel ? dash.funnel.map((f) => `${f.stage}=${f.value}`).join(' → ') : 'null（该版本看板等级不足，符合 PRD 9.3）'}`);
  line(`  主动私信配额: 已用 ${dash.quota.used}/${dash.quota.limit}`);

  // ---------- 内容安全 ----------
  const bad = (await post('/api/audit/content', { text: '清仓处理，A货高仿同款，加微信秒发货' })).data;
  const good = (await post('/api/audit/content', { text: '韩系通勤一周穿搭分享，面料舒适版型显瘦' })).data;
  line(`\n[内容安全审核]`);
  line(`  违规文本 → pass=${bad.pass}  命中词=${JSON.stringify(bad.hitWords)}  source=${bad.source}`);
  line(`  正常文本 → pass=${good.pass}`);
  const queue = (await get('/api/audit/queue?reviewStatus=manual_pending&pageSize=5', admin.token)).data;
  line(`  人工复审队列待处理 ${queue.total} 条`);

  // ---------- 发布与互动闭环 ----------
  const pub = (await post('/api/content/publish', {
    board: 'info',
    contentType: 'image_text',
    title: '验收脚本自动发布：韩系通勤组货复盘',
    content: '这是验收脚本发布的内容，用于验证发布→审核→互动→通知闭环。#验收',
    images: ['https://picsum.photos/seed/accept-1/800/600'],
    styleTags: ['韩系'],
    visibility: 'public',
  }, owner.token)).data;
  line(`\n[发布 → 审核]`);
  line(`  内容 #${pub.id}  auditStatus=${pub.auditStatus}  同步审核 pass=${pub.textAudit?.pass}  异步媒体任务 ${(pub.mediaTaskIds || []).length} 个`);
  line(`  提示: ${pub.message}`);

  const like = (await post('/api/interaction/like', { targetType: 'article', targetId: pub.id }, mf.token)).data;
  const comment = (await post('/api/interaction/comment', { targetType: 'article', targetId: pub.id, content: '验收脚本评论：结构清晰，已收藏。' }, mf.token)).data;
  const follow = (await post('/api/interaction/follow', { userId: owner.user.id }, mf.token)).data;
  const unread = (await get('/api/notification/unread-count', owner.token)).data;
  const dm = (await post('/api/message/send', { receiverId: owner.user.id, contentType: 'text', content: '验收脚本私信：这款能给个长期价吗？' }, mf.token)).data;
  line(`\n[互动 → 通知 → 私信]`);
  line(`  厂家点赞 → likeCount=${like.likeCount}   评论 #${comment.id}   关注 → followed=${follow.followed}`);
  line(`  店主未读数 → 通知 ${unread.notification} / 私信 ${unread.message} / 合计 ${unread.total}`);
  line(`  私信发送 → messageId=${dm.id} conversationId=${dm.conversationId}`);

  const analytics = (await get(`/api/content/${pub.id}/analytics`, owner.token)).data;
  line(`  内容数据看板 → 浏览 ${analytics.viewCount} 赞 ${analytics.likeCount} 藏 ${analytics.collectCount} 评 ${analytics.commentCount} 转发 ${analytics.shareCount} 加微 ${analytics.contactCount} 粉丝增长 ${analytics.followerGain}`);
  line(`  流量来源: ${analytics.trafficSource.map((t) => `${t.source} ${t.percent}%`).join(' / ')}`);

  // ---------- 路由统计 ----------
  const routes = (await get('/api/routes')).data;
  line(`\n[接口覆盖] 已挂载路由 ${routes.length} 条`);
  const byPrefix = {};
  for (const r of routes) {
    const p = r.path.split('/').slice(0, 3).join('/');
    byPrefix[p] = (byPrefix[p] || 0) + 1;
  }
  line(`  ${Object.entries(byPrefix).map(([k, v]) => `${k}=${v}`).join('  ')}`);

  line(`\n${'='.repeat(70)}\n`);
}

main().catch((e) => {
  console.error('采集失败:', e.message);
  process.exit(1);
});
