import { useMemo, useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useReachBottom } from '@tarojs/taro';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Meetup } from '@wfb/shared-types';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import ListEmpty from '@/components/ListEmpty';
import LoadMore from '@/components/LoadMore';
import { errMsg } from '@/components/utils';
import MeetupCard from '../MeetupCard';
import { KIND_FILTERS, MEETUP_CITIES } from '../meetup-utils';
import './index.scss';

/* =========================================================================
 * 组局广场：按活动形态 / 城市筛选，卡片展示全部线下要素
 * （活动形态、时间、地点、集合点、已报名/上限、报名方式、报名条件）
 * ========================================================================= */

const ALL = 'all';

export default function MeetupList() {
  const user = useAppStore((s) => s.user);
  const [kind, setKind] = useState<string>(ALL);
  const [city, setCity] = useState<string>(ALL);

  const myCity = user?.sourcingCities?.[0];

  const query = useInfiniteQuery({
    queryKey: ['meetup-list', kind, city],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.meetup.list({
        page: Number(pageParam),
        pageSize: 10,
        kind: kind === ALL ? undefined : kind,
        city: city === ALL ? undefined : city,
      }),
    getNextPageParam: (last) => (last?.hasMore ? last.page + 1 : undefined),
  });

  const list = useMemo<Meetup[]>(() => (query.data?.pages ?? []).flatMap((p) => p?.list ?? []), [query.data]);

  useReachBottom(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
  });

  const cityOptions = useMemo(() => {
    const base = ['全部', ...(myCity ? [`同城·${myCity}`] : []), ...MEETUP_CITIES.filter((c) => c !== myCity)];
    return base;
  }, [myCity]);

  const cityValue = city === ALL ? '全部' : city;
  const pickCity = (label: string) => {
    if (label === '全部') return setCity(ALL);
    setCity(label.startsWith('同城·') ? label.replace('同城·', '') : label);
  };

  return (
    <View className="page mt-page">
      <View className="mt-head row-between">
        <View className="col">
          <Text className="mt-head__title bold">组局广场</Text>
          <Text className="mt-head__sub f-xs t3">一起去拿货 / 一起做货 / 同业交流，都能在线上约起来</Text>
        </View>
        <View className="btn btn-primary btn-sm" onClick={() => Taro.navigateTo({ url: '/pages/meetup/create' })}>
          <Text>+ 发起组局</Text>
        </View>
      </View>

      {/* 活动形态筛选 */}
      <ScrollView scrollX className="mt-filters">
        <View className="mt-filters__inner row">
          {KIND_FILTERS.map((k) => (
            <View key={k.key} className={`mt-chip ${k.key === kind ? 'is-active' : ''}`} onClick={() => setKind(k.key)}>
              <Text className="mt-chip__text">{k.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* 城市筛选 */}
      <ScrollView scrollX className="mt-filters mt-filters--city">
        <View className="mt-filters__inner row">
          {cityOptions.map((c) => (
            <View key={c} className={`mt-chip mt-chip--city ${c === cityValue ? 'is-active' : ''}`} onClick={() => pickCity(c)}>
              <Text className="mt-chip__text">{c}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <ListEmpty
        loading={query.isLoading && list.length === 0}
        error={query.isError && list.length === 0 ? errMsg(query.error, '组局加载失败') : null}
        empty={!query.isLoading && !query.isError && list.length === 0}
        emptyIcon="🗓️"
        emptyText="当前筛选下还没有组局"
        emptyDesc="换个活动形态或城市看看，也可以自己发起一个"
        onRetry={() => query.refetch()}
      />

      {list.map((m) => (
        <MeetupCard key={m.id} meetup={m} onClick={() => Taro.navigateTo({ url: `/pages/meetup/detail?id=${m.id}` })} />
      ))}

      {list.length ? (
        <LoadMore
          loading={query.isFetchingNextPage}
          hasMore={!!query.hasNextPage}
          count={list.length}
          onLoadMore={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
          }}
        />
      ) : null}

      <View className="mt-fab" onClick={() => Taro.navigateTo({ url: '/pages/meetup/create' })}>
        <Text className="mt-fab__text">+ 发起组局</Text>
      </View>
    </View>
  );
}
