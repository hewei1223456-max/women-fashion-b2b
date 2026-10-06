import { useMemo, useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useReachBottom } from '@tarojs/taro';
import { useInfiniteQuery } from '@tanstack/react-query';
import { MARKETS, PRICE_BANDS, STALL_TYPES, STALL_TYPE_LABELS, STYLE_TAGS } from '@wfb/shared-types';
import type { Product, SourceFeedQuery } from '@wfb/shared-types';
import { api } from '@/services/request';
import TabBar from '@/components/TabBar';
import Tabs from '@/components/Tabs';
import SearchBar from '@/components/SearchBar';
import FilterBar from '@/components/FilterBar';
import type { FilterGroup } from '@/components/FilterBar';
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

/** 价格带 → 拿货价区间（新契约的 wholesalePriceMin/Max 口径） */
function priceBandRange(band: string): { min?: number; max?: number } {
  if (!band) return {};
  const [lo, hi] = band.split('-');
  const min = Number(String(lo).replace('+', ''));
  const max = hi === undefined || hi === '' ? undefined : Number(String(hi).replace('+', ''));
  return {
    min: Number.isFinite(min) ? min : undefined,
    max: max !== undefined && Number.isFinite(max) ? max : undefined,
  };
}

export default function Source() {
  const [tab, setTab] = useState('recommend');
  const [styles, setStyles] = useState<string[]>([]);
  const [filters, setFilters] = useState<Record<string, string | string[] | undefined>>({});
  const priceBand = (filters.priceBand as string) || '';
  /* 「发货地」→「拿货地」：文案与语义都按产业带，如 十三行 / 南油 / 濮院 */
  const market = (filters.market as string) || (filters.shipFrom as string) || '';
  const stallType = (filters.stallType as string) || '';
  const groupBuy = (filters.groupBuy as string) === 'yes';
  const range = priceBandRange(priceBand);

  const feed = useInfiniteQuery({
    queryKey: ['source-feed', tab, styles.join(','), priceBand, market, stallType, groupBuy],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const params = {
        tab: tab as 'recommend' | 'follow' | 'city' | 'style' | 'new',
        styleTags: styles.join(',') || undefined,
        /* 老参数（价格带 / 发货地）继续下发，保证后端灰度期间兼容 */
        priceBand: priceBand || undefined,
        shipFrom: market || undefined,
        /* 新契约参数：拿货地 / 档口形态 / 是否支持拼单 / 拿货价区间 */
        market: market || undefined,
        stallType: stallType || undefined,
        supportsGroupBuy: groupBuy ? true : undefined,
        wholesalePriceMin: range.min,
        wholesalePriceMax: range.max,
        page: Number(pageParam),
        pageSize: 10,
      };
      return api.source.feed(params as SourceFeedQuery);
    },
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  const products: Product[] = useMemo(() => (feed.data?.pages ?? []).flatMap((p) => p.list ?? []), [feed.data]);
  const strategy = feed.data?.pages?.[0];
  const filterCount = [styles.length ? 1 : 0, priceBand ? 1 : 0, market ? 1 : 0, stallType ? 1 : 0, groupBuy ? 1 : 0].reduce((a, b) => a + b, 0);

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

  const groups: FilterGroup[] = [
    { key: 'styleTags', label: '风格', options: STYLE_TAGS.map((t) => ({ value: t, label: t })), multiple: true },
    { key: 'market', label: '拿货地', options: MARKETS.map((m) => ({ value: m, label: m })) },
    { key: 'priceBand', label: '拿货价', options: PRICE_BANDS.map((b) => ({ value: b, label: `¥${b}` })) },
    { key: 'stallType', label: '档口', options: STALL_TYPES.map((s) => ({ value: s, label: STALL_TYPE_LABELS[s] })) },
    { key: 'groupBuy', label: '拼单', options: [{ value: 'yes', label: '支持拼单' }] },
  ];

  return (
    <View className="page-safe source-home">
      <SearchBar readonly placeholder="搜款 / 搜厂家 / 拿货地（十三行、南油…）" onClick={() => Taro.navigateTo({ url: '/pages/source/search' })} />

      <Tabs items={FEED_TABS} current={tab} onChange={setTab} scroll />

      <FilterBar
        groups={groups}
        value={{ ...filters, styleTags: styles }}
        onChange={(key, next) => {
          if (key === 'styleTags') setStyles(Array.isArray(next) ? next : []);
          else setFilters((prev) => ({ ...prev, [key]: next }));
        }}
      />

      <View className="source-home__strategy row-between">
        <Text className="source-home__strategy-text f-xs t3 ellipsis">
          {strategy ? `推荐策略：${strategy.strategy}` : '价格口径：拿货价（单件起拿单价）'}
        </Text>
        {strategy?.coldStart ? (
          <View className="tag tag-accent">
            <Text>冷启动探索</Text>
          </View>
        ) : null}
      </View>
      <Text className="source-home__hint f-xs t3">
        拿货价 = 单件起拿价 · 起提量价 = 拿得多单价低
        {market ? ` · 拿货地：${market}` : ''}
        {stallType ? ` · 档口：${STALL_TYPE_LABELS[stallType as keyof typeof STALL_TYPE_LABELS] ?? stallType}` : ''}
        {groupBuy ? ' · 仅看可拼单' : ''}
        {filterCount ? '' : '（可在上方按拿货地 / 档口 / 拼单筛选）'}
      </Text>

      <ListEmpty
        loading={feed.isLoading}
        error={feed.isError ? errMsg(feed.error, '货源加载失败') : null}
        empty={!products.length}
        emptyText="暂无匹配的款"
        emptyDesc="换个风格或拿货价区间试试，也可以直接搜工厂款号"
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
