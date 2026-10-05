import { chromium } from 'playwright';

const API = 'http://localhost:3100';
const ADMIN = process.env.ADMIN_URL || 'http://localhost:3101';

const acc = await (await fetch(`${API}/api/auth/demo-accounts`)).json();
const admin = acc.data.find((u) => u.role === 'admin');
const owner = acc.data.find((u) => u.role === 'shop_owner');
const login = await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demoUserId: admin.id }) })).json();
const ownerLogin = await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demoUserId: owner.id }) })).json();
console.log('运营账号:', login.data.user.nickname, '| 店主账号:', ownerLogin.data.user.nickname);

const PAGES = [
  { name: '登录页', path: '/login', expect: ['选择演示账号登录', '平台运营', '运营后台'] },
  { name: '数据概览', path: '/', expect: ['数据概览', '核心指标', '用户总数'] },
  { name: '内容复审', path: '/audit', expect: ['复审队列', '机审结论'] },
  { name: '用户管理', path: '/users', expect: ['用户管理', '角色'] },
  { name: '认证审批', path: '/cert', expect: ['认证审批', '待审核'] },
  { name: '厂家与加微', path: '/manufacturers', expect: ['加微', '版本权益'] },
  { name: '推荐策略', path: '/recommend', expect: ['推荐策略', 'CES', '搜索排序'] },
  { name: '内容与互动', path: '/content', expect: ['内容', '话题'] },
];

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
await ctx.addInitScript(
  ([token, user]) => {
    // 后台直接用 localStorage 裸键（apps/admin/src/lib/api.ts 的 browserStorage）
    localStorage.setItem('wfb_token', token);
    localStorage.setItem('wfb_admin', user);
  },
  [login.data.token, JSON.stringify({ id: login.data.user.id, nickname: login.data.user.nickname, role: login.data.user.role })],
);

let pass = 0;
const fails = [];
for (const spec of PAGES) {
  const page = await ctx.newPage();
  const errs = [];
  const apiFails = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) apiFails.push(`${r.status()} ${r.url().replace(ADMIN, '').replace(API, '')}`);
  });
  try {
    await page.goto(`${ADMIN}${spec.path}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(2500);
    const text = (await page.locator('body').innerText()) || '';
    const hit = spec.expect.filter((k) => text.includes(k));
    const ok = hit.length >= Math.min(2, spec.expect.length);
    if (ok) {
      pass++;
      console.log(`\x1b[32mPASS\x1b[0m ${spec.name.padEnd(12)} ${text.length}字  命中[${hit.join(',')}]`);
    } else {
      fails.push(`${spec.name} 命中[${hit.join(',')}]`);
      console.log(`\x1b[31mFAIL\x1b[0m ${spec.name.padEnd(12)} 命中[${hit.join(',')}]  文本:${text.slice(0, 100).replace(/\n+/g, ' | ')}`);
    }
    if (errs.length) console.log(`     \x1b[33mjsError: ${errs[0]}\x1b[0m`);
    if (apiFails.length) console.log(`     \x1b[33mAPI: ${[...new Set(apiFails)].slice(0, 2).join(' | ')}\x1b[0m`);
    await page.screenshot({ path: `docs/screenshots/admin-${spec.name}.png`, fullPage: false });
  } catch (e) {
    fails.push(`${spec.name} 打开失败: ${e.message}`);
    console.log(`\x1b[31mFAIL\x1b[0m ${spec.name} ${e.message}`);
  } finally {
    await page.close();
  }
}

console.log(`\n后台校验：通过 ${pass}/${PAGES.length}`);
if (fails.length) for (const f of fails) console.log('  -', f);
await browser.close();
process.exit(fails.length ? 1 : 0);
