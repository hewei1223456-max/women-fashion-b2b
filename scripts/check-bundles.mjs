#!/usr/bin/env node
/**
 * 产物合法性校验：用真正的 JS 解析器逐个解析构建产物，确认语法合法。
 *
 * 为什么不能用 `node --check`：
 *   1) 小程序产物是 CommonJS，`node --check` 在部分文件上会因为模块语法差异误报；
 *   2) 它按「脚本」解析，遇到顶层 return / 特殊结构也会失败，噪声高。
 *
 * 本脚本用 @babel/parser（Taro 自身依赖，无需额外安装）按目标语法解析：
 *   - H5 产物：ESM + jsx
 *   - 小程序产物：CJS（sourceType: unambiguous）+ jsx
 *
 * 背景：`h5.terser.output.quote_keys=true`（Taro 4.3 默认）会把类私有字段
 * 变成 `#"name"` 这种非法语法，编译却是 "Compiled successfully" —— 静默产出坏产物。
 * 这个脚本就是防这种回归的守门人。
 *
 * 用法：
 *   node scripts/check-bundles.mjs                 # 检查 h5 + weapp
 *   node scripts/check-bundles.mjs weapp           # 只检查小程序
 *   node scripts/check-bundles.mjs h5 --quiet      # 只在失败时输出
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

// @babel/parser 在 pnpm 的 .pnpm 目录下，从工程根解析
let parse;
try {
  ({ parse } = require('@babel/parser'));
} catch {
  const dirs = fs
    .readdirSync(path.join(ROOT, 'node_modules', '.pnpm'))
    .filter((d) => d.startsWith('@babel+parser@'));
  if (!dirs.length) {
    console.error('找不到 @babel/parser，无法执行产物校验');
    process.exit(2);
  }
  const p = path.join(ROOT, 'node_modules', '.pnpm', dirs[0], 'node_modules', '@babel', 'parser');
  ({ parse } = require(p));
}

const TARGETS = {
  h5: { dir: path.join(ROOT, 'apps/miniapp/dist/h5'), sourceType: 'module', label: 'H5 / PC Web' },
  weapp: { dir: path.join(ROOT, 'apps/miniapp/dist/weapp'), sourceType: 'unambiguous', label: '微信小程序' },
};

const want = (process.argv[2] && !process.argv[2].startsWith('--') ? [process.argv[2]] : ['h5', 'weapp']).filter((t) => TARGETS[t]);
const quiet = process.argv.includes('--quiet');

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) out.push(full);
  }
  return out;
}

let totalFiles = 0;
let totalBad = 0;
const allErrors = [];

for (const name of want) {
  const t = TARGETS[name];
  if (!fs.existsSync(t.dir)) {
    console.log(`${c.yellow('SKIP')} ${t.label}：产物目录不存在（${path.relative(ROOT, t.dir)}）`);
    continue;
  }
  const files = walk(t.dir);
  let bad = 0;
  const errors = [];
  for (const f of files) {
    const code = fs.readFileSync(f, 'utf8');
    try {
      parse(code, {
        sourceType: t.sourceType,
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
        errorRecovery: false,
        plugins: ['jsx', 'classProperties', 'classPrivateProperties', 'classPrivateMethods', 'dynamicImport', 'objectRestSpread', 'optionalChaining', 'nullishCoalescingOperator', 'topLevelAwait'],
      });
    } catch (e) {
      bad++;
      errors.push({ file: path.relative(ROOT, f), message: e.message });
    }
  }
  totalFiles += files.length;
  totalBad += bad;
  allErrors.push(...errors);
  const mark = bad === 0 ? c.green('PASS') : c.red('FAIL');
  console.log(`${mark} ${t.label.padEnd(14)} ${c.gray(`${files.length} 个 js，非法 ${bad} 个`)}  ${c.gray(path.relative(ROOT, t.dir))}`);
  if (bad > 0 && !quiet) {
    for (const e of errors.slice(0, 5)) {
      console.log(`     ${c.red(e.file)}`);
      console.log(`     ${c.gray(e.message.split('\n')[0].slice(0, 160))}`);
    }
  }
}

console.log('');
if (totalBad === 0) {
  console.log(`${c.green(c.bold(`产物语法校验通过：${totalFiles} 个 js 文件全部合法`))}\n`);
  process.exit(0);
}
console.log(`${c.red(c.bold(`产物语法校验失败：${totalBad}/${totalFiles} 个文件语法非法`))}`);
console.log(`${c.gray('提示：若 H5 出现 `#"name"` 形态，是 Taro 默认 terser quote_keys 造成的，见 apps/miniapp/config/index.ts 的 h5.terser 覆盖。')}\n`);
process.exit(1);
