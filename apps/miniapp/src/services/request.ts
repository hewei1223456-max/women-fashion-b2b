import Taro from '@tarojs/taro';
import { createRequest, createApiClient, type StorageAdapter } from '@wfb/shared-api';

/**
 * 运行环境与 API 基地址解析。
 *
 * - H5 / PC Web：走相对路径，由 devServer 或 Nginx 反向代理到后端（避免 CORS）
 * - 小程序：必须是已配置的 https 域名，通过构建期 TARO_APP_API 注入
 * - 未注入时回退到本机 3000 端口，方便开发者用「不校验合法域名」调试
 */
export const TARO_ENV = process.env.TARO_ENV;

export function resolveApiBase(): string {
  const injected = process.env.TARO_APP_API;
  if (injected) return injected.replace(/\/$/, '');

  if (TARO_ENV === 'h5') return '';

  // 微信开发者工具需勾选「不校验合法域名」；真机请配置 TARO_APP_API
  return 'http://localhost:3000';
}

/**
 * 基于 Taro 同步存储的 StorageAdapter，小程序 / H5 均可用。
 *
 * ⚠️ 兼容性关键点（曾导致真实登录态丢失）：
 * Taro 的 H5 实现（@tarojs/taro-h5）在 setStorageSync 时会做一层包裹，
 * 把值写成 `{"data": <原值>}`；而小程序端是原生字符串存储。
 * 如果读的时候不拆这层包裹，拿到的就是 `'{"data":"eyJ..."}'` 这种字符串——
 * 它会被当作 Bearer token 发给后端 → 401 → 前端把 token 清掉，
 * 表现为「用户登录后一刷新就掉登录」。
 * 因此这里做对称的包/拆处理，并兼容历史遗留的裸值。
 */
const TARO_WRAP_KEY = 'data';

function packForTaro(value: string): unknown {
  // 已经是被包裹过的形态就直接沿用，避免二次包裹
  if (value.startsWith(`{"${TARO_WRAP_KEY}":`)) {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      if (parsed && Object.keys(parsed).length === 1 && TARO_WRAP_KEY in parsed) return parsed[TARO_WRAP_KEY];
    } catch {
      /* 落到下方正常包一层 */
    }
  }
  return { [TARO_WRAP_KEY]: value };
}

function unpackFromTaro(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'object') {
    const wrapped = raw as Record<string, unknown>;
    const inner = wrapped[TARO_WRAP_KEY];
    return inner === undefined || inner === null ? null : String(inner);
  }
  const str = String(raw);
  // 拆 Taro H5 的包裹形态；解析失败说明是裸值，原样返回
  if (str.startsWith('{')) {
    try {
      const parsed = JSON.parse(str) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object' && TARO_WRAP_KEY in parsed) {
        const inner = parsed[TARO_WRAP_KEY];
        return inner === undefined || inner === null ? null : String(inner);
      }
    } catch {
      /* 非 JSON，按裸值处理 */
    }
  }
  return str;
}

export const taroStorage: StorageAdapter = {
  get(key) {
    try {
      return unpackFromTaro(Taro.getStorageSync(key));
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      Taro.setStorageSync(key, packForTaro(value));
    } catch {
      /* 存储不可用时静默降级为内存态 */
    }
  },
  remove(key) {
    try {
      Taro.removeStorageSync(key);
    } catch {
      /* ignore */
    }
  },
};

/**
 * Taro.request 适配器：shared-api 的可插拔网络层实现。
 *
 * ⚠️ 注意：Taro.request 会自动 JSON.parse 响应体，因此这里**必须传 `data: req.body` 原对象**，
 * 不能再 `JSON.stringify` —— Taro 的 H5 实现会再包一层 `{data: ...}`，
 * 导致后端收到 `{"data":{"title":"..."}}` 形状，所有字段都读不到。
 * 用 `dataType: 'json'` + 原对象可以保证两端行为一致。
 */
const taroAdapter = async <T>(req: {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}) => {
  const res = await Taro.request({
    url: req.url,
    method: req.method as never,
    header: req.headers,
    data: req.body as never,
    timeout: req.timeoutMs ?? 20000,
    dataType: 'json',
  });
  return { statusCode: res.statusCode, data: res.data as T };
};

let tokenGetter: () => string | undefined = () => taroStorage.get('wfb_token') ?? undefined;
let errorHandler: ((msg: string) => void) | undefined;

/**
 * 排障探针（无副作用，只记录最近 50 条）：
 * 把每次请求解析到的 token 来源与长度写到 window.__WFB_REQ_LOG__。
 * 曾用于定位「登录后刷新掉登录」的存储包裹问题，保留下来方便后续排查跨端存储差异。
 */
function traceToken(stage: string, info: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __WFB_REQ_LOG__?: Record<string, unknown>[] };
  w.__WFB_REQ_LOG__ = w.__WFB_REQ_LOG__ ?? [];
  w.__WFB_REQ_LOG__.push({ stage, at: Date.now(), ...info });
  if (w.__WFB_REQ_LOG__.length > 50) w.__WFB_REQ_LOG__.shift();
}

export function setTokenGetter(fn: () => string | undefined) {
  tokenGetter = fn;
}
export function setApiErrorHandler(fn: (msg: string) => void) {
  errorHandler = fn;
}

const request = createRequest({
  baseURL: resolveApiBase(),
  adapter: taroAdapter,
  storage: taroStorage,
  getToken: () => {
    const fromStore = tokenGetter();
    const direct = taroStorage.get('wfb_token') ?? undefined;
    traceToken('resolve', {
      fromStore: fromStore ? fromStore.length : 0,
      direct: direct ? direct.length : 0,
      used: (fromStore || direct) ? 'yes' : 'no',
    });
    return fromStore || direct;
  },
  onError: (err) => {
    traceToken('error', { code: err.code, statusCode: err.statusCode, message: err.message });
    if (err.code === 401) {
      taroStorage.remove('wfb_token');
      errorHandler?.('登录已过期，请重新登录');
      return;
    }
    if (err.statusCode === 0) {
      errorHandler?.('网络连接失败，请检查后端服务是否已启动');
      return;
    }
    errorHandler?.(err.message);
  },
});

/** 全端统一 API 客户端 */
export const api = createApiClient(request);
export { request };
