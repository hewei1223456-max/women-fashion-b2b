import { View, Text } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useQuery } from '@tanstack/react-query';
import { compactNumber } from '@wfb/shared-utils';
import { api } from '@/services/request';
import './index.scss';

export default function ContentAnalytics() {
  const router = useRouter();
  const id = Number(router.params.id ?? 0);

  const analytics = useQuery({
    queryKey: ['content-analytics', id],
    queryFn: () => api.content.analytics(id),
    enabled: id > 0,
  });
  const mine = useQuery({
    queryKey: ['content-manage', 1],
    queryFn: () => api.content.my({ sort: 'time', page: 1, pageSize: 20 }),
    enabled: id <= 0,
  });

  /* 未带 id：先选一篇自己的内容 */
  if (!id) {
    const rows = mine.data?.list ?? [];
    return (
      <View className="page">
        <View className="card">
          <Text className="f-lg bold">内容数据看板</Text>
          <Text className="f-sm t3">选择一篇内容，查看浏览 / 互动 / 加微 / 粉丝增长与流量来源</Text>
        </View>

        {mine.isLoading ? <View className="loading">内容加载中…</View> : null}
        {mine.isError ? (
          <View className="card" onClick={() => mine.refetch()}>
            <Text className="f-md t2">内容加载失败（{(mine.error as Error)?.message ?? '网络异常'}）</Text>
            <Text className="f-sm brand mt-xs">点击重试</Text>
          </View>
        ) : null}
        {!mine.isLoading && !mine.isError && rows.length === 0 ? <View className="empty">还没有内容，先去发布吧</View> : null}

        {rows.length > 0 ? (
          <View className="card">
            {rows.map((r) => (
              <View
                key={r.id}
                className="ca-pick"
                onClick={() => Taro.redirectTo({ url: `/pages/content/content-analytics?id=${r.id}` }).catch(() => undefined)}
              >
                <Text className="ca-pick__title">{r.title}</Text>
                <Text className="ca-pick__go">
                  {compactNumber(r.viewCount)} 浏览 · 看数据 ›
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  const d = analytics.data;
  const trend = d?.trend ?? [];
  const maxViews = Math.max(1, ...trend.map((t) => t.views));
  const sources = d?.trafficSource ?? [];

  const metrics = d
    ? [
        { label: '浏览', value: d.viewCount },
        { label: '点赞', value: d.likeCount },
        { label: '收藏', value: d.collectCount },
        { label: '评论', value: d.commentCount },
        { label: '转发', value: d.shareCount },
        { label: '加微', value: d.contactCount, hi: true },
        { label: '粉丝增长', value: d.followerGain, hi: true },
      ]
    : [];

  return (
    <View className="page">
      {analytics.isLoading ? <View className="loading">数据加载中…</View> : null}

      {analytics.isError ? (
        <View className="card" onClick={() => analytics.refetch()}>
          <Text className="f-md t2">数据加载失败（{(analytics.error as Error)?.message ?? '网络异常'}）</Text>
          <Text className="f-sm brand mt-xs">点击重试</Text>
        </View>
      ) : null}

      {d ? (
        <View>
          <View className="card">
            <View className="row-between">
              <Text className="f-md bold">核心指标（内容 ID {d.contentId}）</Text>
              <Text className="f-xs t3" onClick={() => analytics.refetch()}>
                ↻ 刷新
              </Text>
            </View>
            <View className="ca-metrics">
              {metrics.map((m) => (
                <View key={m.label} className={`ca-metric ${m.hi ? 'ca-metric--hi' : ''}`}>
                  <Text className="ca-metric__num">{compactNumber(m.value)}</Text>
                  <Text className="ca-metric__label">{m.label}</Text>
                </View>
              ))}
            </View>
            <Text className="f-xs t3">
              加微转化率：{d.viewCount > 0 ? ((d.contactCount / d.viewCount) * 100).toFixed(2) : '0.00'}%（加微数 / 浏览数）
            </Text>
          </View>

          <View className="card">
            <Text className="f-md bold">近 7 日浏览趋势</Text>
            {trend.length === 0 ? (
              <View className="empty">暂无趋势数据</View>
            ) : (
              <View className="ca-bars">
                {trend.map((t, idx) => (
                  <View key={t.date} className="ca-bar">
                    <Text className="ca-bar__value">{t.views}</Text>
                    <View
                      className={`ca-bar__fill ${idx === trend.length - 1 ? 'ca-bar__fill--today' : ''}`}
                      style={{ height: `${Math.max(4, Math.round((t.views / maxViews) * 200))}px` }}
                    />
                    <Text className="ca-bar__label">{t.date.slice(5)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View className="card">
            <Text className="f-md bold">流量来源占比</Text>
            {sources.length === 0 ? (
              <View className="empty">暂无来源数据</View>
            ) : (
              <View className="ca-src">
                {sources.map((s) => {
                  const pct = s.percent > 1 ? s.percent : s.percent * 100;
                  return (
                    <View key={s.source} className="ca-src__row">
                      <Text className="ca-src__name">{s.source}</Text>
                      <View className="ca-src__track">
                        <View className="ca-src__fill" style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
                      </View>
                      <Text className="ca-src__pct">{pct.toFixed(1)}%</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <View className="card">
            <Text className="f-md bold">看板口径说明</Text>
            <Text className="f-sm t3">· 浏览 / 互动为实时统计；加微数来自厂家客服回访确认的有效加微</Text>
            <Text className="f-sm t3">· 粉丝增长 = 该内容带来的新增关注数</Text>
            <Text className="f-sm t3">· 流量来源：推荐 / 搜索 / 关注 / 话题 / 分享 / 附近</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
