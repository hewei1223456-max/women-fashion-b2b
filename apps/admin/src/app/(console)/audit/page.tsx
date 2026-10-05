'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Badge, Empty } from '@/components/AdminShell';
import { AUDIT_STATUS_LABELS, BIZ_LABELS, formatDate } from '@/lib/format';
import type { AuditLog } from '@wfb/shared-types';

/** 人工复审队列（PRD 23.5）：查看原文/原图、确认违规/误判、执行删除/警告/封禁 */
export default function AuditPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>('manual_pending');
  const [bizType, setBizType] = useState<string>('');
  const [reason, setReason] = useState('');
  const [active, setActive] = useState<AuditLog | null>(null);
  const [toast, setToast] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit-queue', status, bizType],
    queryFn: () => api.audit.queue({ page: 1, pageSize: 50, reviewStatus: status as never, bizType: bizType || undefined }),
    retry: 1,
  });

  const review = useMutation({
    mutationFn: (p: { auditLogId: number; action: 'pass' | 'reject' }) => api.audit.review({ ...p, reason }),
    onSuccess: (_, v) => {
      setToast(v.action === 'pass' ? '已判定为误判，内容恢复展示' : '已确认违规，内容已下架');
      setActive(null);
      setReason('');
      qc.invalidateQueries({ queryKey: ['audit-queue'] });
      setTimeout(() => setToast(''), 3000);
    },
    onError: (e) => setToast(e instanceof Error ? e.message : '操作失败'),
  });

  const rows = data?.list ?? [];

  return (
    <>
      <PageHeader
        title="内容复审队列"
        desc="审核不通过的内容在此进入人工复审；确认违规将下架内容并记录处置，误判则恢复展示"
        action={toast ? <Badge tone="green">{toast}</Badge> : undefined}
      />

      <div className="card mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-600">复审状态</label>
        <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="manual_pending">待人工复审</option>
          <option value="auto_reject">自动拦截</option>
          <option value="auto_pass">自动通过</option>
          <option value="manual_pass">人工通过</option>
          <option value="manual_reject">人工驳回</option>
        </select>
        <label className="text-sm text-slate-600">业务类型</label>
        <select className="input w-36" value={bizType} onChange={(e) => setBizType(e.target.value)}>
          <option value="">全部</option>
          <option value="article">资讯内容</option>
          <option value="comment">评论</option>
          <option value="product">厂家款</option>
          <option value="image">图片</option>
        </select>
        <span className="ml-auto text-xs text-slate-400">共 {data?.total ?? 0} 条</span>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? <Empty text="加载中…" /> : null}
        {error ? <Empty text={`加载失败：${error instanceof Error ? error.message : '未知错误'}`} /> : null}
        {!isLoading && !error && rows.length === 0 ? <Empty text="该筛选条件下没有待处理记录" /> : null}

        {rows.length > 0 ? (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="th w-16">ID</th>
                <th className="th w-24">类型</th>
                <th className="th">被审内容</th>
                <th className="th w-28">机审结论</th>
                <th className="th w-32">复审状态</th>
                <th className="th w-40">时间</th>
                <th className="th w-40">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="td text-slate-400">#{r.id}</td>
                  <td className="td">
                    <Badge tone="blue">{BIZ_LABELS[r.bizType] ?? r.bizType}</Badge>
                  </td>
                  <td className="td">
                    <div className="max-w-xl truncate text-slate-700">{r.text || r.contentUrl || '-'}</div>
                    {r.contentUrl ? (
                      <a href={r.contentUrl} target="_blank" rel="noreferrer" className="text-xs text-brand">
                        查看原图 ↗
                      </a>
                    ) : null}
                  </td>
                  <td className="td">
                    <Badge tone={r.auditResult === 'pass' ? 'green' : r.auditResult === 'block' ? 'rose' : 'amber'}>
                      {r.auditResult}
                    </Badge>
                  </td>
                  <td className="td">
                    <Badge tone={r.reviewStatus.includes('reject') ? 'rose' : r.reviewStatus.includes('pass') ? 'green' : 'amber'}>
                      {AUDIT_STATUS_LABELS[r.reviewStatus] ?? r.reviewStatus}
                    </Badge>
                  </td>
                  <td className="td text-xs text-slate-500">{formatDate(r.createdAt)}</td>
                  <td className="td">
                    <div className="flex gap-2">
                      <button className="btn-ghost" onClick={() => setActive(r)}>
                        复审
                      </button>
                      <button
                        className="btn-success"
                        disabled={review.isPending}
                        onClick={() => review.mutate({ auditLogId: r.id, action: 'pass' })}
                      >
                        误判
                      </button>
                      <button
                        className="btn-danger"
                        disabled={review.isPending}
                        onClick={() => review.mutate({ auditLogId: r.id, action: 'reject' })}
                      >
                        违规
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      {active ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setActive(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 text-base font-semibold">复审确认 · #{active.id}</div>
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-slate-500">被审内容</div>
                <div className="mt-1 rounded-lg bg-slate-50 p-3 text-slate-700">{active.text || '(图片)'}</div>
              </div>
              {active.contentUrl ? (
                <img src={active.contentUrl} alt="被审原图" className="max-h-60 rounded-lg border border-slate-200" />
              ) : null}
              <div>
                <div className="text-xs text-slate-500">机审明细</div>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  {JSON.stringify(active.auditDetail ?? {}, null, 2)}
                </pre>
              </div>
              <div>
                <div className="text-xs text-slate-500">处置说明（可选）</div>
                <input className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：含虚假宣传词，下架并警告" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setActive(null)}>
                取消
              </button>
              <button className="btn-success" onClick={() => review.mutate({ auditLogId: active.id, action: 'pass' })}>
                判定误判并恢复
              </button>
              <button className="btn-danger" onClick={() => review.mutate({ auditLogId: active.id, action: 'reject' })}>
                确认违规并下架
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
