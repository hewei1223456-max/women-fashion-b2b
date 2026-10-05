'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useApi } from '@/lib/api-context';
import { adminLogout } from '@/lib/api';
import { clsx, ROLE_LABELS } from '@/lib/format';

const NAV = [
  { href: '/', label: '数据概览', icon: '📊' },
  { href: '/audit', label: '内容复审', icon: '🛡️' },
  { href: '/users', label: '用户管理', icon: '👥' },
  { href: '/cert', label: '认证审批', icon: '📄' },
  { href: '/manufacturers', label: '厂家与加微', icon: '🧵' },
  { href: '/recommend', label: '推荐策略', icon: '🎯' },
  { href: '/content', label: '内容与互动', icon: '📝' },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { admin, refreshAdmin } = useApi();

  const logout = () => {
    adminLogout();
    refreshAdmin();
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white">
        <div className="px-5 py-5 border-b border-slate-200">
          <div className="text-base font-bold text-brand">女装B2B · 运营后台</div>
          <div className="mt-1 text-xs text-slate-400">认知基础设施 + 连接引擎</div>
        </div>
        <nav className="p-3 space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors',
                  active ? 'bg-brand-light text-brand font-semibold' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 mt-2 border-t border-slate-200">
          <div className="px-3 py-2 text-xs text-slate-400">
            当前账号
            <div className="mt-1 text-sm text-slate-700 font-medium">{admin?.nickname ?? '未登录'}</div>
            <div className="text-xs text-slate-400">{admin ? ROLE_LABELS[admin.role] ?? admin.role : '-'}</div>
          </div>
          <button className="btn-ghost w-full mt-2" onClick={logout}>
            退出登录
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-6">{children}</main>
    </div>
  );
}

/** 页面标题 + 说明 + 右侧操作 */
export function PageHeader({ title, desc, action }: { title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {desc ? <p className="mt-1 text-sm text-slate-500">{desc}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
  const tones = {
    default: 'text-slate-900',
    good: 'text-emerald-600',
    warn: 'text-amber-600',
    bad: 'text-rose-600',
  } as const;
  return (
    <div className="card">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={clsx('mt-2 text-2xl font-bold', tones[tone])}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
}

export function Badge({ children, tone = 'gray' }: { children: React.ReactNode; tone?: 'gray' | 'blue' | 'green' | 'amber' | 'rose' }) {
  const tones = {
    gray: 'bg-slate-100 text-slate-600',
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
  } as const;
  return <span className={clsx('tag', tones[tone])}>{children}</span>;
}

export function Bar({ value, max, tone = 'bg-brand' }: { value: number; max: number; tone?: string }) {
  const width = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-slate-100">
      <div className={clsx('h-2 rounded-full', tone)} style={{ width: `${width}%` }} />
    </div>
  );
}

export function Empty({ text = '暂无数据' }: { text?: string }) {
  return <div className="py-16 text-center text-sm text-slate-400">{text}</div>;
}
