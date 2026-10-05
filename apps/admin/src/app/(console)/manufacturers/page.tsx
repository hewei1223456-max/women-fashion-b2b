'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, StatCard, Badge, Empty, Bar } from '@/components/AdminShell';
import { compact, formatDate, percent } from '@/lib/format';
import { MANUFACTURER_PLANS } from '@wfb/shared-types';

/**
 * 厂家与加微看板：
 * - 厂家列表（款数 / 加微转化率 / 版本权益）
 * - 加微记录明细（可看跟进状态，对应 PRD 9.2「加微追踪看板」与 25% 反馈权重口径）
 * - 版本分层权益表（PRD 9.3，直接读 @wfb/shared-types 的 MANUFACTURER_PLANS，避免口径不一致）
 */
export default function ManufacturersPage() {
  const [manufacturerId, setManufacturerId] = useState<number | null>(null);

  const mfList = useQuery({
    queryKey: ['admin-manufacturers'],
    queryFn: () => api.source.manufacturers({ page: 1, pageSize: 50, role: 'manufacturer' }),
    retry: 1,
  });

  const contacts = useQuery({
    queryKey: ['admin-contact-list'],
    queryFn: () => api.contact.list({ page: 1, pageSize: 30 }),
    retry: 1,
  });

  const rows = mfList.data?.list ?? [];
  const logs = (contacts.data?.list ?? []).filter((l) => !manufacturerId || l.manufacturerId === manufacturerId);

  const totalContacts = logs.length;
  const converted = logs.filter((l) => l.followUpStatus === 'converted').length;
  const validRate = totalContacts ? converted / totalContacts : 0;

  return (
    <>
      <PageHeader
        title="厂家与加微看板"
        desc="曝光/加微/转化率/有效反馈四项口径：对应搜索排序的「历史表现 35% + 反馈 25%」"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="入驻厂家" value={rows.length} hint="含免费版与付费版" />
        <StatCard label="加微记录" value={compact(totalContacts)} hint="近 30 条明细" />
        <StatCard label="已转化" value={converted} hint="客服回访确认为有效" tone="good" />
        <StatCard label="有效反馈率" value={percent(validRate, 1)} hint="反馈维度得分来源" tone={validRate >= 0.5 ? 'good' : 'warn'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        <div className="card xl:col-span-2 p-0 overflow-hidden">
          <div className="card-title px-5 pt-5">
            <span>厂家列表</span>
            <span className="text-xs font-normal text-slate-400">点击行筛选下方加微记录</span>
          </div>
          {mfList.isLoading ? <Empty text="加载中…" /> : null}
          {mfList.error ? <Empty text={`加载失败：${mfList.error instanceof Error ? mfList.error.message : ''}`} /> : null}
          {!mfList.isLoading && rows.length === 0 ? <Empty /> : null}
          {rows.length > 0 ? (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="th">厂家</th>
                  <th className="th w-24">款数</th>
                  <th className="th w-28">加微转化率</th>
                  <th className="th w-32">版本</th>
                  <th className="th w-24">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((m) => (
                  <tr key={m.id} className={manufacturerId === m.id ? 'bg-brand-light' : 'hover:bg-slate-50'}>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <img src={m.avatarUrl} alt="" className="h-7 w-7 rounded-full bg-slate-200" />
                        <div>
                          <div className="text-sm text-slate-800">{m.nickname}</div>
                          <div className="text-xs text-slate-400">{m.companyName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="td">{m.productCount}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <span className="w-12 text-xs">{percent(m.contactRate, 2)}</span>
                        <div className="w-20">
                          <Bar value={m.contactRate} max={0.2} tone="bg-accent" />
                        </div>
                      </div>
                    </td>
                    <td className="td text-xs">{m.memberLevel}</td>
                    <td className="td">
                      <button
                        className="btn-ghost"
                        onClick={() => setManufacturerId(manufacturerId === m.id ? null : m.id)}
                      >
                        {manufacturerId === m.id ? '取消筛选' : '看记录'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="card-title px-5 pt-5">
            <span>版本权益对照</span>
            <span className="text-xs font-normal text-slate-400">PRD 9.3</span>
          </div>
          <div className="px-5 pb-5 space-y-3">
            {MANUFACTURER_PLANS.map((p) => (
              <div key={p.level} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-800">{p.label}</span>
                  <span className="text-sm text-brand">¥{p.price.toLocaleString()}/年</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-slate-500">
                  <span>主动私信 {p.dailyMessages < 0 ? '无限' : `${p.dailyMessages} 条/日`}</span>
                  <span>可发布款 {p.productLimit < 0 ? '不限' : `${p.productLimit} 款`}</span>
                  <span>子账号 {p.subAccounts < 0 ? '无限' : p.subAccounts}</span>
                  <span>看板 {p.dashboard}</span>
                  <span>群发 {p.groupSend ? '✓' : '✗'}</span>
                  <span>订货会 {p.orderingFair ? '✓' : '✗'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="card-title px-5 pt-5">
          <span>加微记录明细{manufacturerId ? `（厂家 #${manufacturerId}）` : ''}</span>
          <span className="text-xs font-normal text-slate-400">共 {logs.length} 条</span>
        </div>
        {contacts.isLoading ? <Empty text="加载中…" /> : null}
        {contacts.error ? <Empty text={`加载失败：${contacts.error instanceof Error ? contacts.error.message : ''}`} /> : null}
        {!contacts.isLoading && logs.length === 0 ? <Empty text="暂无加微记录" /> : null}
        {logs.length > 0 ? (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="th w-16">ID</th>
                <th className="th">店主</th>
                <th className="th">来源款</th>
                <th className="th w-32">来源入口</th>
                <th className="th w-32">跟进状态</th>
                <th className="th w-40">加微时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="td text-slate-400">#{l.id}</td>
                  <td className="td">{l.shopOwner?.nickname ?? `店主 #${l.shopOwnerId}`}</td>
                  <td className="td max-w-xs truncate text-slate-600">{l.productTitle ?? '-'}</td>
                  <td className="td">
                    <Badge tone="blue">{l.source}</Badge>
                  </td>
                  <td className="td">
                    <Badge tone={l.followUpStatus === 'converted' ? 'green' : l.followUpStatus === 'invalid' ? 'gray' : 'amber'}>
                      {l.followUpStatus}
                    </Badge>
                  </td>
                  <td className="td text-xs text-slate-500">{formatDate(l.contactedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </>
  );
}
