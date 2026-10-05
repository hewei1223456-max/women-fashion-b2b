'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Badge, Empty } from '@/components/AdminShell';
import { formatDate } from '@/lib/format';

/**
 * 认证审批：营业执照 OCR 结果 + 法人信息 + 四步认证进度，运营可一键通过/驳回。
 * 数据来自 GET /api/admin/users?certStatus=pending（复用用户表，附带 OCR 数据）。
 */
export default function CertPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [reason, setReason] = useState('营业执照信息与法人信息不一致');
  const [active, setActive] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-cert', status],
    queryFn: () => api.admin.users({ page: 1, pageSize: 50, certStatus: status }),
    retry: 1,
  });

  const act = useMutation({
    mutationFn: (p: { userId: number; action: 'approve' | 'reject' }) => api.admin.updateCert(p.userId, p.action, reason),
    onSuccess: () => {
      setActive(null);
      qc.invalidateQueries({ queryKey: ['admin-cert'] });
    },
  });

  const rows = data?.list ?? [];

  return (
    <>
      <PageHeader
        title="认证审批"
        desc="营业执照 OCR → 法人身份证 → 人脸核验 → 对公打款四步验证后的终审；通过即获得「认证店主/认证厂家」标识"
      />

      <div className="card mb-4 flex items-center gap-3">
        {(['pending', 'approved', 'rejected'] as const).map((s) => (
          <button
            key={s}
            className={status === s ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setStatus(s)}
          >
            {s === 'pending' ? '待审核' : s === 'approved' ? '已通过' : '已驳回'}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400">共 {data?.total ?? 0} 条</span>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? <Empty text="加载中…" /> : null}
        {error ? <Empty text={`加载失败：${error instanceof Error ? error.message : '未知错误'}`} /> : null}
        {!isLoading && !error && rows.length === 0 ? <Empty text="没有待处理的认证申请" /> : null}

        {rows.length > 0 ? (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="th w-16">ID</th>
                <th className="th">申请主体</th>
                <th className="th w-32">角色</th>
                <th className="th w-28">认证状态</th>
                <th className="th w-40">营业执照</th>
                <th className="th w-36">提交时间</th>
                <th className="th w-40">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="td text-slate-400">#{u.id}</td>
                  <td className="td">
                    <div className="text-sm font-medium text-slate-800">{u.companyName || u.nickname}</div>
                    <div className="text-xs text-slate-400">
                      {u.nickname} · {u.phone}
                    </div>
                  </td>
                  <td className="td text-xs">{u.role}</td>
                  <td className="td">
                    <Badge tone={u.certStatus === 'approved' ? 'green' : u.certStatus === 'pending' ? 'amber' : 'rose'}>
                      {u.certStatus}
                    </Badge>
                  </td>
                  <td className="td">
                    {u.certLicenseUrl ? (
                      <a href={u.certLicenseUrl} target="_blank" rel="noreferrer" className="text-xs text-brand">
                        查看执照 ↗
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">未上传</span>
                    )}
                  </td>
                  <td className="td text-xs text-slate-500">{formatDate(u.createdAt)}</td>
                  <td className="td">
                    <div className="flex gap-2">
                      <button className="btn-ghost" onClick={() => setActive(u.id)}>
                        查看 OCR
                      </button>
                      <button className="btn-success" disabled={act.isPending} onClick={() => act.mutate({ userId: u.id, action: 'approve' })}>
                        通过
                      </button>
                      <button className="btn-danger" disabled={act.isPending} onClick={() => act.mutate({ userId: u.id, action: 'reject' })}>
                        驳回
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      {active !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setActive(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 text-base font-semibold">营业执照 OCR 结果 · #{active}</div>
            <pre className="max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              {JSON.stringify(rows.find((r) => r.id === active)?.certOcrData ?? { note: '该用户未提交 OCR 数据' }, null, 2)}
            </pre>
            <div className="mt-4">
              <div className="text-xs text-slate-500">驳回原因（驳回时使用）</div>
              <input className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setActive(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
