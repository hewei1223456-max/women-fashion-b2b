import { useMemo, useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useReachBottom } from '@tarojs/taro';
import { useInfiniteQuery } from '@tanstack/react-query';
import { MARKETS, PRICE_BANDS, STYLE_TAGS } from '@wfb/shared-types';
import type { Product } from '@wfb/shared-types';
import { api } from '@/services/request';
import TabBar from '@/components/TabBar';
import Tabs from '@/components/Tabs';
import SearchBar from '@/components/SearchBar';
import FilterBar from '@/components/FilterBar';
import ProductCard from '@/components/ProductCard';
import ListEmpty from '@/components/ListEmpty';
import LoadMore from '@/components/LoadMore';
import { errMsg } from '@/components/utils';
import './index.scss';

const FEED_TABS = [
  { key: 'recommend', label: '推荐' },
  { key: 'follow', label: '关注' },
  { key: 'city', label: '同城' },
  { key: 'style', label: '风格' },
  { key: 'new', label: '最新' },
];

export default function Source() {
  const [tab, setTab] = useState('recommend');
  const [styles, setStyles] = useState<string[]>([]);
  const [filters, setFilters] = useState<Record<string, string | string[] | undefined>>({});
  const priceBand = (filters.priceBand as string) || '';
  const shipFrom = (filters.shipFrom as string) || '';

  const feed = useInfiniteQuery({
    queryKey: ['source-feed', tab, styles.join(','), priceBand, shipFrom],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.source.feed({
        tab: tab as 'recommend' | 'follow' | 'city' | 'style' | 'new',
        styleTags: styles.join(',') || undefined,
        priceBand: priceBand || undefined,
        shipFrom: shipFrom || undefined,
        page: Number(pageParam),
        pageSize: 10,
      }),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  const products: Product[] = useMemo(() => (feed.data?.pages ?? []).flatMap((p) => p.list), [feed.data]);
  const strategy = feed.data?.pages?.[0];

  useReachBottom(() => {
    if (feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage();
  });

  const columns = useMemo(() => {
    const left: Product[] = [];
    const right: Product[] = [];
    products.forEach((p, i) => (i % 2 === 0 ? left : right).push(p));
    return [left, right];
  }, [products]);

  const openDetail = (id: number) => Taro.navigateTo({ url: `/pages/source/detail?id=${id}` });

  return (
    <View className="page-safe source-home">
      <SearchBar readonly placeholder="搜款 / 搜厂家 / 搜市场（十三行、南油…）" onClick={() => Taro.navigateTo({ url: '/pages/source/search' })} />

      <Tabs items={FEED_TABS} current={tab} onChange={setTab} scroll />

      <FilterBar
        groups={[
          { key: 'styleTags', label: '风格', options: STYLE_TAGS.map((t) => ({ value: t, label: t })), multiple: true },
          { key: 'priceBand', label: '价格带', options: PRICE_BANDS.map((b) => ({ value: b, label: `¥${b}` })) },
          { key: 'shipFrom', label: '发货地', options: MARKETS.map((m) => ({ value: m, label: m })) },
        ]}
        value={{ ...filters, styleTags: styles }}
        onChange={(key, next) => {
          if (key === 'styleTags') setStyles(Array.isArray(next) ? next : []);
          else setFilters((prev) => ({ ...prev, [key]: next }));
        }}
      />

      {strategy ? (
        <View className="source-home__strategy row-between">
          <Text className="source-home__strategy-text f-xs t3 ellipsis">推荐策略：{strategy.strategy}</Text>
          {strategy.coldStart ? (
            <View className="tag tag-accent">
              <Text>冷启动探索</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <ListEmpty
        loading={feed.isLoading}
        error={feed.isError ? errMsg(feed.error, '货源加载失败') : null}
        empty={!products.length}
        emptyText="暂无匹配的款"
        emptyDesc="换个风格或价格带试试，也可以直接搜工厂款号"
        onRetry={() => feed.refetch()}
      />

      {products.length ? (
        <View className="waterfall">
          {columns.map((col, colIndex) => (
            <View key={colIndex} className="waterfall-col">
              {col.map((p) => (
                <ProductCard key={p.id} product={p} onClick={() => openDetail(p.id)} onContacted={() => feed.refetch()} />
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {products.length ? (
        <LoadMore loading={feed.isFetchingNextPage} hasMore={!!feed.hasNextPage} count={products.length} onLoadMore={() => feed.fetchNextPage()} />
      ) : null}

      <TabBar current="source" />
    </View>
  );
}
