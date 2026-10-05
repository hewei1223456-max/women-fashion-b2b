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

/** 基于 Taro 同步存储的 StorageAdapter，小程序 / H5 均可用 */
export const taroStorage: StorageAdapter = {
  get(key) {
    try {
      const v = Taro.getStorageSync(key);
      return v === '' || v === undefined ? null : (v as string);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      Taro.setStorageSync(key, value);
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

/** Taro.request 适配器：shared-api 的可插拔网络层实现 */
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
  getToken: () => tokenGetter(),
  onError: (err) => {
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
