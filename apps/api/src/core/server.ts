import http from 'node:http';
import { URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { User } from '@wfb/shared-types';

/* =========================================================================
 * 极简 HTTP 框架（零依赖，避免任何原生/编译期风险）
 *
 * 设计目标与 NestJS 等价：模块化控制器 + 统一信封 + 全局异常 + 守卫 + Swagger 式路由表。
 * 之所以不用 NestJS：Node 26 + pnpm 严格依赖布局下装饰器元数据链易碎，
 * 而本 Demo 的核心价值在业务模块。控制器写法与 NestJS 对齐（见 docs/ARCHITECTURE.md）。
 * ========================================================================= */

export interface Envelope<T = unknown> {
  code: number;
  message: string;
  data: T;
}

export class ApiException extends Error {
  code: number;
  statusCode: number;
  detail?: unknown;
  constructor(message: string, code = 400, statusCode?: number, detail?: unknown) {
    super(message);
    this.name = 'ApiException';
    this.code = code;
    this.statusCode = statusCode ?? (code >= 100 && code < 600 ? code : 400);
    this.detail = detail;
  }
}

export const Errors = {
  badRequest: (msg = '参数不合法', detail?: unknown) => new ApiException(msg, 400, 400, detail),
  unauthorized: (msg = '请先登录') => new ApiException(msg, 401, 401),
  forbidden: (msg = '没有权限执行该操作') => new ApiException(msg, 403, 403),
  notFound: (msg = '资源不存在') => new ApiException(msg, 404, 404),
  quota: (msg = '今日免费额度已用完，开通会员可无限使用') => new ApiException(msg, 429, 429),
  conflict: (msg = '操作冲突，请刷新后重试') => new ApiException(msg, 409, 409),
  server: (msg = '服务器内部错误', detail?: unknown) => new ApiException(msg, 500, 500, detail),
};

/** 请求上下文：控制器通过它读取入参、当前用户、写入响应 */
export class Ctx {
  readonly id: string = randomUUID();
  method: string;
  path: string;
  params: Record<string, string> = {};
  query: Record<string, string> = {};
  body: Record<string, unknown> = {};
  headers: http.IncomingHttpHeaders;
  /** 当前登录用户（全局守卫填充，未登录为 null） */
  user: User | null = null;
  /** 标记为公开接口后可跳过登录校验 */
  isPublic = false;
  /** 是否需要登录：路由注册时声明 */
  requireAuth = true;
  private res: http.ServerResponse;
  private startedAt = Date.now();

  constructor(req: http.IncomingMessage, res: http.ServerResponse) {
    this.res = res;
    this.method = (req.method ?? 'GET').toUpperCase();
    this.headers = req.headers;
    const url = new URL(req.url ?? '/', 'http://localhost');
    this.path = decodeURIComponent(url.pathname);
    url.searchParams.forEach((v, k) => {
      this.query[k] = v;
    });
  }

  /* ---------------- 入参读取与校验 ---------------- */

  str(key: string, opts: { required?: boolean; max?: number; min?: number; fallback?: string } = {}): string {
    const raw = this.pick(key);
    const val = raw === undefined || raw === null ? (opts.fallback ?? '') : String(raw).trim();
    if (opts.required && !val) throw Errors.badRequest(`缺少参数 ${key}`);
    if (opts.max && val.length > opts.max) throw Errors.badRequest(`${key} 长度不能超过 ${opts.max}`);
    if (opts.min && val.length < opts.min) throw Errors.badRequest(`${key} 长度不能少于 ${opts.min}`);
    return val;
  }

  num(key: string, opts: { required?: boolean; fallback?: number; min?: number; max?: number } = {}): number {
    const raw = this.pick(key);
    if (raw === undefined || raw === null || raw === '') {
      if (opts.required) throw Errors.badRequest(`缺少参数 ${key}`);
      return opts.fallback ?? 0;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) throw Errors.badRequest(`${key} 必须是数字`);
    if (opts.min !== undefined && n < opts.min) throw Errors.badRequest(`${key} 不能小于 ${opts.min}`);
    if (opts.max !== undefined && n > opts.max) throw Errors.badRequest(`${key} 不能大于 ${opts.max}`);
    return n;
  }

  bool(key: string, fallback = false): boolean {
    const raw = this.pick(key);
    if (raw === undefined) return fallback;
    return raw === true || raw === 'true' || raw === '1' || raw === 1;
  }

  arr<T = string>(key: string, fallback: T[] = []): T[] {
    const raw = this.pick(key);
    if (raw === undefined || raw === null || raw === '') return fallback;
    if (Array.isArray(raw)) return raw as T[];
    if (typeof raw === 'string') {
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as unknown as T[];
    }
    return fallback;
  }

  obj(key: string): Record<string, unknown> {
    const raw = this.pick(key);
    return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  }

  /** body 优先，其次 query / params */
  private pick(key: string): unknown {
    if (this.body && Object.prototype.hasOwnProperty.call(this.body, key)) return this.body[key];
    if (Object.prototype.hasOwnProperty.call(this.params, key)) return this.params[key];
    if (Object.prototype.hasOwnProperty.call(this.query, key)) return this.query[key];
    return undefined;
  }

  /** 分页参数（统一 page / pageSize 语义） */
  pagination(defaultSize = 10, maxSize = 50) {
    const page = Math.max(1, this.num('page', { fallback: 1 }));
    const pageSize = Math.min(maxSize, Math.max(1, this.num('pageSize', { fallback: defaultSize })));
    return { page, pageSize, skip: (page - 1) * pageSize };
  }

  /** 断言已登录，返回用户（用于必须登录的控制器内部） */
  auth(): User {
    if (!this.user) throw Errors.unauthorized();
    return this.user;
  }

  /** 断言角色 */
  role(...roles: string[]): User {
    const u = this.auth();
    if (!roles.includes(u.role) && u.role !== 'admin') throw Errors.forbidden(`该功能仅限 ${roles.join('/')} 使用`);
    return u;
  }

  json<T>(data: T, code = 0, message = 'ok') {
    this.send({ code, message, data }, 200);
  }

  raw(statusCode: number, payload: unknown) {
    this.send(payload, statusCode);
  }

  /** 直接返回 SVG（演示占位图等），带正确的 Content-Type 与缓存头 */
  svg(markup: string, cacheSeconds = 86400) {
    if (this.res.writableEnded) return;
    this.res.writeHead(200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': `public, max-age=${cacheSeconds}, immutable`,
      'X-Request-Id': this.id,
      'Access-Control-Allow-Origin': this.headers.origin ?? '*',
    });
    this.res.end(markup);
  }

  private send(payload: unknown, statusCode: number) {
    if (this.res.writableEnded) return;
    const isString = typeof payload === 'string';
    const looksLikeSvg = isString && (payload as string).trimStart().startsWith('<svg');
    const body = isString ? (payload as string) : JSON.stringify(payload);
    this.res.writeHead(statusCode, {
      'Content-Type': looksLikeSvg
        ? 'image/svg+xml; charset=utf-8'
        : isString
          ? 'text/plain; charset=utf-8'
          : 'application/json; charset=utf-8',
      'X-Request-Id': this.id,
      'X-Response-Time': `${Date.now() - this.startedAt}ms`,
      'Access-Control-Allow-Origin': this.headers.origin ?? '*',
      'Access-Control-Allow-Credentials': 'true',
    });
    this.res.end(body);
  }
}

export type Handler = (ctx: Ctx) => Promise<unknown> | unknown;

interface Route {
  method: string;
  /** 形如 /api/info/detail/:id */
  pattern: string;
  segments: string[];
  handler: Handler;
  requireAuth: boolean;
  summary: string;
}

export interface RegisterOptions {
  /** 默认 true；公开接口传 false */
  auth?: boolean;
  /** Swagger 式说明 */
  summary?: string;
}

/** 控制器注册表：每个业务模块导出一个 register(router) 函数 */
export class Router {
  private routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler, opts: RegisterOptions = {}) {
    this.routes.push({
      method,
      pattern,
      segments: pattern.split('/').filter(Boolean),
      handler,
      requireAuth: opts.auth !== false,
      summary: opts.summary ?? '',
    });
  }

  get(p: string, h: Handler, o?: RegisterOptions) {
    this.add('GET', p, h, o);
  }
  post(p: string, h: Handler, o?: RegisterOptions) {
    this.add('POST', p, h, o);
  }
  put(p: string, h: Handler, o?: RegisterOptions) {
    this.add('PUT', p, h, o);
  }
  del(p: string, h: Handler, o?: RegisterOptions) {
    this.add('DELETE', p, h, o);
  }

  list() {
    return this.routes.map((r) => ({ method: r.method, path: r.pattern, auth: r.requireAuth, summary: r.summary }));
  }

  match(method: string, pathname: string): { route: Route; params: Record<string, string> } | null {
    const parts = pathname.split('/').filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i];
        if (seg.startsWith(':')) params[seg.slice(1)] = parts[i];
        else if (seg !== parts[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { route, params };
    }
    return null;
  }
}

export interface ServerHooks {
  /** 全局守卫：解析 token → 返回用户（返回 null 表示未登录） */
  resolveUser: (ctx: Ctx) => Promise<User | null> | User | null;
  /** 请求日志 */
  onLog?: (line: string) => void;
  /** 静态目录（本地 OSS 降级：/uploads/*） */
  staticDirs?: { prefix: string; dir: string }[];
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

export function createHttpServer(router: Router, hooks: ServerHooks) {
  const server = http.createServer(async (req, res) => {
    const ctx = new Ctx(req, res);
    const started = Date.now();

    // CORS 预检
    if (ctx.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': ctx.headers.origin ?? '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return;
    }

    try {
      // 1. 读取 body（含表单，getUserMedia 等场景不需要）
      if (!['GET', 'HEAD'].includes(ctx.method)) {
        ctx.body = await readBody(req);
      }

      // 2. 静态资源（本地 OSS 降级）
      if (await tryStatic(ctx, hooks.staticDirs ?? [])) return;

      // 3. 路由匹配
      const matched = router.match(ctx.method, ctx.path);
      if (!matched) {
        // 内置路由表，便于前端/Postman 自查
        if (ctx.path === '/api/routes') {
          ctx.json(router.list());
          return;
        }
        throw Errors.notFound(`接口不存在：${ctx.method} ${ctx.path}`);
      }
      ctx.params = matched.params;
      ctx.requireAuth = matched.route.requireAuth;

      // 4. 全局守卫
      ctx.user = (await hooks.resolveUser(ctx)) ?? null;
      if (ctx.requireAuth && !ctx.user) throw Errors.unauthorized();

      // 5. 执行控制器
      const result = await matched.route.handler(ctx);
      // 控制器允许自行响应（文件下载等）
      if (!res.writableEnded) ctx.json(result ?? null);

      hooks.onLog?.(`${ctx.method} ${ctx.path} ${res.statusCode} ${Date.now() - started}ms${ctx.user ? ` uid=${ctx.user.id}` : ''}`);
    } catch (e) {
      const err = e instanceof ApiException ? e : Errors.server(e instanceof Error ? e.message : '未知错误', e instanceof Error ? e.stack : e);
      if (!(e instanceof ApiException)) {
        // 非预期异常必须留痕，便于排查
        // eslint-disable-next-line no-console
        console.error(`[${ctx.id}] ${ctx.method} ${ctx.path} 未处理异常:`, e);
      }
      hooks.onLog?.(`${ctx.method} ${ctx.path} ${err.statusCode} ${Date.now() - started}ms ERROR=${err.message}`);
      if (!res.writableEnded) {
        res.writeHead(err.statusCode, {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Request-Id': ctx.id,
          'Access-Control-Allow-Origin': ctx.headers.origin ?? '*',
          'Access-Control-Allow-Credentials': 'true',
        });
        res.end(JSON.stringify({ code: err.code, message: err.message, data: err.detail ?? null }));
      }
    }
  });

  return server;
}

const MAX_BODY = 32 * 1024 * 1024; // 32MB，容纳 base64 图片上传

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Errors.badRequest('请求体过大（上限 32MB）'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      const raw = Buffer.concat(chunks).toString('utf8');
      const type = String(req.headers['content-type'] ?? '');
      try {
        if (type.includes('application/x-www-form-urlencoded')) {
          const out: Record<string, unknown> = {};
          new URLSearchParams(raw).forEach((v, k) => {
            out[k] = v;
          });
          return resolve(out);
        }
        const parsed = JSON.parse(raw);
        return resolve(parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : { value: parsed });
      } catch {
        // 微信回调等场景可能发送 xml / 裸文本
        return resolve({ raw });
      }
    });
    req.on('error', reject);
  });
}

async function tryStatic(ctx: Ctx, dirs: { prefix: string; dir: string }[]): Promise<boolean> {
  for (const d of dirs) {
    if (!ctx.path.startsWith(d.prefix)) continue;
    // 动态演示图由路由处理（/uploads/demo/img.svg），不要当成静态文件去找
    if (ctx.path.startsWith('/uploads/demo/')) continue;
    const rel = ctx.path.slice(d.prefix.length).replace(/^\/+/, '');
    // 防目录穿越
    const full = path.resolve(d.dir, rel);
    if (!full.startsWith(path.resolve(d.dir))) {
      ctx.raw(403, 'forbidden');
      return true;
    }
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
      ctx.raw(404, 'not found');
      return true;
    }
    const ext = path.extname(full).toLowerCase();
    ctx.raw(200, fs.readFileSync(full).toString('binary'));
    return true;
  }
  return false;
}

/** 统一分页裁剪：所有列表接口共用，保证 hasMore 语义一致 */
export function paginate<T>(all: T[], page: number, pageSize: number) {
  const total = all.length;
  const list = all.slice((page - 1) * pageSize, page * pageSize);
  return { list, page, pageSize, total, hasMore: page * pageSize < total };
}
