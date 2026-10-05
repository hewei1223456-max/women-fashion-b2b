import { useEffect, useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useQuery } from '@tanstack/react-query';
import type { ArticleSummary } from '@wfb/shared-types';
import { compactNumber, timeAgo } from '@wfb/shared-utils';
import { api } from '@/services/request';
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

      {query.isLoading && list.length === 0 ? <View className="loading">加载中…</View> : null}

      {query.isError && list.length === 0 ? (
        <View className="card" onClick={() => query.refetch()}>
          <Text className="f-md t2">资料加载失败（{(query.error as Error)?.message ?? '网络异常'}）</Text>
          <Text className="f-sm brand mt-xs">点击重试</Text>
        </View>
      ) : null}

      {!query.isLoading && !query.isError && list.length === 0 ? <View className="empty">该期数暂无蒸馏资料</View> : null}

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

      {list.length > 0 ? (
        <View className="loading" onClick={() => (query.data?.hasMore && !query.isFetching ? setPage((p) => p + 1) : undefined)}>
          {query.isFetching ? '加载中…' : query.data?.hasMore ? '点击加载更多' : '没有更多了'}
        </View>
      ) : null}
    </View>
  );
}
