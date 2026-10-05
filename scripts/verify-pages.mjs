/**
 * 前端逐页运行时校验（Lead 终验用）
 *
 * 两个必须遵守的调用约定（都会导致「全部页面看起来像首页」的假象）：
 *   1. Taro H5 用 **hash 路由**，页面地址是 `/#/pages/xxx/yyy`，直接请求 `/pages/xxx/yyy` 只会拿到壳。
 *   2. 登录态要按 **Taro 的存储包裹格式** 写入：`localStorage['wfb_token'] = JSON.stringify({data: token})`，
 *      写成裸字符串会被 H5 的存储层当作非法值，导致请求不带 Authorization（曾因此误判为产品 bug）。
 *
 * 设计取舍：每页用独立 browser + context，并且每一项都带硬超时。
 * 之前「一个 browser + 15 个 page 复用 context」的写法会在某一页阻塞时整体挂死，
 * 排查成本高；这里宁可慢一点，也要保证任何一页卡住都不影响其余页，且立刻能看到是哪一页。
 *
 * 用法：
 *   node scripts/verify-pages.mjs [baseUrl] [--api http://localhost:3100]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const BASE = (args.find((a) => !a.startsWith('--')) || 'http://localhost:8099').replace(/\/$/, '');
const apiIdx = args.indexOf('--api');
const API = (apiIdx >= 0 ? args[apiIdx + 1] : process.env.DEMO_API || 'http://localhost:3100').replace(/\/$/, '');
const SHOT_DIR = path.join(ROOT, 'docs', 'screenshots');
const PAGE_BUDGET_MS = Number(process.env.PAGE_BUDGET_MS || 30000);

const PAGES = [
  { name: '01-首页', url: '/pages/index/index', expect: ['女装', '资讯', '货源', '功能'] },
  { name: '02-资讯详情', url: '/pages/info/detail?id=1', expect: ['评论', '点赞', '收藏'] },
  { name: '03-游学资料库', url: '/pages/info/distillation', expect: ['游学', '期'] },
  { name: '04-课程列表', url: '/pages/info/course', expect: ['课程', '讲师'] },
  { name: '05-货源首页', url: '/pages/source/index', expect: ['加微信', '起订', '货源'] },
  { name: '06-款详情', url: '/pages/source/detail?id=1', expect: ['加微信', '起订', '厂家'] },
  { name: '07-拼单广场', url: '/pages/source/groupbuy', expect: ['拼单', '成团'] },
  { name: '08-订货会', url: '/pages/source/ordering-fair', expect: ['订货会', '报名'] },
  { name: '09-工具首页', url: '/pages/tools/index', expect: ['文案改写', '去水印', '额度'] },
  { name: '10-文案改写', url: '/pages/tools/rewrite', expect: ['改写', '风格', '免费'] },
  { name: '11-爆款选题', url: '/pages/tools/trending', expect: ['选题', '风格'] },
  { name: '12-提词器', url: '/pages/tools/teleprompter', expect: ['提词', '语速'] },
  { name: '13-消息中心', url: '/pages/interaction/message-center', expect: ['消息', '通知', '私信'] },
  { name: '14-话题榜', url: '/pages/topic/index', expect: ['话题', '热度'] },
  { name: '15-大店列表', url: '/pages/landmark/list', expect: ['大店', '营收'] },
  { name: '16-厂家看板', url: '/pages/manufacturer/admin', expect: ['曝光', '加微', '转化'] },
  { name: '17-我的', url: '/pages/profile/index', expect: ['我的', '收藏', '内容'] },
  { name: '18-我的收藏', url: '/pages/profile/collection', expect: ['收藏'] },
  { name: '19-内容发布', url: '/pages/content/publish', expect: ['发布', '标题', '标签'] },
  { name: '20-内容看板', url: '/pages/content/content-analytics', expect: ['浏览', '数据', '来源'] },
  { name: '21-我的内容', url: '/pages/content/my-content', expect: ['全部', '浏览', '发布'] },
  { name: '22-登录页', url: '/pages/auth/login', expect: ['登录', '演示', '账号'] },
  { name: '23-认证页', url: '/pages/auth/certify', expect: ['认证', '营业执照'] },
];

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const withTimeout = (p, ms, label) =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} 超时 ${ms}ms`)), ms)),
  ]);

async function getSession() {
  const accounts = await withTimeout(fetch(`${API}/api/auth/demo-accounts`).then((r) => r.json()), 10000, 'demo-accounts');
  const owner = accounts.data.find((u) => u.role === 'shop_owner') ?? accounts.data[0];
  const login = await withTimeout(
    fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demoUserId: owner.id }),
    }).then((r) => r.json()),
    10000,
    'login',
  );
  return { token: login.data.token, user: login.data.user };
}

async function main() {
  if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });
  console.log(`\n${c.bold('前端逐页运行时校验')}  →  ${BASE}   (API ${API})`);
  console.log(`每页预算 ${PAGE_BUDGET_MS}ms，截图输出 ${c.gray(SHOT_DIR)}\n`);

  const session = await getSession();
  console.log(`${c.gray(`登录态：${session.user.nickname}（#${session.user.id}）`)}\n`);

  const results = [];

  for (const spec of PAGES) {
    const t0 = Date.now();
    let browser = null;
    let ok = false;
    let text = '';
    let errors = [];
    let apiFails = [];
    let note = '';

    try {
      browser = await withTimeout(chromium.launch({ channel: 'chrome' }), 25000, 'launch');
      const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
      await ctx.addInitScript(
        ([token, user]) => {
          try {
            // 关键：按 Taro H5 的存储包裹格式写入，否则请求不会带 Authorization
            localStorage.setItem('wfb_token', JSON.stringify({ data: token }));
            localStorage.setItem('wfb_user', JSON.stringify({ data: user }));
          } catch {
            /* ignore */
          }
        },
        [session.token, JSON.stringify(session.user)],
      );
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200));
      });
      page.on('response', (r) => {
        if (r.url().includes('/api/') && r.status() >= 400) apiFails.push(`${r.status()} ${r.url().replace(BASE, '')}`);
      });

      // Taro H5 是 hash 路由：/#/pages/xxx/yyy（直接请求 /pages/xxx/yyy 只会拿到壳）
      await withTimeout(page.goto(`${BASE}/#${spec.url}`, { waitUntil: 'domcontentloaded', timeout: PAGE_BUDGET_MS - 8000 }), PAGE_BUDGET_MS - 5000, 'goto');
      await page.waitForTimeout(2000);
      text = (await page.locator('body').innerText().catch(() => '')) || '';
      const hit = spec.expect.filter((k) => text.includes(k));
      ok = hit.length > 0;
      note = `命中[${hit.join(',')}]`;
      await page.screenshot({ path: path.join(SHOT_DIR, `${spec.name}.png`) });
    } catch (e) {
      note = e.message.slice(0, 120);
    } finally {
      if (browser) await browser.close().catch(() => {});
    }

    const ms = Date.now() - t0;
    if (ok) {
      console.log(`${c.green('PASS')} ${spec.name.padEnd(16)} ${c.gray(`${ms}ms  ${text.length}字  ${note}`)}`);
    } else {
      console.log(`${c.red('FAIL')} ${spec.name.padEnd(16)} ${c.gray(`${spec.url}`)} ${c.red(note)}`);
      if (text) console.log(`     ${c.gray('实际文本：' + text.slice(0, 140).replace(/\n+/g, ' | '))}`);
    }
    if (errors.length) console.log(`     ${c.yellow(`jsError ${errors.length}：${errors[0]}`)}`);
    if (apiFails.length) console.log(`     ${c.yellow(`API 失败 ${apiFails.length}：${[...new Set(apiFails)].slice(0, 2).join(' | ')}`)}`);

    results.push({ ...spec, ok, ms, textLen: text.length, note, errors, apiFails: [...new Set(apiFails)] });
  }

  const passed = results.filter((r) => r.ok).length;
  const jsErr = results.reduce((n, r) => n + r.errors.length, 0);
  const apiErr = [...new Set(results.flatMap((r) => r.apiFails))];
  console.log(`\n${c.bold('='.repeat(66))}`);
  console.log(`${c.bold('结果')}  ${passed === results.length ? c.green(`通过 ${passed}/${results.length}`) : c.red(`通过 ${passed}/${results.length}`)}  jsError ${jsErr} 条  唯一 API 失败 ${apiErr.length} 个`);
  if (apiErr.length) {
    console.log(`\n${c.yellow('仍有失败的后端接口：')}`);
    for (const f of apiErr.slice(0, 12)) console.log(`  - ${f}`);
  }
  const failedPages = results.filter((r) => !r.ok);
  if (failedPages.length) {
    console.log(`\n${c.red('未通过页面：')}`);
    for (const p of failedPages) console.log(`  - ${p.name} ${p.url} → ${p.note}`);
  }
  console.log(`${c.bold('='.repeat(66))}\n`);

  fs.writeFileSync(
    path.join(SHOT_DIR, 'verify-report.json'),
    JSON.stringify({ base: BASE, api: API, at: new Date().toISOString(), passed, total: results.length, jsErr, apiErr, results }, null, 2),
  );

  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(`${c.red('校验异常终止：')} ${e.message}`);
  process.exit(1);
});
