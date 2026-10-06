import { chromium } from 'playwright';

const BASE = 'http://localhost:8099';
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/#/pages/index/index`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

const out = await page.evaluate(() => {
  const el = document.querySelector('.taro_page');
  if (!el) return { error: 'no .taro_page' };
  const cs = getComputedStyle(el);
  const parent = el.parentElement;
  const pcs = parent ? getComputedStyle(parent) : null;
  // 收集所有影响 .taro_page 的 margin/max-width/width 声明
  const hits = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let list;
    try { list = sheet.cssRules; } catch { continue; }
    const scan = (rules, prefix = '') => {
      for (const r of Array.from(rules ?? [])) {
        if (r.media && r.cssRules) { scan(r.cssRules, `@media ${r.conditionText} `); continue; }
        if (!r.selectorText) continue;
        if (!/\.taro_page\b/.test(r.selectorText)) continue;
        const s = r.style;
        const parts = [];
        for (const k of ['width', 'max-width', 'margin', 'margin-left', 'margin-right']) {
          if (s.getPropertyValue(k)) parts.push(`${k}:${s.getPropertyValue(k)}${s.getPropertyPriority(k) === 'important' ? ' !important' : ''}`);
        }
        if (parts.length) hits.push(`${prefix}${r.selectorText} { ${parts.join('; ')} }`);
      }
    };
    scan(list);
  }
  return {
    devicePixelRatio: window.devicePixelRatio,
    innerWidth: window.innerWidth,
    rootFontSize: getComputedStyle(document.documentElement).fontSize,
    computed: {
      width: cs.width, maxWidth: cs.maxWidth, margin: cs.margin, marginLeft: cs.marginLeft,
      display: cs.display, position: cs.position, flex: cs.flex,
    },
    rect: (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width) }; })(),
    parent: parent ? { tag: parent.tagName, cls: parent.className, display: pcs.display, width: pcs.width } : null,
    matchingRules: hits,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
