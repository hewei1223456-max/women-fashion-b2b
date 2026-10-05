'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useApi } from '@/lib/api-context';
import { PageHeader, StatCard, Bar, Empty, Badge } from '@/components/AdminShell';
import { compact, percent, ROLE_LABELS } from '@/lib/format';

/**
 * 数据概览：对应 PRD 第十三篇「核心指标仪表盘」+ 第九篇各表统计。
 * 数据来自 GET /api/admin/overview（含 kpi 数组），全部为真实统计而非写死。
 */
export default function OverviewPage() {
  const { admin } = useApi();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => api.admin.overview(),
    retry: 1,
  });

  if (isLoading) return <div className="card">加载中…</div>;
  if (error || !data) {
    return (
      <div className="card">
        <div className="text-sm text-rose-600">数据加载失败：{error instanceof Error ? error.message : '未知错误'}</div>
        <button className="btn-primary mt-4" onClick={() => refetch()}>
          重新加载
        </button>
      </div>
    );
  }

  const maxTrend = Math.max(1, ...data.trend.map((t) => Math.max(t.exposure, t.newUsers * 20)));

  return (
    <>
      <PageHeader
        title={`数据概览${admin ? ` · ${admin.nickname}` : ''}`}
        desc="核心指标达成情况、内容与用户增长、加微转化与收入结构"
        action={
          <button className="btn-ghost" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? '刷新中…' : '刷新数据'}
          </button>
        }
      />

      {/* 核心 KPI（第十三篇目标值对照） */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {data.kpi.map((k) => (
          <StatCard
            key={k.key}
            label={k.label}
            value={`${k.value}${k.unit}`}
            hint={`目标 ${k.target}${k.unit}`}
            tone={k.pass ? 'good' : 'warn'}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 mb-6">
        <StatCard label="用户总数" value={compact(data.users.total)} hint={`认证店主 ${data.users.shopOwner} · 厂家 ${data.users.manufacturer}`} />
        <StatCard label="地标大店" value={compact(data.users.landmark)} hint={`今日新增 ${data.users.newToday}`} />
        <StatCard label="内容总数" value={compact(data.content.total)} hint={`待审 ${data.content.pending} · 今日发布 ${data.content.publishedToday}`} />
        <StatCard label="加微次数" value={compact(data.contacts.total)} hint={`今日 ${data.contacts.today} · 转化率 ${percent(data.contacts.rate, 2)}`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        {/* 增长趋势 */}
        <div className="card xl:col-span-2">
          <div className="card-title">
            <span>近 7 日增长趋势</span>
            <span className="text-xs font-normal text-slate-400">曝光量 / 新增用户</span>
          </div>
          {data.trend.length === 0 ? (
            <Empty />
          ) : (
            <div className="space-y-3">
              {data.trend.map((t) => (
                <div key={t.date}>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                    <span>{t.date}</span>
                    <span>
                      曝光 {compact(t.exposure)} · 新增 {t.newUsers} · 加微 {t.contacts} · 发布 {t.publishes}
                    </span>
                  </div>
                  <Bar value={t.exposure} max={maxTrend} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 收入结构 */}
        <div className="card">
          <div className="card-title">
            <span>版本收入结构</span>
            <span className="text-xs font-normal text-slate-400">MRR ¥{compact(data.revenue.mrr)}</span>
          </div>
          <div className="space-y-3">
            {data.revenue.byLevel.map((r) => (
              <div key={r.level}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-slate-600">{r.level}</span>
                  <span className="text-slate-500">
                    {r.count} 家 · ¥{compact(r.amount)}
                  </span>
                </div>
                <Bar
                  value={r.amount}
                  max={Math.max(1, ...data.revenue.byLevel.map((x) => x.amount))}
                  tone="bg-accent"
                />
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
            厂家付费 {data.revenue.manufacturers} 家 · 店主人会员 {data.revenue.owners} 人
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card">
          <div className="card-title">互动数据</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-slate-500 text-xs">点赞</div>
              <div className="text-lg font-semibold">{compact(data.interactions.likes)}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs">评论</div>
              <div className="text-lg font-semibold">{compact(data.interactions.comments)}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs">收藏</div>
              <div className="text-lg font-semibold">{compact(data.interactions.collects)}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs">转发</div>
              <div className="text-lg font-semibold">{compact(data.interactions.shares)}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">认证状态分布</div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">待审核</span>
              <Badge tone="amber">{data.cert.pending}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">已通过</span>
              <Badge tone="green">{data.cert.approved}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">已驳回</span>
              <Badge tone="rose">{data.cert.rejected}</Badge>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">内容与款审核</div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">内容待审</span>
              <Badge tone="amber">{data.content.pending}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">内容已驳回</span>
              <Badge tone="rose">{data.content.rejected}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">款总数</span>
              <Badge tone="blue">{data.products.total}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">款待审</span>
              <Badge tone="amber">{data.products.pending}</Badge>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-6 text-xs text-slate-400">
        角色分布口径：{Object.entries(ROLE_LABELS).map(([k, v]) => `${v}=${k}`).join(' / ')}
      </p>
    </>
  );
}
