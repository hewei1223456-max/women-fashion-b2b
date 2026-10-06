/**
 * 导航性能测量
 *
 * 用户反馈「电脑版和手机版打开都很卡，要等很久才能跳转下一个界面」。
 * 这个脚本把一次「切换 Tab」拆成可归因的耗时：
 *   ① API 响应耗时（后端慢？）
 *   ② 首屏 JS/CSS 加载（包太大？）
 *   ③ 点击到目标页文本出现的耗时（渲染慢？路由慢？）
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8099';
const API = process.env.API || 'http://localhost:3100';

const now = () => Date.now();

async function main() {
  /* ---------- ① 后端接口耗时 ---------- */
  const login = await (await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ demoUserId: 2 }),
  })).json();
  const token = login.data.token;
  const auth = { Authorization: `Bearer ${token}` };

  const endpoints = [
    '/api/info/feed?page=1&pageSize=10',
    '/api/source/feed?page=1&pageSize=10',
    '/api/meetup/list?pageSize=5',
    '/api/notification/unread-count',
    '/api/recommend/meta',
    '/api/tools/quota',
  ];
  console.log('=== ① 后端接口耗时（本地，3 次取样取最小）===');
  for (const ep of endpoints) {
    const times = [];
    for (let i = 0; i < 3; i++) {
      const t = now();
      await fetch(`${API}${ep}`, { headers: auth });
      times.push(now() - t);
    }
    console.log(`  ${String(Math.min(...times)).padStart(5)}ms  ${ep}`);
  }

  /* ---------- ② 静态资源体积与耗时 ---------- */
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(
    ([t, u]) => {
      localStorage.setItem('wfb_token', JSON.stringify({ data: t }));
      localStorage.setItem('wfb_user', JSON.stringify({ data: u }));
    },
    [token, JSON.stringify(login.data.user)],
  );
  const page = await ctx.newPage();

  const resources = [];
  page.on('response', async (r) => {
    try {
      const url = r.url();
      if (!url.includes(BASE)) return;
      const len = Number(r.headers()['content-length'] || 0);
      resources.push({ url: url.replace(BASE, ''), status: r.status(), len });
    } catch { /* ignore */ }
  });

  const t0 = now();
  await page.goto(`${BASE}/#/pages/index/index`, { waitUntil: 'load', timeout: 60000 });
  const loadMs = now() - t0;
  await page.waitForTimeout(3000);

  console.log(`\n=== ② 首屏加载 ===`);
  console.log(`  load 事件: ${loadMs}ms`);
  const big = resources.filter((r) => r.len > 50000).sort((a, b) => b.len - a.len);
  console.log(`  资源数: ${resources.length}，其中 >50KB 的 ${big.length} 个：`);
  for (const r of big.slice(0, 10)) console.log(`    ${(r.len / 1024).toFixed(0).padStart(6)}KB  ${r.url}`);
  const total = resources.reduce((s, r) => s + r.len, 0);
  console.log(`  合计(有 content-length 的): ${(total / 1024).toFixed(0)}KB`);

  /* ---------- ③ 切换 Tab 的耗时 ---------- */
  console.log(`\n=== ③ Tab 切换耗时（点击 → 目标内容出现）===`);
  const tabs = [
    { label: '货源', expect: '拿货价' },
    { label: '功能', expect: '文案改写' },
    { label: '我的', expect: '我的' },
    { label: '资讯', expect: '同行在聊什么' },
  ];
  for (const tab of tabs) {
    const t = now();
    // Taro H5 的 tabbar 是自绘的，按文本找
    const el = page.locator(`text="${tab.label}"`).last();
    await el.click({ timeout: 10000 }).catch(() => {});
    let appeared = -1;
    for (let i = 0; i < 100; i++) {
      const txt = await page.locator('body').innerText().catch(() => '');
      if (txt.includes(tab.expect)) { appeared = now() - t; break; }
      await page.waitForTimeout(100);
    }
    console.log(`  ${tab.label.padEnd(4)} → ${appeared < 0 ? '内容未出现(超时 10s)' : appeared + 'ms'}`);
    await page.waitForTimeout(600);
  }

  /* ---------- ④ 原生性能指标 ---------- */
  const perf = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const paints = performance.getEntriesByType('paint').map((p) => ({ name: p.name, t: Math.round(p.startTime) }));
    return {
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
      loadEvent: Math.round(nav.loadEventEnd || 0),
      transferSize: nav.transferSize,
      paints,
      scriptCount: document.querySelectorAll('script[src]').length,
      styleCount: document.querySelectorAll('link[rel=stylesheet]').length,
    };
  });
  console.log(`\n=== ④ 浏览器性能指标 ===`);
  console.log(JSON.stringify(perf, null, 1));

  await browser.close();
}

main().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});
