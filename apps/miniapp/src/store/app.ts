import { create } from 'zustand';
import Taro from '@tarojs/taro';
import type { ReceivePreference, User } from '@wfb/shared-types';
import { taroStorage, setTokenGetter } from '@/services/request';

const TOKEN_KEY = 'wfb_token';
const USER_KEY = 'wfb_user';

interface AppState {
  token: string;
  user: User | null;
  /** 冷启动计数：前 3 次访问走探索通道（第六篇） */
  visitCount: number;
  unread: { notification: number; message: number; total: number };
  preference: ReceivePreference | null;
  setAuth: (token: string, user: User) => void;
  setUser: (user: User) => void;
  logout: () => void;
  bumpVisit: () => void;
  setUnread: (u: { notification: number; message: number; total: number }) => void;
  setPreference: (p: ReceivePreference) => void;
  isLoggedIn: () => boolean;
  isManufacturer: () => boolean;
}

function readUser(): User | null {
  const raw = taroStorage.get(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  token: taroStorage.get(TOKEN_KEY) ?? '',
  user: readUser(),
  visitCount: Number(taroStorage.get('wfb_visit') ?? 0),
  unread: { notification: 0, message: 0, total: 0 },
  preference: null,

  setAuth: (token, user) => {
    taroStorage.set(TOKEN_KEY, token);
    taroStorage.set(USER_KEY, JSON.stringify(user));
    set({ token, user });
  },
  setUser: (user) => {
    taroStorage.set(USER_KEY, JSON.stringify(user));
    set({ user });
  },
  logout: () => {
    taroStorage.remove(TOKEN_KEY);
    taroStorage.remove(USER_KEY);
    set({ token: '', user: null });
  },
  bumpVisit: () => {
    const next = get().visitCount + 1;
    taroStorage.set('wfb_visit', String(next));
    set({ visitCount: next });
  },
  setUnread: (unread) => set({ unread }),
  setPreference: (preference) => set({ preference }),
  isLoggedIn: () => !!get().token,
  isManufacturer: () => get().user?.role === 'manufacturer',
}));

// 让请求层永远拿到最新 token（避免闭包过期）
setTokenGetter(() => useAppStore.getState().token || undefined);

/** 底部 tab 未读角标（小程序原生能力，H5 端自动 no-op） */
export function syncTabBadge(total: number) {
  try {
    if (total > 0) {
      Taro.setTabBarBadge({ index: 3, text: total > 99 ? '99+' : String(total) });
    } else {
      Taro.removeTabBarBadge({ index: 3 });
    }
  } catch {
    /* H5 / 无 tabBar 场景忽略 */
  }
}
