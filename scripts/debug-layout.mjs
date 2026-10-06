import { chromium } from 'playwright';

const BASE = 'http://localhost:8099';
const API = 'http://localhost:3100';

const acc = await (await fetch(`${API}/api/auth/demo-accounts`)).json();
const owner = acc.data.find((u) => u.role === 'shop_owner');
const login = await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demoUserId: owner.id }) })).json();

const browser = await chromium.launch({ channel: 'chrome' });
for (const [w, h, tag] of [[2560, 1400, '2560-宽屏'], [1440, 900, '1440-桌面']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(([t, u]) => {
    localStorage.setItem('wfb_token', JSON.stringify({ data: t }));
    localStorage.setItem('wfb_user', JSON.stringify({ data: u }));
  }, [login.data.token, JSON.stringify(login.data.user)]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/pages/tools/index`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const info = await page.evaluate(() => {
    const el = (sel) => document.querySelector(sel);
    const box = (sel) => { const e = el(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) }; };
    const cs = (sel) => { const e = el(sel); return e ? getComputedStyle(e).maxWidth + ' / margin:' + getComputedStyle(e).marginLeft : null; };
    return {
      innerWidth: window.innerWidth,
      bodyScrollWidth: document.body.scrollWidth,
      taroPage: box('.taro_page'),
      taroPageStyle: cs('.taro_page'),
      firstChildOfTaroPage: el('.taro_page')?.firstElementChild?.className ?? null,
      firstChildBox: box('.taro_page > *'),
      pageSafe: box('.page-safe'),
      app: box('#app'),
      htmlLen: document.documentElement.scrollWidth,
    };
  });
  console.log(`\n=== ${tag} ===`);
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: `docs/screenshots/__debug-${tag}.png` });
  await ctx.close();
}
await browser.close();
