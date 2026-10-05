'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Badge, Empty, StatCard } from '@/components/AdminShell';
import { compact, formatDate } from '@/lib/format';
import { ARTICLE_TYPE_LABELS } from '@wfb/shared-types';

/** 内容行视图模型：把 ArticleSummary（资讯）与 Product（货源）统一成可共用的列 */
interface ContentRow {
  id: number;
  title: string;
  coverUrl: string;
  images?: string[];
  viewCount: number;
  likeCount: number;
  collectCount: number;
  commentCount: number;
  shareCount?: number;
  styleTags?: string[];
  type?: string;
  contentType?: string;
  auditStatus?: string;
  createdAt: string;
  author?: { nickname: string };
  manufacturer?: { nickname: string };
}

/**
 * 内容与互动总览：资讯/货源内容审核状态 + 话题榜 + 互动量分布。
 * 对应 PRD 第八、九、十四、十五节的内容运营视角。
 */
export default function ContentPage() {
  const qc = useQueryClient();
  const [board, setBoard] = useState<'all' | 'info' | 'source'>('all');
  const [toast, setToast] = useState('');

  const feed = useQuery({
    queryKey: ['admin-content-feed', board],
    queryFn: async () => {
      // 两个板块返回不同的实体形状，这里统一到「内容行」视图模型
      const res = board === 'source' ? await api.source.feed({ page: 1, pageSize: 30 }) : await api.info.feed({ page: 1, pageSize: 30 });
      return res;
    },
    retry: 1,
  });

  const topics = useQuery({
    queryKey: ['admin-topics'],
    queryFn: () => api.topic.list({ page: 1, pageSize: 20 }),
    retry: 1,
  });

  const review = useMutation({
    mutationFn: (p: { id: number; action: 'approve' | 'reject' }) => api.admin.reviewContent(p.id, p.action),
    onSuccess: (_, v) => {
      setToast(v.action === 'approve' ? '内容已通过审核' : '内容已下架');
      qc.invalidateQueries({ queryKey: ['admin-content-feed'] });
      setTimeout(() => setToast(''), 2500);
    },
    onError: (e) => setToast(e instanceof Error ? e.message : '操作失败'),
  });

  const rows = ((feed.data?.list ?? []) as unknown) as ContentRow[];

  const totals = rows.reduce(
    (acc, r) => ({
      views: acc.views + (r.viewCount ?? 0),
      likes: acc.likes + (r.likeCount ?? 0),
      collects: acc.collects + (r.collectCount ?? 0),
      comments: acc.comments + (r.commentCount ?? 0),
      shares: acc.shares + (r.shareCount ?? 0),
    }),
    { views: 0, likes: 0, collects: 0, comments: 0, shares: 0 },
  );

  const topicRows = topics.data?.list ?? [];

  return (
    <>
      <PageHeader
        title="内容与互动"
        desc="资讯 + 货源两个板块的内容审核状态、互动数据与话题热度"
        action={toast ? <Badge tone="green">{toast}</Badge> : undefined}
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="浏览总量" value={compact(totals.views)} hint={`${rows.length} 条内容`} />
        <StatCard label="点赞" value={compact(totals.likes)} />
        <StatCard label="收藏" value={compact(totals.collects)} />
        <StatCard label="评论" value={compact(totals.comments)} />
        <StatCard label="转发" value={compact(totals.shares)} />
      </div>

      <div className="card mb-4 flex items-center gap-3">
        {(
          [
            ['all', '资讯内容'],
            ['source', '货源内容'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={board === k ? 'btn-primary' : 'btn-ghost'} onClick={() => setBoard(k)}>
            {label}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400">共 {feed.data?.total ?? 0} 条</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="card xl:col-span-2 p-0 overflow-hidden">
          <div className="card-title px-5 pt-5">内容列表</div>
          {feed.isLoading ? <Empty text="加载中…" /> : null}
          {feed.error ? <Empty text={`加载失败：${feed.error instanceof Error ? feed.error.message : ''}`} /> : null}
          {!feed.isLoading && rows.length === 0 ? <Empty /> : null}
          {rows.length > 0 ? (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="th w-16">ID</th>
                  <th className="th">标题</th>
                  <th className="th w-24">类型</th>
                  <th className="th w-32">作者</th>
                  <th className="th w-24">浏览</th>
                  <th className="th w-40">互动</th>
                  <th className="th w-28">状态</th>
                  <th className="th w-32">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="td text-slate-400">#{r.id}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <img src={r.coverUrl || r.images?.[0]} alt="" className="h-9 w-9 rounded bg-slate-200 object-cover" />
                        <div className="min-w-0">
                          <div className="max-w-sm truncate text-sm text-slate-800">{r.title}</div>
                          <div className="flex gap-1 text-xs text-slate-400">
                            {(r.styleTags ?? []).slice(0, 2).map((t) => (
                              <span key={t}>#{t}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="td text-xs">
                      {ARTICLE_TYPE_LABELS[r.type ?? ''] ?? r.contentType ?? '-'}
                    </td>
                    <td className="td text-xs">{r.author?.nickname ?? r.manufacturer?.nickname ?? '-'}</td>
                    <td className="td">{compact(r.viewCount)}</td>
                    <td className="td text-xs text-slate-500">
                      赞 {compact(r.likeCount)} · 藏 {compact(r.collectCount)} · 评 {compact(r.commentCount)}
                    </td>
                    <td className="td">
                      <Badge tone={r.auditStatus === 'approved' ? 'green' : r.auditStatus === 'pending' ? 'amber' : 'rose'}>
                        {r.auditStatus ?? 'approved'}
                      </Badge>
                    </td>
                    <td className="td">
                      <div className="flex gap-1.5">
                        <button className="btn-ghost" onClick={() => review.mutate({ id: r.id, action: 'approve' })}>
                          通过
                        </button>
                        <button className="btn-danger" onClick={() => review.mutate({ id: r.id, action: 'reject' })}>
                          下架
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>

        <div className="card">
          <div className="card-title">
            <span>话题热度榜</span>
            <span className="text-xs font-normal text-slate-400">按出现频次</span>
          </div>
          {topics.isLoading ? <Empty text="加载中…" /> : null}
          {topics.error ? <Empty text={`加载失败：${topics.error instanceof Error ? topics.error.message : ''}`} /> : null}
          {!topics.isLoading && topicRows.length === 0 ? <Empty text="暂无话题数据" /> : null}
          <div className="space-y-2">
            {topicRows.map((t, i) => (
              <div key={t.tag} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`w-5 text-center text-xs ${i < 3 ? 'font-bold text-accent' : 'text-slate-400'}`}>{i + 1}</span>
                  <div>
                    <div className="text-sm text-slate-800">#{t.name}</div>
                    <div className="text-xs text-slate-400">
                      {t.contentCount} 条内容 · 浏览 {compact(t.viewCount)}
                    </div>
                  </div>
                </div>
                <span className="text-xs text-slate-500">热度 {t.heat}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        最近一条内容更新时间：{formatDate(rows[0]?.createdAt)}
      </p>
    </>
  );
}
