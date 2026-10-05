import { createApiClient, createRequest, type StorageAdapter } from '@wfb/shared-api';

/** 浏览器 localStorage 适配器（后台无小程序侧约束，可放心用 DOM API） */
const browserStorage: StorageAdapter = {
  get: (k) => (typeof window === 'undefined' ? null : window.localStorage.getItem(k)),
  set: (k, v) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(k, v);
  },
  remove: (k) => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(k);
  },
};

/**
 * 后台 API 客户端。
 * 走 Next.js rewrites 的同源 /api，因此不需要配置 CORS。
 */
const request = createRequest({
  baseURL: '',
  storage: browserStorage,
  onError: (err) => {
    if (typeof window !== 'undefined' && err.code === 401) {
      browserStorage.remove('wfb_token');
    }
  },
});

export const api = createApiClient(request);
export { browserStorage };

/** 后台登录：复用业务登录接口，只允许运营/管理员角色 */
export async function adminLogin(demoUserId: number) {
  const res = await api.auth.login({ demoUserId });
  browserStorage.set('wfb_token', res.token);
  browserStorage.set('wfb_admin', JSON.stringify({ id: res.user.id, nickname: res.user.nickname, role: res.user.role }));
  return res;
}

export function currentAdmin(): { id: number; nickname: string; role: string } | null {
  const raw = browserStorage.get('wfb_admin');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { id: number; nickname: string; role: string };
  } catch {
    return null;
  }
}

export function adminLogout() {
  browserStorage.remove('wfb_token');
  browserStorage.remove('wfb_admin');
}
