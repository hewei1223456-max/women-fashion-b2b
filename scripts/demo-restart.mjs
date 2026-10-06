/**
 * 重启本地演示服务器（8099）。
 *
 * 为什么单独做成脚本：验收流程里 `build:h5` 会清空重写 dist/h5，
 * 而演示服务器如果在此之前启动，就会缓存上一轮的预取映射（指向已不存在的 chunk → 404），
 * 并持有已删除文件的句柄。表现为「全站 0 页通过」，很容易被误判成代码坏了。
 *
 * 这里只处理本地 8099：杀掉监听进程 → 重新以静态模式拉起 → 探活确认。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.env.DEMO_PORT || 8099);
const API = process.env.DEMO_API || 'http://localhost:3100';
const IS_WIN = process.platform === 'win32';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 找到监听指定端口的进程并结束（Windows 用 netstat，其它平台用 lsof） */
async function killListener(port) {
  const cmd = IS_WIN
    ? `netstat -ano | findstr :${port} | findstr LISTENING`
    : `lsof -ti tcp:${port}`;
  const out = await new Promise((resolve) => {
    const p = spawn(IS_WIN ? 'cmd.exe' : 'sh', IS_WIN ? ['/c', cmd] : ['-c', cmd], { stdio: ['ignore', 'pipe', 'ignore'] });
    let s = '';
    p.stdout.on('data', (d) => (s += d));
    p.on('close', () => resolve(s));
    p.on('error', () => resolve(''));
  });
  const pids = IS_WIN
    ? [...new Set(out.split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()).filter((x) => /^\d+$/.test(x)))]
    : out.split(/\s+/).filter(Boolean);
  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGKILL');
    } catch {
      /* 已退出 */
    }
  }
  return pids;
}

async function alive(url, tries = 25) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return true;
    } catch {
      /* 还没起来 */
    }
    await sleep(400);
  }
  return false;
}

const killed = await killListener(PORT);
if (killed.length) console.log(`  已结束占用 ${PORT} 的进程: ${killed.join(', ')}`);
await sleep(900);

const child = spawn(
  process.execPath,
  [path.join(ROOT, 'scripts/serve-demo.mjs'), '--port', String(PORT), '--api', API],
  { cwd: ROOT, detached: true, stdio: 'ignore' },
);
child.unref();

const ok = await alive(`http://localhost:${PORT}/`);
console.log(ok ? `  演示服务器已重启（http://localhost:${PORT}）` : '  ❌ 演示服务器未能在超时内启动');
process.exit(ok ? 0 : 1);
