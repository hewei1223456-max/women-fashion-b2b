'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Badge, Empty } from '@/components/AdminShell';
import { CERT_LABELS, ROLE_LABELS, compact, formatDate } from '@/lib/format';

/** 用户管理：按角色 / 认证状态 / 关键词筛选，可查看内容量与粉丝量 */
export default function UsersPage() {
  const [role, setRole] = useState('');
  const [cert, setCert] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users', role, cert, keyword, page],
    queryFn: () =>
      api.admin.users({
        page,
        pageSize: 20,
        role: (role || undefined) as never,
        certStatus: (cert || undefined) as never,
        keyword: keyword || undefined,
      }),
    retry: 1,
  });

  const rows = data?.list ?? [];

  return (
    <>
      <PageHeader title="用户管理" desc="认证店主 / 厂家 / 地标大店 / 讲师 / 运营账号，含内容量与粉丝量" />

      <div className="card mb-4 flex flex-wrap items-center gap-3">
        <input
          className="input w-56"
          placeholder="搜索昵称 / 公司名 / 手机号"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            setPage(1);
          }}
        />
        <select className="input w-36" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
          <option value="">全部角色</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className="input w-36" value={cert} onChange={(e) => { setCert(e.target.value); setPage(1); }}>
          <option value="">全部认证状态</option>
          {Object.entries(CERT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-slate-400">共 {data?.total ?? 0} 人</span>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? <Empty text="加载中…" /> : null}
        {error ? <Empty text={`加载失败：${error instanceof Error ? error.message : '未知错误'}`} /> : null}
        {!isLoading && !error && rows.length === 0 ? <Empty /> : null}

        {rows.length > 0 ? (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="th w-16">ID</th>
                <th className="th">用户</th>
                <th className="th w-28">角色</th>
                <th className="th w-24">认证</th>
                <th className="th w-32">会员版本</th>
                <th className="th w-40">风格标签</th>
                <th className="th w-24">内容</th>
                <th className="th w-24">粉丝</th>
                <th className="th w-36">注册时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="td text-slate-400">#{u.id}</td>
                  <td className="td">
                    <div className="flex items-center gap-3">
                      <img src={u.avatarUrl} alt="" className="h-8 w-8 rounded-full bg-slate-200" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-800">{u.nickname}</div>
                        <div className="truncate text-xs text-slate-400">{u.companyName || u.phone || '-'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="td">
                    <Badge tone={u.role === 'manufacturer' ? 'blue' : u.role === 'admin' ? 'rose' : 'gray'}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </Badge>
                  </td>
                  <td className="td">
                    <Badge tone={u.certStatus === 'approved' ? 'green' : u.certStatus === 'pending' ? 'amber' : 'gray'}>
                      {CERT_LABELS[u.certStatus] ?? u.certStatus}
                    </Badge>
                  </td>
                  <td className="td text-xs">{u.memberLevel}</td>
                  <td className="td">
                    <div className="flex flex-wrap gap-1">
                      {(u.styleTags ?? []).slice(0, 3).map((t) => (
                        <span key={t} className="tag bg-slate-100 text-slate-600">
                          {t}
                        </span>
                      ))}
                      {(u.styleTags ?? []).length === 0 ? <span className="text-xs text-slate-400">-</span> : null}
                    </div>
                  </td>
                  <td className="td">{compact(u.contentCount)}</td>
                  <td className="td">{compact(u.followerCount)}</td>
                  <td className="td text-xs text-slate-500">{formatDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      {data && data.total > data.pageSize ? (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </button>
          <span className="text-sm text-slate-500">
            {page} / {Math.ceil(data.total / data.pageSize)}
          </span>
          <button className="btn-ghost" disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)}>
            下一页
          </button>
        </div>
      ) : null}
    </>
  );
}
