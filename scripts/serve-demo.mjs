#!/usr/bin/env node
/**
 * 女装B2B行业平台 · 单端口演示服务器（零依赖）
 *
 * 一个进程同时提供三件事，方便内网穿透 / 云服务器只暴露一个端口：
 *   /            → Taro H5 / PC Web 用户端（apps/miniapp/dist/h5）
 *   /admin/*     → Next.js 运营后台（apps/admin/.next 的静态产物，或 dev 模式反代）
 *   /api/*       → 反向代理到后端 API（默认 http://localhost:3100）
 *   /uploads/*   → 反向代理到后端（本地 OSS 降级）
 *
 * 用法：
 *   node scripts/serve-demo.mjs                       # 默认 8080，API 指向 localhost:3100
 *   node scripts/serve-demo.mjs --port 8090
 *   node scripts/serve-demo.mjs --api http://localhost:3100
 *
 * 然后在另一个终端开隧道：
 *   cloudflared tunnel --url http://localhost:8080
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const PORT = Number(arg('port', process.env.DEMO_PORT || 8080));
const API = arg('api', process.env.DEMO_API || 'http://localhost:3100').replace(/\/$/, '');
/** 运营后台：优先用静态产物目录，目录不存在时反代到 next start（默认 3101） */
const ADMIN_API = arg('admin-api', process.env.DEMO_ADMIN_API || 'http://localhost:3101').replace(/\/$/, '');
const H5_DIR = path.resolve(ROOT, arg('h5', 'apps/miniapp/dist/h5'));
const ADMIN_DIR = path.resolve(ROOT, arg('admin', 'apps/admin/out'));
/**
 * 用户端反代目标（可选）。给了就把 H5 请求转发到 Taro dev server，
 * 这样开着 watch 模式的开发服务器时 8099 也能实时看到最新代码。
 */
const H5_DEV = arg('h5-dev', process.env.DEMO_H5_DEV || '').replace(/\/$/, '');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/**
 * 压缩传输。
 *
 * 为什么必须做：H5 产物 19MB / 59 个 JS 文件，首屏要下 862KB、
 * 每次切页再下 330-350KB。本地是局域网所以察觉不到，
 * 但用户是通过 Cloudflare 隧道访问的（约 600KB/s），不压缩就是「很卡」的根因。
 * gzip 对 JS/CSS 通常能压到 1/4 左右。
 */
function acceptsGzip(req) {
  return /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
}

/** 可压缩的文本类型（图片/字体本身已压缩，再压没意义还费 CPU） */
function isCompressible(ext) {
  return ['.js', '.mjs', '.css', '.html', '.json', '.svg', '.txt', '.map'].includes(ext);
}

/**
 * 把各 Tab 的 chunk 以 <link rel="prefetch"> 注入 index.html。
 *
 * 为什么需要：Taro 没做 vendor 拆分，每个 Tab 的页面代码是独立 chunk（约 330-366KB），
 * **点了才下载** —— 经公网隧道就是 1.5-3s 白等，用户感受就是「点一下要等很久才跳转」。
 * 加 prefetch 后浏览器会在首屏空闲时后台拉取，用户点 Tab 时文件已在缓存里。
 *
 * 映射由 scripts/build-prefetch-map.mjs 从构建产物里解析出来（dist/h5/.prefetch.json）。
 */
function readPrefetchLinks() {
  try {
    const raw = fs.readFileSync(path.join(H5_DIR, '.prefetch.json'), 'utf8');
    const groups = JSON.parse(raw);
    const seen = new Set();
    const links = [];
    for (const g of groups) {
      for (const f of g.files ?? []) {
        if (seen.has(f)) continue;
        seen.add(f);
        links.push(`<link rel="prefetch" href="${f}" as="${f.endsWith('.css') ? 'style' : 'script'}">`);
      }
    }
    return links.join('');
  } catch {
    return '';
  }
}

let prefetchLinksCache = null;
function getPrefetchLinks() {
  if (prefetchLinksCache === null) prefetchLinksCache = readPrefetchLinks();
  return prefetchLinksCache;
}

function sendFile(req, res, file) {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 not found');
    return;
  }
  const ext = path.extname(file).toLowerCase();
  const headers = { 'Content-Type': MIME[ext] ?? 'application/octet-stream' };
  if (ext === '.js' || ext === '.css' || ext === '.woff2') headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  else headers['Cache-Control'] = 'no-cache';

  /* index.html 要动态注入预取标签，所以走内存处理（文件很小） */
  if (ext === '.html') {
    const links = getPrefetchLinks();
    if (links) {
      const html = fs
        .readFileSync(file, 'utf8')
        .replace('</head>', `${links}</head>`);
      const buf = Buffer.from(html, 'utf8');
      const etag = `W/"html-${Buffer.byteLength(html).toString(16)}"`;
      headers.ETag = etag;
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, headers);
        res.end();
        return;
      }
      if (acceptsGzip(req)) {
        headers['Content-Encoding'] = 'gzip';
        headers.Vary = 'Accept-Encoding';
        res.writeHead(200, headers);
        res.end(zlib.gzipSync(buf, { level: 6 }));
        return;
      }
      headers['Content-Length'] = String(buf.length);
      res.writeHead(200, headers);
      res.end(buf);
      return;
    }
  }

  /** 内容变了 URL 就该变；这里给 ETag 让 304 生效（HTML 走 no-cache + ETag 最省） */
  const stat = fs.statSync(file);
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  headers.ETag = etag;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }

  if (isCompressible(ext) && acceptsGzip(req)) {
    headers['Content-Encoding'] = 'gzip';
    headers.Vary = 'Accept-Encoding';
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(zlib.createGzip({ level: 6 })).pipe(res);
    return;
  }

  headers['Content-Length'] = String(stat.size);
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}

/** 把请求体与响应体原样透传给后端 */
function proxy(req, res, targetPath) {
  const url = new URL(API + targetPath);
  const headers = { ...req.headers, host: url.host };
  delete headers['accept-encoding']; // 避免压缩编码不匹配
  const proxied = http.request(
    { hostname: url.hostname, port: url.port, path: `${url.pathname}${url.search}`, method: req.method, headers },
    (upstream) => {
      res.writeHead(upstream.statusCode ?? 502, upstream.headers);
      upstream.pipe(res);
    },
  );
  proxied.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ code: 502, message: `后端 API 不可达（${API}）：${e.message}`, data: null }));
  });
  req.pipe(proxied);
}

/** 反代到另一个 HTTP 服务（用于把运营后台也收进同一个端口） */
function proxyTo(req, res, target, targetPath) {
  const url = new URL(target + targetPath);
  const headers = { ...req.headers, host: url.host };
  delete headers['accept-encoding'];
  const proxied = http.request(
    { hostname: url.hostname, port: url.port, path: `${url.pathname}${url.search}`, method: req.method, headers },
    (upstream) => {
      res.writeHead(upstream.statusCode ?? 502, upstream.headers);
      upstream.pipe(res);
    },
  );
  proxied.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px;max-width:720px">
      <h2>运营后台不可达</h2>
      <p>目标：<code>${target}</code>，错误：${e.message}</p>
      <p>请先启动：<code>pnpm dev:admin</code>（开发）或 <code>pnpm --filter @wfb/admin start</code>（生产）。</p></body>`,
    );
  });
  req.pipe(proxied);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  // 1) API 与上传资源
  if (pathname.startsWith('/api') || pathname.startsWith('/uploads')) {
    return proxy(req, res, `${pathname}${url.search}`);
  }

  // 2) 运营后台（/admin/*）：静态产物优先，否则反代 next start
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const hasBuild = fs.existsSync(ADMIN_DIR);
    if (!hasBuild) {
      const rel = pathname.replace(/^\/admin/, '') || '/';
      return proxyTo(req, res, ADMIN_API, rel === '/' ? '/' : rel);
    }
    const rel = pathname.replace(/^\/admin\/?/, '');
    let file = path.join(ADMIN_DIR, rel);
    if (!path.extname(file)) file = path.join(ADMIN_DIR, rel, 'index.html');
    if (!file.startsWith(ADMIN_DIR)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    if (!fs.existsSync(file) && fs.existsSync(path.join(ADMIN_DIR, 'index.html'))) {
      file = path.join(ADMIN_DIR, 'index.html');
    }
    return sendFile(req, res, file);
  }

  // 3) H5 / PC Web 用户端
  /**
   * 开发模式（--h5-dev）：把用户端请求反代到 Taro dev server（默认 10086）。
   *
   * 为什么需要：`dev:h5` 是 watch 模式，产物在内存里，**不会写 dist/h5**，
   * 所以只要开发服务器开着，dist/h5 就是空的、8099 会全站 404。
   * 有了这个开关，单人开发时 8099 能直接看到最新代码，不用反复全量 build。
   */
  if (H5_DEV) {
    return proxyTo(req, res, H5_DEV, `${pathname}${url.search}`);
  }

  let file = path.join(H5_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(H5_DIR)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // 前端路由回退
    file = path.join(H5_DIR, 'index.html');
  }
  if (!fs.existsSync(H5_DIR) || !fs.existsSync(path.join(H5_DIR, 'index.html'))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px;max-width:720px">
      <h2>H5 产物尚未构建</h2>
      <p>方式一：<code>pnpm --filter @wfb/miniapp run build:h5</code>（产出静态文件）</p>
      <p>方式二：<code>pnpm --filter @wfb/miniapp dev:h5</code> 起开发服务器后，用
      <code>node scripts/serve-demo.mjs --h5-dev http://localhost:10086</code> 让本服务器反代过去</p>
      <p>当前后端代理目标：<code>${API}</code>，健康检查 <a href="/api/health">/api/health</a></p></body>`,
    );
    return;
  }
  sendFile(req, res, file);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  女装B2B行业平台 · 单端口演示服务器`);
  console.log(`  用户端(H5/PC Web)  http://localhost:${PORT}/`);
  console.log(`  运营后台           http://localhost:${PORT}/admin/  →  ${fs.existsSync(ADMIN_DIR) ? '静态产物' : ADMIN_API}`);
  console.log(`  后端 API 代理      http://localhost:${PORT}/api/health  →  ${API}`);
  console.log(`  H5 静态目录        ${H5_DIR}${fs.existsSync(H5_DIR) ? '' : '  (尚未构建)'}`);
  console.log(`\n  内网穿透：cloudflared tunnel --url http://localhost:${PORT}\n`);
});
