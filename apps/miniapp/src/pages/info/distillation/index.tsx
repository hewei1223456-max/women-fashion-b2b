import { useEffect, useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useQuery } from '@tanstack/react-query';
import type { ArticleSummary } from '@wfb/shared-types';
import { compactNumber, timeAgo } from '@wfb/shared-utils';
import { api } from '@/services/request';
import ListEmpty from '@/components/ListEmpty';
import LoadMore from '@/components/LoadMore';
import './index.scss';

const PERIODS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

export default function Distillation() {
  const [period, setPeriod] = useState(0);
  const [page, setPage] = useState(1);
  const [list, setList] = useState<ArticleSummary[]>([]);

  const query = useQuery({
    queryKey: ['distillation', period, page],
    queryFn: () => api.info.distillation(period > 0 ? { period, page, pageSize: 10 } : { page, pageSize: 10 }),
  });

  useEffect(() => {
    if (!query.data) return;
    const rows = query.data.list ?? [];
    setList((prev) => (page <= 1 ? rows : [...prev, ...rows]));
  }, [query.data, page]);

  const switchPeriod = (p: number) => {
    if (p === period) return;
    setPeriod(p);
    setPage(1);
    setList([]);
  };

  return (
    <View className="page">
      <View className="card">
        <Text className="f-lg bold">游学蒸馏资料库</Text>
        <Text className="f-sm t3">大店游学现场蒸馏出的可复用方法论，按期数归档</Text>
      </View>

      <View className="ds-chips">
        {PERIODS.map((p) => (
          <Text key={p} className={`ds-chip ${period === p ? 'is-active' : ''}`} onClick={() => switchPeriod(p)}>
            {p === 0 ? '全部期数' : `第${p}期`}
          </Text>
        ))}
      </View>

      <ListEmpty
        loading={query.isLoading && list.length === 0}
        error={query.isError && list.length === 0 ? `资料加载失败：${(query.error as Error)?.message ?? '网络异常'}` : null}
        empty={!query.isLoading && !query.isError && list.length === 0}
        emptyIcon="📚"
        emptyText={period === 0 ? '资料库暂无内容' : `第${period}期暂无蒸馏资料`}
        emptyDesc="游学蒸馏资料持续更新中"
        onRetry={() => query.refetch()}
      />

      {list.map((item) => (
        <View
          key={item.id}
          className="ds-item"
          onClick={() =>
            Promise.resolve(Taro.navigateTo({ url: `/pages/info/detail?id=${item.id}` })).catch(() =>
              Taro.showToast({ title: '页面开发中', icon: 'none' }),
            )
          }
        >
          <Image className="ds-item__cover" src={item.coverUrl} mode="aspectFill" />
          <View className="ds-item__body">
            <View>
              <Text className="ds-item__title ellipsis-2">{item.title}</Text>
              <Text className="ds-item__summary ellipsis-2">{item.summary}</Text>
            </View>
            <View>
              <View className="row wrap">
                {item.styleTags?.slice(0, 3).map((t) => (
                  <Text key={t} className="tag">
                    {t}
                  </Text>
                ))}
              </View>
              <Text className="ds-item__meta">
                {item.author?.nickname ?? '讲师'} · {compactNumber(item.viewCount)}阅读 · {timeAgo(item.createdAt)}
              </Text>
            </View>
          </View>
        </View>
      ))}

      <LoadMore
        loading={query.isFetching && list.length > 0}
        hasMore={query.data?.hasMore}
        count={list.length}
        onLoadMore={() => {
          if (query.isFetching || !query.data?.hasMore) return;
          setPage((p) => p + 1);
        }}
      />
    </View>
  );
}
