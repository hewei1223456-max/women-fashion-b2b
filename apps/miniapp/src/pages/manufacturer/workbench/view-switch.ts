import { useState } from 'react';
import Taro from '@tarojs/taro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from '@wfb/shared-types';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import { errMsg } from '@/components/utils';

/* =========================================================================
 * 视角切换（店主端 / 厂家端）
 *
 * 用户原话：「我需要单独再帮我做一个厂家端后台，可以让我们来进行选择，
 *            我可以直接在上面来切换视角进行选择」
 *
 * 实现：演示账号列表（api.auth.demoAccounts）里取第一个 shop_owner / manufacturer，
 * 调 api.auth.switchDemoAccount 一次拿到新 token + user，写回 store（setAuth），
 * 再 invalidateQueries 让所有页面按新身份重新取数。
 *
 * 本文件被「我的」页与厂家工作台共用（同属 task-8 的 write scope）。
 * ========================================================================= */

export type ViewKey = 'shop_owner' | 'manufacturer';

export const VIEW_LABELS: Record<ViewKey, string> = {
  shop_owner: '店主端',
  manufacturer: '厂家端',
};

/** 当前账号属于哪个视角（landmark/lecturer/admin 等演示身份归入店主端展示） */
export function viewOfRole(role?: string): ViewKey {
  return role === 'manufacturer' ? 'manufacturer' : 'shop_owner';
}

export function useViewSwitch() {
  const queryClient = useQueryClient();
  const user = useAppStore((s) => s.user);
  const setAuth = useAppStore((s) => s.setAuth);
  const [switching, setSwitching] = useState<ViewKey | null>(null);

  const accounts = useQuery({
    queryKey: ['demo-accounts'],
    queryFn: () => api.auth.demoAccounts(),
    staleTime: 60_000,
    retry: 0,
  });

  const current = viewOfRole(user?.role);

  const pickDemoUser = (list: User[], view: ViewKey): User | undefined =>
    view === 'manufacturer' ? list.find((u) => u.role === 'manufacturer') : list.find((u) => u.role === 'shop_owner');

  const switchTo = async (view: ViewKey): Promise<User | null> => {
    if (view === current) return null;
    setSwitching(view);
    try {
      const list = accounts.data ?? (await api.auth.demoAccounts());
      const target = pickDemoUser(list ?? [], view);
      if (!target) throw new Error(view === 'manufacturer' ? '演示账号里没有厂家身份' : '演示账号里没有店主身份');
      const res = await api.auth.switchDemoAccount(target.id);
      setAuth(res.token, res.user);
      await queryClient.invalidateQueries();
      Taro.showToast({ title: `已切换到${VIEW_LABELS[view]}`, icon: 'success' });
      return res.user;
    } catch (e) {
      Taro.showToast({ title: errMsg(e, '视角切换失败（接口可能尚未上线）'), icon: 'none' });
      return null;
    } finally {
      setSwitching(null);
    }
  };

  return {
    /** 当前视角 */
    current,
    /** 正在切换的目标视角（null = 未在切换） */
    switching,
    /** 演示账号列表（含各身份 id，便于排障） */
    accounts: accounts.data ?? [],
    accountsError: accounts.isError ? errMsg(accounts.error, '演示账号加载失败') : null,
    switchTo,
  };
}
