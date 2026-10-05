'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Badge, Empty, Bar } from '@/components/AdminShell';
import { CES_WEIGHTS, styleMatch, searchScore } from '@wfb/shared-utils';
import { STYLE_TAGS } from '@wfb/shared-types';
import { compact, percent } from '@/lib/format';

/**
 * 推荐策略可视化（PRD 第六篇 Phase 1 规则引擎）
 *
 * 这个页面刻意把「规则引擎的中间结果」暴露出来，用来验证算法确实在算而不是写死：
 * - 资讯流：风格匹配 → CES 热度 → 探索打散后的实际顺序与风格序列
 * - 货源流：风格 + 价格带 + 拿货地匹配 → 加微转化率加权 → 打散后的顺序
 * - 搜索：四维权重（25/35/25/15）的分解分
 * - CES 权重与多样化窗口：直接读 shared-utils 的常量，保证与后端一致
 */
export default function RecommendPage() {
  const [style, setStyle] = useState<string>('韩系');
  const [keyword, setKeyword] = useState('碎花');

  const infoFeed = useQuery({
    queryKey: ['rec-info', style],
    queryFn: () => api.info.feed({ page: 1, pageSize: 10, styleTags: style, tab: 'recommend' }),
    retry: 1,
  });

  const sourceFeed = useQuery({
    queryKey: ['rec-source', style],
    queryFn: () => api.source.feed({ page: 1, pageSize: 10, styleTags: style, tab: 'recommend' }),
    retry: 1,
  });

  const search = useQuery({
    queryKey: ['rec-search', keyword],
    queryFn: () => api.search.all({ keyword, page: 1, pageSize: 10 }),
    retry: 1,
  });

  const infoStyles = (infoFeed.data?.list ?? []).map((a) => a.styleTags?.[0] ?? '-');
  const distinctInfo = new Set(infoStyles).size;

  const productRates = (sourceFeed.data?.list ?? []).map((p) => p.contactRate ?? 0);
  const productStyles = (sourceFeed.data?.list ?? []).map((p) => p.styleTag ?? '-');
  const productShips = (sourceFeed.data?.list ?? []).map((p) => p.shipFrom ?? '-');

  return (
    <>
      <PageHeader
        title="推荐策略与算法可视化"
        desc="Phase 1 规则引擎的中间结果：风格匹配度 / CES 热度 / 加微转化率 / 探索打散 / 搜索四维权重"
        action={
          <div className="flex items-center gap-2">
            <select className="input w-32" value={style} onChange={(e) => setStyle(e.target.value)}>
              {STYLE_TAGS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {/* 算法参数：与后端共用同一份常量 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="card">
          <div className="card-title">CES 热度权重</div>
          <div className="space-y-2">
            {Object.entries(CES_WEIGHTS).map(([k, v]) => (
              <div key={k} className="flex items-center gap-3">
                <span className="w-14 text-xs text-slate-500">{k}</span>
                <div className="flex-1">
                  <Bar value={v} max={0.35} />
                </div>
                <span className="w-12 text-right text-xs text-slate-600">{(v * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">评论35% / 收藏28% / 完读18% / 分享12% / 点赞7%</p>
        </div>

        <div className="card">
          <div className="card-title">搜索排序权重</div>
          <div className="space-y-2">
            {[
              ['基础信息完整度', 0.25],
              ['历史表现', 0.35],
              ['反馈', 0.25],
              ['整体表现', 0.15],
            ].map(([label, w]) => (
              <div key={label as string} className="flex items-center gap-3">
                <span className="w-28 text-xs text-slate-500">{label}</span>
                <div className="flex-1">
                  <Bar value={w as number} max={0.35} tone="bg-accent" />
                </div>
                <span className="w-12 text-right text-xs text-slate-600">{((w as number) * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            口径与 shared-utils 的 searchScore() 完全一致，后端返回 scoreBreakdown 供核对
          </p>
        </div>

        <div className="card">
          <div className="card-title">当前请求的策略说明</div>
          {infoFeed.data ? (
            <div className="space-y-2 text-xs text-slate-600">
              <div>
                <span className="text-slate-400">冷启动：</span>
                {infoFeed.data.coldStart ? <Badge tone="amber">是（前 3 次走探索）</Badge> : <Badge tone="green">否（已收敛）</Badge>}
              </div>
              <div>
                <span className="text-slate-400">访问计数：</span>
                {infoFeed.data.visitCount}
              </div>
              <div>
                <span className="text-slate-400">策略：</span>
                <div className="mt-1 rounded bg-slate-50 p-2 leading-relaxed">{infoFeed.data.strategy}</div>
              </div>
              <div>
                <span className="text-slate-400">本条风格匹配度（{style}）：</span>
                {percent(styleMatch([style as never], infoStyles as never), 0)}
              </div>
            </div>
          ) : (
            <Empty text="等待后端返回" />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
        {/* 资讯流 */}
        <div className="card p-0 overflow-hidden">
          <div className="card-title px-5 pt-5">
            <span>资讯推荐流</span>
            <span className="text-xs font-normal text-slate-400">
              共 10 条 · 不同风格 {distinctInfo} 种 {distinctInfo >= 2 ? '✓ 打散生效' : '✗ 需检查打散'}
            </span>
          </div>
          {infoFeed.isLoading ? <Empty text="加载中…" /> : null}
          {infoFeed.error ? <Empty text={`加载失败：${infoFeed.error instanceof Error ? infoFeed.error.message : ''}`} /> : null}
          <div className="px-5 pb-5 space-y-2">
            {(infoFeed.data?.list ?? []).map((a, i) => (
              <div key={a.id} className="flex items-start gap-3 border-b border-slate-100 pb-2 last:border-0">
                <span className="mt-0.5 w-6 shrink-0 text-center text-xs text-slate-400">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-800">{a.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                    {(a.styleTags ?? []).map((t) => (
                      <span key={t} className="tag bg-slate-100 text-slate-600">
                        {t}
                      </span>
                    ))}
                    <span>CES {a.cesScore}</span>
                    <span>· 浏览 {compact(a.viewCount)}</span>
                    <span>· 赞 {a.likeCount}</span>
                    <span>· 评 {a.commentCount}</span>
                    <span>· 藏 {a.collectCount}</span>
                  </div>
                </div>
              </div>
            ))}
            {(infoFeed.data?.list ?? []).length === 0 && !infoFeed.isLoading ? <Empty /> : null}
          </div>
        </div>

        {/* 货源流 */}
        <div className="card p-0 overflow-hidden">
          <div className="card-title px-5 pt-5">
            <span>货源推荐流</span>
            <span className="text-xs font-normal text-slate-400">
              风格 {new Set(productStyles).size} 种 · 发货地 {new Set(productShips).size} 种
            </span>
          </div>
          {sourceFeed.isLoading ? <Empty text="加载中…" /> : null}
          {sourceFeed.error ? <Empty text={`加载失败：${sourceFeed.error instanceof Error ? sourceFeed.error.message : ''}`} /> : null}
          <div className="px-5 pb-5 space-y-2">
            {(sourceFeed.data?.list ?? []).map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 border-b border-slate-100 pb-2 last:border-0">
                <span className="w-6 shrink-0 text-center text-xs text-slate-400">{i + 1}</span>
                <img src={p.images?.[0]} alt="" className="h-12 w-10 rounded bg-slate-200 object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-800">{p.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                    <span className="tag bg-slate-100 text-slate-600">{p.styleTag}</span>
                    <span>¥{p.priceRange}</span>
                    <span>· {p.shipFrom}</span>
                    <span>· 起订 {p.moq}</span>
                    <span className="text-accent">· 加微率 {percent(p.contactRate ?? 0, 2)}</span>
                  </div>
                </div>
                <div className="w-16 shrink-0">
                  <Bar value={p.contactRate ?? 0} max={Math.max(0.01, ...productRates)} tone="bg-accent" />
                </div>
              </div>
            ))}
            {(sourceFeed.data?.list ?? []).length === 0 && !sourceFeed.isLoading ? <Empty /> : null}
          </div>
        </div>
      </div>

      {/* 搜索排序 */}
      <div className="card p-0 overflow-hidden">
        <div className="card-title px-5 pt-5">
          <span>搜索排序分解（四维加权）</span>
          <div className="flex items-center gap-2">
            <input className="input w-40" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索关键词" />
            <span className="text-xs font-normal text-slate-400">共 {search.data?.total ?? 0} 条命中</span>
          </div>
        </div>
        {search.isLoading ? <Empty text="加载中…" /> : null}
        {search.error ? <Empty text={`加载失败：${search.error instanceof Error ? search.error.message : ''}`} /> : null}
        {search.data && search.data.scoreBreakdown && search.data.scoreBreakdown.length > 0 ? (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="th w-16">款ID</th>
                <th className="th">款标题</th>
                <th className="th w-24">基础25%</th>
                <th className="th w-24">表现35%</th>
                <th className="th w-24">反馈25%</th>
                <th className="th w-24">整体15%</th>
                <th className="th w-28">加权总分</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {search.data.scoreBreakdown.map((s) => {
                const p = search.data!.products.find((x) => x.id === s.productId);
                return (
                  <tr key={s.productId} className="hover:bg-slate-50">
                    <td className="td text-slate-400">#{s.productId}</td>
                    <td className="td max-w-md truncate">{p?.title ?? '-'}</td>
                    <td className="td">{s.base}</td>
                    <td className="td">{s.performance}</td>
                    <td className="td">{s.feedback}</td>
                    <td className="td">{s.overall}</td>
                    <td className="td">
                      <span className="font-semibold text-brand">{s.total}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          !search.isLoading && <Empty text="后端未返回 scoreBreakdown（请在 /api/search 中补充）" />
        )}
      </div>

      <div className="card mt-4">
        <div className="card-title">排序权重自检</div>
        <p className="text-xs text-slate-500 leading-relaxed">
          前端用 <code className="rounded bg-slate-100 px-1">searchScore()</code> 对同一份输入复算：
          基础信息完整度得分 {searchScore({ hasImages: true, hasPrice: true, hasMoq: true, hasShipFrom: true, viewCount: 1000, contactRate: 0.08, collectCount: 60, validContacts: 5, totalContacts: 10, certified: true, paidLevel: true, violationCount: 0 }).total}
          （示例输入：信息齐全 + 1000 浏览 + 8% 加微率 + 50% 有效反馈 + 认证付费 + 无违规）。
          与后端 scoreBreakdown 的算法口径一致，可用于交叉验证。
        </p>
      </div>
    </>
  );
}
