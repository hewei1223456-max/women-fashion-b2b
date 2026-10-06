import { chromium } from 'playwright';

const BASE = 'http://localhost:8099';
const API = 'http://localhost:3100';
const acc = await (await fetch(`${API}/api/auth/demo-accounts`)).json();
const owner = acc.data.find((u) => u.role === 'shop_owner');
const login = await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demoUserId: owner.id }) })).json();

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(([t, u]) => {
  localStorage.setItem('wfb_token', JSON.stringify({ data: t }));
  localStorage.setItem('wfb_user', JSON.stringify({ data: u }));
}, [login.data.token, JSON.stringify(login.data.user)]);
const page = await ctx.newPage();
await page.goto(`${BASE}/#/pages/index/index`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

const out = await page.evaluate(() => {
  const el = document.querySelector('.taro_page');
  const htmlFS = getComputedStyle(document.documentElement).fontSize;
  const bodyFS = getComputedStyle(document.body).fontSize;
  const elFS = el ? getComputedStyle(el).fontSize : null;
  const inline = el ? el.getAttribute('style') : null;

  // 找出所有命中的 .taro_page 规则
  const rules = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let list;
    try { list = sheet.cssRules; } catch { continue; }
    for (const r of Array.from(list ?? [])) {
      if (r.selectorText && /taro_page|^page\b/.test(r.selectorText)) {
        rules.push(r.cssText.slice(0, 400));
      }
      // 媒体查询里的
      if (r.media && r.cssRules) {
        for (const rr of Array.from(r.cssRules)) {
          if (rr.selectorText && /taro_page/.test(rr.selectorText)) {
            rules.push(`@media ${r.conditionText} { ${rr.cssText.slice(0, 300)} }`);
          }
        }
      }
    }
  }
  // Taro 的 rem 基准脚本
  const scripts = Array.from(document.querySelectorAll('script')).map((s) => (s.textContent || '').slice(0, 200)).filter((t) => t.includes('fontSize') || t.includes('clientWidth'));
  return {
    htmlFontSize: htmlFS,
    bodyFontSize: bodyFS,
    taroPageFontSize: elFS,
    taroPageInlineStyle: inline,
    taroPageWidth: el ? Math.round(el.getBoundingClientRect().width) : null,
    devicePixelRatio: window.devicePixelRatio,
    matchedRules: rules,
    scaleScripts: scripts.slice(0, 3),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
