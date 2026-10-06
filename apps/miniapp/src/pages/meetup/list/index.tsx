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
import { FEE_FILTERS, KIND_FILTERS, MEETUP_CITIES, TIME_FILTERS, inFeeRange, inTimeRange } from '../meetup-utils';
import './index.scss';

/* =========================================================================
 * 组局广场：按活动形态 / 时间范围 / 费用 / 城市筛选，卡片展示全部线下要素
 * （活动形态、时间、地点、集合点、已报名进度、报名方式、报名条件、费用）
 * ========================================================================= */

const ALL = 'all';

export default function MeetupList() {
  const user = useAppStore((s) => s.user);
  const [kind, setKind] = useState<string>(ALL);
  const [city, setCity] = useState<string>(ALL);
  const [timeRange, setTimeRange] = useState<string>(ALL);
  const [feeType, setFeeType] = useState<string>(ALL);

  const myCity = user?.sourcingCities?.[0];
  const filtered = timeRange !== ALL || feeType !== ALL;

  const query = useInfiniteQuery({
    queryKey: ['meetup-list', kind, city, timeRange, feeType],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.meetup.list({
        page: Number(pageParam),
        pageSize: 10,
        kind: kind === ALL ? undefined : kind,
        city: city === ALL ? undefined : city,
        /* 时间与费用筛选后端暂未支持：这里先带参（后端支持后自动生效），
           同时前端对已加载数据做本地过滤，保证现在就能用 */
        timeRange: timeRange === ALL ? undefined : timeRange,
        feeType: feeType === ALL ? undefined : feeType,
      }),
    getNextPageParam: (last) => (last?.hasMore ? last.page + 1 : undefined),
  });

  const rawList = useMemo<Meetup[]>(() => (query.data?.pages ?? []).flatMap((p) => p?.list ?? []), [query.data]);
  const list = useMemo(
    () => rawList.filter((m) => inTimeRange(m, timeRange) && inFeeRange(m, feeType)),
    [rawList, timeRange, feeType],
  );

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

  const clearFilters = () => {
    setKind(ALL);
    setCity(ALL);
    setTimeRange(ALL);
    setFeeType(ALL);
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

      {/* 时间范围筛选 */}
      <ScrollView scrollX className="mt-filters">
        <View className="mt-filters__inner row">
          {TIME_FILTERS.map((t) => (
            <View
              key={t.key}
              className={`mt-chip mt-chip--sub ${t.key === timeRange ? 'is-active' : ''}`}
              onClick={() => setTimeRange(t.key)}
            >
              <Text className="mt-chip__text">{t.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* 费用筛选 */}
      <ScrollView scrollX className="mt-filters">
        <View className="mt-filters__inner row">
          {FEE_FILTERS.map((f) => (
            <View
              key={f.key}
              className={`mt-chip mt-chip--sub ${f.key === feeType ? 'is-active' : ''}`}
              onClick={() => setFeeType(f.key)}
            >
              <Text className="mt-chip__text">{f.label}</Text>
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

      <View className="mt-summary row-between">
        <Text className="f-xs t3">
          共 {list.length} 场{filtered ? '（已按时间/费用筛选）' : ''}
          {query.hasNextPage ? ' · 继续下滑加载更多' : ''}
        </Text>
        {filtered || kind !== ALL || city !== ALL ? (
          <Text className="f-xs brand" onClick={clearFilters}>
            清空筛选
          </Text>
        ) : null}
      </View>

      <ListEmpty
        loading={query.isLoading && list.length === 0}
        error={query.isError && list.length === 0 ? errMsg(query.error, '组局加载失败') : null}
        empty={!query.isLoading && !query.isError && list.length === 0}
        emptyIcon="🗓️"
        emptyText={filtered ? '当前时间/费用筛选下还没有组局' : '当前筛选下还没有组局'}
        emptyDesc={filtered ? '试试「时间不限 + 费用不限」，或自己发起一个' : '换个活动形态或城市看看，也可以自己发起一个'}
        onRetry={() => query.refetch()}
      />

      {!query.isLoading && !query.isError && list.length === 0 && (filtered || kind !== ALL || city !== ALL) ? (
        <View className="btn btn-plain btn-block mt-clear" onClick={clearFilters}>
          <Text>清空筛选</Text>
        </View>
      ) : null}

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
