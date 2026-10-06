import { useMemo, useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useReachBottom } from '@tarojs/taro';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { MARKETS, PRICE_BANDS, STALL_TYPES, STALL_TYPE_LABELS, STYLE_TAGS } from '@wfb/shared-types';
import { api } from '@/services/request';
import type { Product, ArticleSummary, UserBrief, SearchQuery } from '@wfb/shared-types';
import SearchBar from '@/components/SearchBar';
import FilterBar from '@/components/FilterBar';
import type { FilterGroup } from '@/components/FilterBar';
import Tabs from '@/components/Tabs';
import ProductCard from '@/components/ProductCard';
import ArticleCard from '@/components/ArticleCard';
import UserRow from '@/components/UserRow';
import ListEmpty from '@/components/ListEmpty';
import LoadMore from '@/components/LoadMore';
import Card from '@/components/Card';
import { errMsg, asList } from '@/components/utils';
import './index.scss';

/** 单页结果条数（SearchResult 或 products-only 两种形态都兼容） */
function pageCount(p: { products?: Product[]; articles?: ArticleSummary[]; manufacturers?: UserBrief[] }): number {
  const products = p.products?.length ? p.products.length : asList<Product>(p).length;
  return products + (p.articles?.length ?? 0) + (p.manufacturers?.length ?? 0);
}

/** 价格带 → 拿货价区间（wholesalePriceMin / Max 口径） */
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

const RESULT_TABS = [
  { key: 'all', label: '全部' },
  { key: 'source', label: '货源' },
  { key: 'info', label: '资讯' },
  { key: 'manufacturer', label: '厂家' },
];

/** 筛选栏：拿货地按产业带口径，价格带按拿货价口径，另加档口形态与拼单 */
const FILTER_GROUPS: FilterGroup[] = [
  { key: 'style', label: '风格', options: STYLE_TAGS.map((t) => ({ value: t, label: t })) },
  { key: 'market', label: '拿货地', options: MARKETS.map((m) => ({ value: m, label: m })) },
  { key: 'priceBand', label: '拿货价', options: PRICE_BANDS.map((b) => ({ value: b, label: `¥${b}` })) },
  { key: 'stallType', label: '档口', options: STALL_TYPES.map((s) => ({ value: s, label: STALL_TYPE_LABELS[s] })) },
  { key: 'groupBuy', label: '拼单', options: [{ value: 'yes', label: '支持拼单' }] },
];

export default function SourceSearch() {
  const [keyword, setKeyword] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [board, setBoard] = useState('all');
  const [filters, setFilters] = useState<Record<string, string | string[] | undefined>>({});
  const style = (filters.style as string) || '';
  const priceBand = (filters.priceBand as string) || '';
  /* 「发货地」→「拿货地」（产业带） */
  const market = (filters.market as string) || (filters.shipFrom as string) || '';
  const stallType = (filters.stallType as string) || '';
  const groupBuy = (filters.groupBuy as string) === 'yes';
  const range = priceBandRange(priceBand);

  const hot = useQuery({ queryKey: ['hot-keywords'], queryFn: () => api.search.hotKeywords(), enabled: !submitted });

  const result = useInfiniteQuery({
    queryKey: ['source-search', submitted, style, priceBand, market, stallType, groupBuy],
    initialPageParam: 1,
    enabled: !!submitted,
    queryFn: ({ pageParam }) => {
      const params = {
        keyword: submitted,
        board: 'all',
        style: style || undefined,
        /* 老参数继续下发，新契约字段后端灰度期间可能还没实现 */
        priceBand: priceBand || undefined,
        shipFrom: market || undefined,
        market: market || undefined,
        stallType: stallType || undefined,
        supportsGroupBuy: groupBuy ? true : undefined,
        wholesalePriceMin: range.min,
        wholesalePriceMax: range.max,
        page: Number(pageParam),
        pageSize: 10,
      };
      return api.search.all(params as SearchQuery);
    },
    getNextPageParam: (last, allPages) => {
      // SearchResult 无分页字段：用 total 与已加载条数推导
      const loaded = allPages.reduce((n, p) => n + pageCount(p), 0);
      return last.total > 0 && loaded < last.total ? allPages.length + 1 : undefined;
    },
  });

  const pages = result.data?.pages ?? [];
  const products = useMemo(() => pages.flatMap((p) => (p.products?.length ? p.products : asList<Product>(p))), [pages]);
  const articles = useMemo(() => pages.flatMap((p) => p.articles ?? []), [pages]);
  const manufacturers = useMemo(() => pages.flatMap((p) => (p.manufacturers ?? []) as UserBrief[]), [pages]);
  const breakdown = pages[0]?.scoreBreakdown ?? [];
  const total = pages[0]?.total ?? 0;
  const hasMore = !!result.hasNextPage;

  useReachBottom(() => {
    if (result.hasNextPage && !result.isFetchingNextPage) result.fetchNextPage();
  });

  const showProducts = board === 'all' || board === 'source';
  const showArticles = board === 'all' || board === 'info';
  const showManufacturers = board === 'all' || board === 'manufacturer';
  const empty = !products.length && !articles.length && !manufacturers.length;

  return (
    <View className="page search">
      <SearchBar value={keyword} autoFocus placeholder="搜款名 / 风格 / 厂家 / 市场" onInput={setKeyword} onSearch={(v) => setSubmitted(v.trim())} />

      {!submitted ? (
        <Card title="热搜词" subtitle="来自近 7 日全站搜索行为">
          <View className="row wrap">
            {hot.isLoading ? <Text className="f-sm t3">加载中...</Text> : null}
            {hot.isError ? <Text className="f-sm t3">热搜词加载失败</Text> : null}
            {(hot.data ?? []).map((item) => (
              <View
                key={item.keyword}
                className="search__hot"
                onClick={() => {
                  setKeyword(item.keyword);
                  setSubmitted(item.keyword);
                }}
              >
                <Text className="search__hot-text f-sm">{item.keyword}</Text>
              </View>
            ))}
            {!hot.isLoading && !hot.data?.length ? <Text className="f-sm t3">暂无热搜数据</Text> : null}
          </View>
        </Card>
      ) : (
        <View>
          <FilterBar groups={FILTER_GROUPS} value={filters} onChange={(key, next) => setFilters((prev) => ({ ...prev, [key]: next }))} />

          <Tabs items={RESULT_TABS} current={board} onChange={setBoard} scroll />

          <View className="search__summary row-between">
            <Text className="f-xs t3">
              「{submitted}」共 {total} 条结果
            </Text>
            {style || priceBand || market || stallType || groupBuy ? (
              <Text
                className="f-xs brand"
                onClick={() => {
                  setFilters({});
                }}
              >
                清空筛选
              </Text>
            ) : null}
          </View>

          <ListEmpty
            loading={result.isLoading}
            error={result.isError ? errMsg(result.error, '搜索失败') : null}
            empty={empty}
            emptyText="没有找到相关结果"
            emptyDesc="试试更短的关键词，或按风格/价格带筛选"
            onRetry={() => result.refetch()}
          />

          {showProducts && products.length ? (
            <View>
              <View className="waterfall">
                <View className="waterfall-col">
                  {products.filter((_, i) => i % 2 === 0).map((p) => (
                    <ProductCard key={p.id} product={p} onClick={() => Taro.navigateTo({ url: `/pages/source/detail?id=${p.id}` })} />
                  ))}
                </View>
                <View className="waterfall-col">
                  {products.filter((_, i) => i % 2 === 1).map((p) => (
                    <ProductCard key={p.id} product={p} onClick={() => Taro.navigateTo({ url: `/pages/source/detail?id=${p.id}` })} />
                  ))}
                </View>
              </View>
              {breakdown.length ? (
                <Card title="排序权重拆解" subtitle="基础信息 25% + 历史表现 35% + 反馈 25% + 整体 15%">
                  {breakdown.slice(0, 3).map((b) => {
                    const p = products.find((item) => item.id === b.productId);
                    return (
                      <View key={b.productId} className="search__score">
                        <Text className="search__score-title f-xs t2 ellipsis">{p?.title ?? `款 #${b.productId}`}</Text>
                        <View className="search__score-bars">
                          {[
                            { key: 'base', label: '基础', value: b.base },
                            { key: 'performance', label: '表现', value: b.performance },
                            { key: 'feedback', label: '反馈', value: b.feedback },
                            { key: 'overall', label: '整体', value: b.overall },
                          ].map((item) => (
                            <View key={item.key} className="search__score-row row">
                              <Text className="search__score-label f-xs t3">{item.label}</Text>
                              <View className="search__score-track flex-1">
                                <View className="search__score-bar" style={{ width: `${Math.min(100, item.value)}%` }} />
                              </View>
                              <Text className="search__score-value f-xs t3">{item.value.toFixed(0)}</Text>
                            </View>
                          ))}
                        </View>
                        <Text className="f-xs brand">综合 {b.total.toFixed(1)} 分</Text>
                      </View>
                    );
                  })}
                </Card>
              ) : null}
            </View>
          ) : null}

          {showManufacturers && manufacturers.length ? (
            <Card title={`厂家 ${manufacturers.length}`}>
              {manufacturers.map((m) => (
                <UserRow key={m.id} user={m} showFollow={false} onClick={() => Taro.navigateTo({ url: `/pages/source/manufacturer?id=${m.id}` })} />
              ))}
            </Card>
          ) : null}

          {showArticles && articles.length ? (
            <View>
              <Text className="search__section bold t1">相关资讯</Text>
              {articles.map((a) => (
                <ArticleCard key={a.id} article={a} onClick={() => Taro.navigateTo({ url: `/pages/info/detail?id=${a.id}` })} />
              ))}
            </View>
          ) : null}

          {!empty && submitted ? (
            <LoadMore loading={result.isFetchingNextPage} hasMore={hasMore} count={products.length + articles.length + manufacturers.length} onLoadMore={() => result.fetchNextPage()} />
          ) : null}
        </View>
      )}
    </View>
  );
}
