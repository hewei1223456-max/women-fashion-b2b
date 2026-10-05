'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminLogin } from '@/lib/api';
import { useApi } from '@/lib/api-context';
import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { ROLE_LABELS } from '@/lib/format';

/** 演示账号（与后端 seed 顺序一致：1 七叔运营，其余角色） */
const DEMO_IDS = [1, 2, 7, 11, 13];

export default function LoginPage() {
  const router = useRouter();
  const { refreshAdmin } = useApi();
  const [loading, setLoading] = useState<number | null>(null);
  const [error, setError] = useState('');

  const accounts = useQuery({
    queryKey: ['demo-accounts'],
    queryFn: () => api.auth.demoAccounts(),
    retry: 1,
  });

  const login = async (id: number) => {
    setLoading(id);
    setError('');
    try {
      await adminLogin(id);
      refreshAdmin();
      router.push('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败，请确认后端 http://localhost:3100 已启动');
    } finally {
      setLoading(null);
    }
  };

  const list = (accounts.data ?? []).filter((u) => DEMO_IDS.includes(u.id));

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-brand">女装B2B行业平台 · 运营后台</h1>
          <p className="mt-2 text-sm text-slate-500">
            内容复审 / 用户与认证 / 厂家加微看板 / 推荐策略 / 核心指标
          </p>
        </div>

        <div className="card">
          <div className="card-title">
            <span>选择演示账号登录</span>
            <span className="text-xs font-normal text-slate-400">Demo 环境无需密码</span>
          </div>

          {accounts.isLoading ? <div className="py-8 text-center text-sm text-slate-400">加载账号中…</div> : null}
          {accounts.isError ? (
            <div className="py-8 text-center text-sm text-rose-600">
              无法连接后端 API（http://localhost:3100）。请先启动：<code className="rounded bg-slate-100 px-1.5 py-0.5">cd apps/api &amp;&amp; pnpm dev</code>
            </div>
          ) : null}

          <div className="space-y-2">
            {list.map((u) => (
              <button
                key={u.id}
                onClick={() => login(u.id)}
                disabled={loading !== null}
                className="w-full flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left hover:border-brand hover:bg-brand-light transition-colors disabled:opacity-60"
              >
                <span className="flex items-center gap-3">
                  <img src={u.avatarUrl} alt="" className="h-9 w-9 rounded-full bg-slate-200" />
                  <span>
                    <span className="block text-sm font-medium text-slate-800">{u.nickname}</span>
                    <span className="block text-xs text-slate-400">{ROLE_LABELS[u.role] ?? u.role}</span>
                  </span>
                </span>
                <span className="text-xs text-brand">{loading === u.id ? '登录中…' : '一键登录 →'}</span>
              </button>
            ))}
          </div>

          {error ? <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          推荐使用「七叔（平台运营）」查看全量数据；「简派制衣」查看厂家加微看板。
        </p>
      </div>
    </div>
  );
}
