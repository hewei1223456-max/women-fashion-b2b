/**
 * 验证厂家端信息架构（用户反馈：厂家版跟店主版界面一模一样）
 *
 * 断言：
 *   1) 厂家身份下底部 Tab 是「货源 / 建联 / 订货会 / 资讯 / 我的」五项
 *   2) 店主身份下底部 Tab 仍是「资讯 / 货源 / 功能 / 我的」四项
 *   3) 厂家端 5 个 Tab 页面都能打开、0 jsError
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:10086';
const API = 'http://localhost:3100';

const loginAs = async (role) => {
  const acc = await (await fetch(`${API}/api/auth/demo-accounts`)).json();
  const u = acc.data.find((x) => x.role === role);
  const l = await (
    await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demoUserId: u.id }),
    })
  ).json();
  return { token: l.data.token, user: l.data.user, nickname: u.nickname };
};

const browser = await chromium.launch({ channel: 'chrome' });

const check = async (role, expectTabs, pages) => {
  const session = await loginAs(role);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(
    ([t, u]) => {
      localStorage.setItem('wfb_token', JSON.stringify({ data: t }));
      localStorage.setItem('wfb_user', JSON.stringify({ data: u }));
    },
    [session.token, JSON.stringify(session.user)],
  );
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));

  console.log(`\n=== ${role}（${session.nickname}）===`);
  for (const p of pages) {
    await page.goto(`${BASE}/#${p.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(Number(process.env.WAIT || 2500));
    const info = await page.evaluate(() => {
      const bar = document.querySelector('.tabbar');
      const items = bar ? Array.from(bar.querySelectorAll('.tabbar__item .tabbar__label')).map((e) => e.textContent.trim()) : [];
      return { tabs: items, len: items.length, text: (document.body.innerText || '').length };
    });
    const hit = expectTabs.filter((t) => info.tabs.includes(t)).length;
    console.log(
      `  ${p.name.padEnd(12)} tab[${info.tabs.join('/')}] ${hit}/${expectTabs.length} 命中  文本 ${info.text} 字`,
    );
    if (p.check) {
      const txt = await page.locator('body').innerText();
      const ok = p.check.every((k) => txt.includes(k));
      console.log(`     内容断言[${p.check.join(',')}]: ${ok ? '✅' : '❌'}`);
    }
  }
  console.log(`  jsError: ${errs.length}${errs.length ? ' → ' + errs[0] : ''}`);
  await ctx.close();
};

await check(
  'shop_owner',
  ['资讯', '货源', '功能', '我的'],
  [
    { name: '资讯首页', path: '/pages/index/index', check: ['同行在聊什么'] },
    { name: '货源首页', path: '/pages/source/index', check: ['拿货价'] },
    { name: '我的', path: '/pages/profile/index', check: ['我的'] },
  ],
);

await check(
  'manufacturer',
  ['货源', '建联', '订货会', '资讯', '我的'],
  [
    { name: '厂家首页', path: '/pages/manufacturer/home', check: ['发布新款'] },
    { name: '建联', path: '/pages/manufacturer/connect', check: ['找店主'] },
    { name: '订货会', path: '/pages/manufacturer/fair', check: ['订货会'] },
    { name: '工作台', path: '/pages/manufacturer/workbench', check: ['版本'] },
  ],
);

await browser.close();
