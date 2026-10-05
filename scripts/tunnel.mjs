#!/usr/bin/env node
/**
 * 公网访问：本地演示站 + Cloudflare 隧道
 *
 * 为什么需要这个脚本：
 *   直接跑 `cloudflared tunnel --url ...` 每次都会分配一个**随机域名**
 *   （形如 https://xxx-yyy-zzz.trycloudflare.com），重启就变，
 *   没法写进文档发给别人。这里做两件事：
 *     1) 用命名隧道（需要一个免费的 Cloudflare 账号）拿到**固定域名**；
 *     2) 把 URL 与 PID 落盘到 .tunnel.json，重启后自动复用。
 *
 * 三种模式：
 *
 *   ① 快速隧道（零配置，域名随机，适合临时给人看一眼）
 *      node scripts/tunnel.mjs --quick
 *
 *   ② 命名隧道（固定域名，推荐；需要一次性登录）
 *      node scripts/tunnel.mjs --name wfb-demo --login          # 首次：浏览器授权
 *      node scripts/tunnel.mjs --name wfb-demo --hostname demo.yourdomain.com
 *      说明：命名隧道的域名需要你把一个域名托管在 Cloudflare（免费版即可）。
 *            没有自己的域名时用模式 ③。
 *
 *   ③ 查看当前状态 / 停止
 *      node scripts/tunnel.mjs --status
 *      node scripts/tunnel.mjs --stop
 *
 * 前置：演示服务器必须先起来
 *   pnpm dev:api && pnpm serve:demo
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'tools', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
const STATE = path.join(ROOT, '.tunnel.json');
const LOG = path.join(ROOT, '.tunnel.log');
const DEFAULT_URL = 'http://localhost:8099';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

function readState() {
  try {
    // PowerShell 5.1 的 Set-Content -Encoding UTF8 会写入 BOM，JSON.parse 会直接失败，
    // 这里顺手剥掉 BOM（手动用 PowerShell 写状态文件时踩过）。
    const raw = fs.readFileSync(STATE, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeState(s) {
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

if (flag('status')) {
  const s = readState();
  if (!s) {
    console.log('没有隧道记录。使用 node scripts/tunnel.mjs --quick 启动。');
  } else {
    console.log(`模式: ${s.mode}`);
    console.log(`公网地址: ${s.url}`);
    console.log(`本地目标: ${s.target}`);
    console.log(`进程 PID: ${s.pid} (${pidAlive(s.pid) ? '运行中' : '已停止'})`);
    console.log(`启动时间: ${s.startedAt}`);
  }
  process.exit(0);
}

if (flag('stop')) {
  const s = readState();
  if (s?.pid && pidAlive(s.pid)) {
    try {
      process.kill(s.pid);
      console.log(`已停止隧道进程 ${s.pid}`);
    } catch (e) {
      console.log(`停止失败: ${e.message}`);
    }
  } else {
    console.log('没有正在运行的隧道进程');
  }
  if (fs.existsSync(STATE)) fs.rmSync(STATE);
  process.exit(0);
}

if (!fs.existsSync(BIN)) {
  console.error(
    `未找到 cloudflared（${path.relative(ROOT, BIN)}）。请先下载：\n` +
      `  Windows: Invoke-WebRequest -Uri https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe -OutFile tools/cloudflared.exe\n` +
      `  macOS:   brew install cloudflared\n` +
      `  Linux:   curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o tools/cloudflared && chmod +x tools/cloudflared`,
  );
  process.exit(2);
}

const existing = readState();
if (existing?.pid && pidAlive(existing.pid) && !flag('restart')) {
  console.log(`隧道已在运行：${existing.url}\n如需重启请加 --restart，或先 --stop。`);
  process.exit(0);
}

const target = value('url', DEFAULT_URL);
const name = value('name', '');
const hostname = value('hostname', '');
const quick = flag('quick') || !name;

// 首次登录：把浏览器授权后的凭据写到 ~/.cloudflared
if (flag('login')) {
  console.log('即将打开浏览器进行 Cloudflare 授权（选择你的域名即可）...');
  spawnSync(BIN, ['tunnel', 'login'], { stdio: 'inherit' });
  process.exit(0);
}

const cfArgs = quick
  ? ['tunnel', '--url', target, '--no-autoupdate']
  : ['tunnel', '--url', target, '--no-autoupdate', 'run', name, ...(hostname ? ['--hostname', hostname] : [])];

console.log(`启动${quick ? '快速' : `命名（${name}）`}隧道  ${target} → Cloudflare ...`);

fs.writeFileSync(LOG, '');
const child = spawn(BIN, cfArgs, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const stream = fs.createWriteStream(LOG, { flags: 'a' });
child.stdout.pipe(stream);
child.stderr.pipe(stream);

let printed = false;
let buffer = '';
child.stderr.on('data', (d) => {
  buffer += String(d);
  if (!printed) {
    // cloudflared 把 URL 打在 stderr 的日志里
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(buffer);
    if (m) {
      printed = true;
      const url = m[0];
      writeState({ mode: quick ? 'quick' : 'named', url, target, pid: child.pid, startedAt: new Date().toISOString(), name: name || undefined });
      console.log(`\n公网地址：${url}`);
      console.log(`  用户端    ${url}/`);
      console.log(`  运营后台  ${url}/admin/`);
      console.log(`  健康检查  ${url}/api/health`);
      console.log(`\n状态：node scripts/tunnel.mjs --status    停止：node scripts/tunnel.mjs --stop\n`);
      console.log('注意：快速隧道域名是随机的，重启会变；需要固定域名请用命名隧道（--name）。');
      console.log('同时该地址是公开可访问的，演示结束后请及时 --stop。');
    }
  }
});

child.on('exit', (code) => {
  console.log(`隧道进程已退出（code ${code}），日志：${path.relative(ROOT, LOG)}`);
  if (fs.existsSync(STATE)) fs.rmSync(STATE);
});

setTimeout(() => {
  if (!printed) {
    console.log(`30 秒内未拿到公网地址，请查看日志：${path.relative(ROOT, LOG)}`);
    console.log('常见原因：本地演示服务器没起来（先跑 pnpm dev:api 与 pnpm serve:demo）。');
  }
}, 30000);
