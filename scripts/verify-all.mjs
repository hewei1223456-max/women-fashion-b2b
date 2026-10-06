#!/usr/bin/env node
/**
 * 一键全量验收（Lead 终验脚本）
 *
 * 为什么需要它：冒烟用例会真实写入数据（发布内容、点赞、消耗工具额度、置顶……），
 * 在同一实例上重复跑会因为「置顶上限 3 条」「工具每日免费额度」这类**正确业务规则**
 * 而出现假失败。所以本脚本每次都在**全新实例**上跑冒烟，保证结果可复现。
 *
 * 执行内容：
 *   1) 编译契约包 + 后端
 *   2) 前端 typecheck
 *   3) 在干净端口起独立后端实例 → 跑后端全链路冒烟 → 关停
 *   4) 各端编译（weapp / tt / alipay / h5）
 *   5) 产物语法校验（防 Terser 把产物压坏这类「编译成功但产物非法」的静默故障）
 *   6) 前端逐页运行时校验（Playwright + 系统 Chrome，截图存 docs/screenshots）
 *   7) 管理后台构建
 *
 * 用法：
 *   node scripts/verify-all.mjs              # 全量
 *   node scripts/verify-all.mjs --fast       # 跳过各端编译与浏览器校验（只跑 1-3、6）
 *   node scripts/verify-all.mjs --no-browser # 跳过浏览器校验
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.VERIFY_PORT || 3161);
const BASE = `http://localhost:${PORT}`;
const FAST = process.argv.includes('--fast');
const NO_BROWSER = process.argv.includes('--no-browser') || FAST;
const IS_WIN = process.platform === 'win32';

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const steps = [];
function record(name, ok, detail = '') {
  steps.push({ name, ok, detail });
  const mark = ok ? c.green('PASS') : c.red('FAIL');
  console.log(`${mark} ${name}${detail ? `  ${c.gray(detail)}` : ''}`);
}

/** 失败时打印命令输出的尾部，避免「只看到 FAIL 不知道原因」 */
function explain(out, lines = 8) {
  const clean = out.replace(/\x1b\[[0-9;]*m/g, '').split('\n').filter((l) => l.trim());
  return clean.slice(-lines);
}

/**
 * 运行命令。
 *
 * Windows 两个坑：
 *   1) PowerShell 执行策略会拦截 `pnpm.ps1`，必须走 `pnpm.cmd`；
 *   2) Node ≥ 20 出于安全考虑，在 `shell: false` 下 spawn `.cmd` 会直接 EINVAL。
 * 因此 Windows 上统一用 `shell: true`，并对含空格的参数自行加引号。
 */
function quote(a) {
  const s = String(a);
  return /[\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}

function run(cmd, args, opts = {}) {
  const isPnpm = cmd === 'pnpm';
  const bin = isPnpm && IS_WIN ? 'pnpm.cmd' : cmd;
  const r = spawnSync([bin, ...args].map(quote).join(' '), {
    cwd: opts.cwd ?? ROOT,
    encoding: 'utf8',
    shell: true,
    timeout: opts.timeout ?? 600000,
    maxBuffer: 64 * 1024 * 1024,
    /** 允许子进程覆盖环境变量（例如让校验脚本指向不同的 BASE 地址） */
    env: opts.env ?? process.env,
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.error) return { code: r.status ?? 1, out: `${out}\n[spawn error] ${r.error.code}: ${r.error.message}`, spawnError: r.error.code };
  return { code: r.status ?? 1, out };
}

function hasErrors(out, pattern = /error TS|✖ |Failed to compile/i) {
  return pattern.test(out);
}

async function waitForHealth(url, tries = 30) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${url}/api/health`);
      if (r.ok) return true;
    } catch {
      /* 还没起来 */
    }
    await new Promise((res) => setTimeout(res, 400));
  }
  return false;
}

async function main() {
  console.log(`\n${c.bold('女装B2B行业平台 · 一键全量验收')}`);
  console.log(`${c.gray(`工作目录 ${ROOT}`)}`);
  console.log(`${c.gray(FAST ? '模式：--fast（跳过各端编译与浏览器校验）' : NO_BROWSER ? '模式：--no-browser' : '模式：全量')}\n`);

  /* ---------- 1. 编译契约包 + 后端 ---------- */
  console.log(c.bold('【1】编译契约包与后端'));
  let r = run('pnpm', ['--filter', './packages/*', 'run', 'build']);
  record('契约包编译（shared-types / shared-utils / shared-api）', r.code === 0 && !hasErrors(r.out), r.code !== 0 ? `exit ${r.code}` : '');
  if (r.code !== 0) for (const l of explain(r.out)) console.log(`     ${c.gray(l)}`);

  r = run('pnpm', ['--filter', '@wfb/api', 'run', 'build']);
  record('后端编译（tsc，零 error TS）', r.code === 0 && !hasErrors(r.out), r.code !== 0 ? `exit ${r.code}` : '');
  if (r.code !== 0) for (const l of explain(r.out)) console.log(`     ${c.gray(l)}`);

  /* ---------- 2. 前端类型检查 ---------- */
  console.log(`\n${c.bold('【2】前端类型检查')}`);
  r = run('pnpm', ['--filter', '@wfb/miniapp', 'run', 'typecheck']);
  record('Taro 多端 typecheck', r.code === 0 && !/error TS/.test(r.out), r.code !== 0 ? `exit ${r.code}` : '');
  if (r.code !== 0) for (const l of explain(r.out)) console.log(`     ${c.gray(l)}`);

  /* ---------- 3. 干净实例上的后端冒烟 ---------- */
  console.log(`\n${c.bold('【3】后端全链路冒烟（每次全新实例，结果可复现）')}`);
  if (!fs.existsSync(path.join(ROOT, 'apps/api/dist/main.js'))) {
    record('后端冒烟', false, 'apps/api/dist/main.js 不存在，请先编译');
  } else {
    const api = spawn('node', ['dist/main.js'], {
      cwd: path.join(ROOT, 'apps/api'),
      env: { ...process.env, PORT: String(PORT), API_LOG: 'off' },
      stdio: 'ignore',
      detached: false,
    });
    try {
      const up = await waitForHealth(BASE);
      if (!up) {
        record(`后端冒烟（${BASE}）`, false, '独立实例启动超时');
      } else {
        const smoke = run('node', [path.join(ROOT, 'scripts/smoke-api.mjs'), BASE], { timeout: 300000 });
        const m = /通过\s*(\d+)\s*失败\s*(\d+)/.exec(smoke.out.replace(/\x1b\[[0-9;]*m/g, ''));
        const passed = m ? Number(m[1]) : 0;
        const failed = m ? Number(m[2]) : -1;
        record(`后端冒烟（${BASE}，全新实例）`, failed === 0 && passed > 0, `通过 ${passed} / 失败 ${failed}`);
        if (failed !== 0) {
          const tail = smoke.out.replace(/\x1b\[[0-9;]*m/g, '').split('\n').filter((l) => l.includes('  - ') || l.includes('FAIL'));
          for (const line of tail.slice(0, 10)) console.log(`     ${c.gray(line.trim())}`);
        }
      }
    } finally {
      api.kill('SIGTERM');
      await new Promise((res) => setTimeout(res, 800));
    }
  }

  /* ---------- 4. 各端编译 ---------- */
  if (!FAST) {
    console.log(`\n${c.bold('【4】各端编译')}`);
    for (const [target, label] of [
      ['weapp', '微信小程序'],
      ['tt', '抖音小程序'],
      ['alipay', '支付宝小程序'],
      ['h5', 'H5 / PC Web'],
    ]) {
      const out = run('pnpm', ['--filter', '@wfb/miniapp', 'run', `build:${target}`], { timeout: 900000 });
      const ok = out.code === 0 && /Compiled successfully/.test(out.out);
      record(`编译 ${label}（build:${target}）`, ok, ok ? '' : `exit ${out.code}`);
      if (!ok) for (const l of explain(out.out, 6)) console.log(`     ${c.gray(l)}`);
    }

    /* ---------- 5. 产物语法校验 ---------- */
    console.log(`\n${c.bold('【5】产物语法校验（防「编译成功但产物非法」）')}`);
    const chk = run('node', [path.join(ROOT, 'scripts/check-bundles.mjs')]);
    const okLine = /产物语法校验通过/.test(chk.out);
    const summary = (chk.out.match(/产物语法校验[^\n]*/) ?? [''])[0].replace(/\x1b\[[0-9;]*m/g, '');
    record('H5 / 微信小程序 JS 语法合法性', okLine, summary);

    /**
     * 生成「页面 → chunk」预取映射。
     * 必须紧跟 build:h5 之后跑：h5 构建会重写 dist/h5，映射里的 chunk 文件名每次都会变，
     * 不重新生成的话 8099 会去预取上一轮的旧文件（404），预取就白做了。
     */
    const pmap = run('node', [path.join(ROOT, 'scripts/build-prefetch-map.mjs')]);
    const pmapLine = (pmap.out.match(/预取合计[^\n]*/) ?? [''])[0].replace(/\x1b\[[0-9;]*m/g, '');
    record('生成 Tab 预取映射（点 Tab 秒开）', pmap.code === 0 && /预取合计\s*\d+KB/.test(pmap.out), pmapLine || '未生成');
  }

  /* ---------- 6. 浏览器运行时校验 ---------- */
  if (!NO_BROWSER) {
    console.log(`\n${c.bold('【6】浏览器逐页运行时校验')}`);
    console.log(`${c.gray('前置：后端 3100 + 演示服务器 8099（node scripts/serve-demo.mjs）需在运行')}`);
    let apiUp = false;
    try {
      apiUp = (await fetch('http://localhost:3100/api/health')).ok;
    } catch {
      apiUp = false;
    }
    if (!apiUp) {
      record('浏览器逐页校验', false, 'http://localhost:3100 未运行，跳过');
    } else {
      /**
       * ⚠️ 必须重启演示服务器。
       *
       * 第 4 步的 `build:h5` 会**清空并重写 dist/h5**（chunk 文件名每次都变），
       * 而演示服务器若在此前启动，就会：① 缓存了上一轮的预取映射 → 去拉 404；
       * ② 静态文件句柄指向已删除的 inode。两者都表现为「全站 0 页通过」。
       * 所以这里先探活 8099，是本地地址就重启一次。
       */
      const demoUp = await (async () => {
        try {
          return (await fetch('http://localhost:8099/')).ok;
        } catch {
          return false;
        }
      })();
      if (demoUp && !process.env.SKIP_DEMO_RESTART) {
        console.log(`${c.gray('  重启演示服务器以加载新产物…')}`);
        const stop = run('node', [path.join(ROOT, 'scripts', 'demo-restart.mjs')], { timeout: 60000 });
        if (stop.code !== 0) console.log(`${c.yellow('  重启失败，继续尝试校验：')} ${stop.out.slice(-200)}`);
      }

      const pages = run('node', [path.join(ROOT, 'scripts/verify-pages.mjs'), 'http://localhost:8099'], { timeout: 900000 });
      const m = /通过\s*(\d+)\/(\d+)/.exec(pages.out.replace(/\x1b\[[0-9;]*m/g, ''));
      record('H5 逐页运行时校验', m ? m[1] === m[2] : false, m ? `通过 ${m[1]}/${m[2]}` : '未解析到结果');

      /**
       * 双端视角校验：店主端 4 个 Tab、厂家端 5 个 Tab，且各自页面能打开。
       * 用户曾反馈「厂家版跟店主版界面一模一样」，这是防止回归的守卫。
       */
      const vendorEnv = { ...process.env, BASE: 'http://localhost:8099', WAIT: '3500' };
      const vendor = run('node', [path.join(ROOT, 'scripts/verify-vendor-view.mjs')], { timeout: 600000, env: vendorEnv });
      const vendorOut = vendor.out.replace(/\x1b\[[0-9;]*m/g, '');
      const shopOk = /shop_owner[\s\S]*?4\/4 命中/.test(vendorOut);
      const mfrOk = /manufacturer[\s\S]*?5\/5 命中/.test(vendorOut);
      const noErr = !/jsError: [1-9]/.test(vendorOut);
      record(
        '店主端/厂家端双视角导航',
        shopOk && mfrOk && noErr,
        `店主端 4 Tab ${shopOk ? '✓' : '✗'} · 厂家端 5 Tab ${mfrOk ? '✓' : '✗'} · jsError ${noErr ? '0' : '有'}`,
      );
    }
  }

  /* ---------- 7. 管理后台构建 ---------- */
  if (!FAST) {
    console.log(`\n${c.bold('【7】管理后台构建')}`);
    const admin = run('pnpm', ['--filter', '@wfb/admin', 'run', 'build'], { timeout: 600000 });
    const adminOk = admin.code === 0 && !hasErrors(admin.out, /Failed to compile|error TS/);
    record('Next.js 运营后台构建', adminOk, adminOk ? '' : `exit ${admin.code}`);
    if (!adminOk) for (const l of explain(admin.out, 6)) console.log(`     ${c.gray(l)}`);
  }

  /* ---------- 汇总 ---------- */
  const failed = steps.filter((s) => !s.ok);
  console.log(`\n${c.bold('='.repeat(70))}`);
  console.log(`${c.bold('验收汇总')}  ${failed.length === 0 ? c.green(`全部通过（${steps.length} 项）`) : c.red(`${failed.length}/${steps.length} 项失败`)}`);
  if (failed.length) {
    console.log(`\n${c.red('失败项：')}`);
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? `（${f.detail}）` : ''}`);
  }
  console.log(`${c.bold('='.repeat(70))}\n`);

  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`${c.red('验收脚本异常：')} ${e.message}`);
  process.exit(1);
});
