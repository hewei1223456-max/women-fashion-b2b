/**
 * 公网导航耗时归因
 *
 * 关注点：用户点一个 Tab 后，到底在等什么？
 *   - 等 JS chunk 下载？（Taro 分包按需加载，chunk 没预取就会「点了才下载」）
 *   - 等 API？（实测只有 1-2ms）
 *   - 还是渲染本身慢？
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'https://switched-fold-thou-messages.trycloudflare.com';
const API = process.env.API || 'http://localhost:3100';

const now = () => Date.now();

const login = await (await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ demoUserId: 2 }),
})).json();

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.addInitScript(
  ([t, u]) => {
    localStorage.setItem('wfb_token', JSON.stringify({ data: t }));
    localStorage.setItem('wfb_user', JSON.stringify({ data: u }));
  },
  [login.data.token, JSON.stringify(login.data.user)],
);
const page = await ctx.newPage();

let phase = '首屏';
const log = [];
page.on('response', async (r) => {
  const url = r.url();
  if (!url.startsWith(BASE) || !/\.(js|css)$/.test(url)) return;
  try {
    const buf = await r.body();
    log.push({ phase, url: url.replace(BASE, ''), bytes: buf.length, status: r.status() });
  } catch { /* ignore */ }
});

console.log('=== 首屏（公网）===');
const t0 = now();
await page.goto(`${BASE}/#/pages/index/index`, { waitUntil: 'load', timeout: 90000 });
console.log(`  load: ${now() - t0}ms`);
await page.waitForTimeout(4000);
const first = log.filter((x) => x.phase === '首屏');
console.log(`  首屏下载: ${first.length} 个文件 / ${(first.reduce((s, x) => s + x.bytes, 0) / 1024).toFixed(0)}KB`);

const tabs = [
  { label: '货源', expect: '拿货价' },
  { label: '功能', expect: '文案改写' },
  { label: '我的', expect: '我的' },
];
for (const tab of tabs) {
  phase = tab.label;
  const t = now();
  await page.locator(`text="${tab.label}"`).last().click({ timeout: 15000 }).catch(() => {});
  let appeared = -1;
  for (let i = 0; i < 300; i++) {
    const txt = await page.locator('body').innerText().catch(() => '');
    if (txt.includes(tab.expect)) { appeared = now() - t; break; }
    await page.waitForTimeout(100);
  }
  const dl = log.filter((x) => x.phase === tab.label);
  const bytes = dl.reduce((s, x) => s + x.bytes, 0);
  console.log(`\n=== 切到「${tab.label}」===`);
  console.log(`  点 → 内容出现: ${appeared < 0 ? '超时 >30s' : appeared + 'ms'}`);
  console.log(`  这一跳新下载: ${dl.length} 个文件 / ${(bytes / 1024).toFixed(0)}KB`);
  for (const d of dl.slice(0, 8)) console.log(`    ${(d.bytes / 1024).toFixed(0).padStart(5)}KB  ${d.url}`);
  if (dl.length > 8) console.log(`    …还有 ${dl.length - 8} 个`);
  await page.waitForTimeout(800);
}

await browser.close();
