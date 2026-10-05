import type { ApiEnvelope } from '@wfb/shared-types';

/** 可插拔网络适配器：Taro 端传 Taro.request 包装，Web 端默认用 fetch */
export interface HttpRequest {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export interface HttpResponse<T = unknown> {
  statusCode: number;
  data: T;
}

export type HttpAdapter = <T = unknown>(req: HttpRequest) => Promise<HttpResponse<T>>;

/** 可插拔存储：小程序用 Taro.setStorageSync，Web 用 localStorage，RN 用 AsyncStorage */
export interface StorageAdapter {
  get(key: string): string | null | undefined;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface ApiClientOptions {
  baseURL: string;
  adapter?: HttpAdapter;
  /** 同步获取当前 token（每次请求实时读取，避免闭包过期） */
  getToken?: () => string | undefined;
  storage?: StorageAdapter;
  /** 统一错误提示钩子 */
  onError?: (err: ApiError) => void;
  timeoutMs?: number;
}

export class ApiError extends Error {
  code: number;
  statusCode: number;
  detail?: unknown;
  constructor(message: string, code = -1, statusCode = 0, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.detail = detail;
  }
}

/** 内存降级存储：无 storage 时保证不崩 */
export function createMemoryStorage(): StorageAdapter {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k),
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
}

/** 浏览器 / H5 默认适配器 */
export function createFetchAdapter(): HttpAdapter {
  return async <T>(req: HttpRequest): Promise<HttpResponse<T>> => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timer = controller ? setTimeout(() => controller.abort(), req.timeoutMs ?? 20000) : undefined;
    try {
      const res = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        signal: controller?.signal,
      });
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        /* 保持纯文本 */
      }
      return { statusCode: res.status, data: parsed as T };
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

const TOKEN_KEY = 'wfb_token';

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * 统一请求器：所有接口都返回 { code, message, data } 信封。
 * code !== 0 时抛 ApiError，调用方（React Query / try-catch）统一处理。
 */
export function createRequest(opts: ApiClientOptions) {
  const adapter = opts.adapter ?? createFetchAdapter();
  const storage = opts.storage ?? createMemoryStorage();

  async function request<T>(method: HttpRequest['method'], path: string, payload?: unknown, query?: Record<string, unknown>): Promise<T> {
    const url = `${opts.baseURL.replace(/\/$/, '')}${path}${buildQuery(query)}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = opts.getToken?.() ?? storage.get(TOKEN_KEY) ?? undefined;
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: HttpResponse<ApiEnvelope<T>>;
    try {
      res = await adapter<ApiEnvelope<T>>({
        url,
        method,
        headers,
        body: method === 'GET' ? undefined : payload,
        timeoutMs: opts.timeoutMs,
      });
    } catch (e) {
      const err = new ApiError(e instanceof Error ? e.message : '网络请求失败', -1, 0, e);
      opts.onError?.(err);
      throw err;
    }

    const envelope = res.data;
    if (!envelope || typeof envelope !== 'object' || !('code' in envelope)) {
      const err = new ApiError(`响应格式异常 (HTTP ${res.statusCode})`, -2, res.statusCode, res.data);
      opts.onError?.(err);
      throw err;
    }
    if (envelope.code !== 0) {
      const err = new ApiError(envelope.message || '请求失败', envelope.code, res.statusCode, envelope.data);
      opts.onError?.(err);
      throw err;
    }
    return envelope.data;
  }

  return {
    get: <T>(path: string, query?: Record<string, unknown>) => request<T>('GET', path, undefined, query),
    post: <T>(path: string, body?: unknown, query?: Record<string, unknown>) => request<T>('POST', path, body, query),
    put: <T>(path: string, body?: unknown, query?: Record<string, unknown>) => request<T>('PUT', path, body, query),
    del: <T>(path: string, body?: unknown, query?: Record<string, unknown>) => request<T>('DELETE', path, body, query),
    tokenKey: TOKEN_KEY,
  };
}

export type Requester = ReturnType<typeof createRequest>;
