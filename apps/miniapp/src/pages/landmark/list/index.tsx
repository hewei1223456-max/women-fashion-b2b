import { useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro, { useReachBottom } from '@tarojs/taro';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { LandmarkShop, UserBrief } from '@wfb/shared-types';
import { api } from '@/services/request';
import FilterBar from '@/components/FilterBar';
import ListEmpty from '@/components/ListEmpty';
import LoadMore from '@/components/LoadMore';
import Card from '@/components/Card';
import { count, errMsg } from '@/components/utils';
import './index.scss';

const CITIES = ['杭州', '广州', '深圳', '上海', '成都', '郑州', '武汉'];

type Row = LandmarkShop & { user: UserBrief };

export default function LandmarkList() {
  const [city, setCity] = useState('');

  const list = useInfiniteQuery({
    queryKey: ['landmark-list', city],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.landmark.list({ city: city || undefined, page: Number(pageParam), pageSize: 10 }),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  const shops: Row[] = (list.data?.pages ?? []).flatMap((p) => p.list);

  useReachBottom(() => {
    if (list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage();
  });

  return (
    <View className="page">
      <FilterBar
        groups={[{ key: 'city', label: '城市', options: CITIES.map((c) => ({ value: c, label: c })) }]}
        value={{ city }}
        onChange={(_, next) => setCity((next as string) || '')}
      />

      <Card title="地标大店" subtitle="年营收千万级标杆店铺的经营方法论">
        <Text className="f-xs t3">大店会分享组货、陈列、私域运营的实操经验，可关注后持续学习。</Text>
      </Card>

      <ListEmpty
        loading={list.isLoading}
        error={list.isError ? errMsg(list.error, '大店列表加载失败') : null}
        empty={!shops.length}
        emptyText={city ? `${city}暂无地标大店` : '暂无地标大店'}
        onRetry={() => list.refetch()}
      />

      {shops.map((shop) => (
        <View key={shop.id} className="lm-card" onClick={() => Taro.navigateTo({ url: `/pages/landmark/detail?id=${shop.id}` })}>
          <Image className="lm-card__cover" src={shop.coverUrl} mode="aspectFill" />
          <View className="lm-card__body">
            <View className="row-between">
              <Text className="lm-card__name bold t1 ellipsis">{shop.shopName}</Text>
              <Text className="lm-card__city f-xs t3">{shop.city}</Text>
            </View>
            <Text className="lm-card__desc f-xs t3 ellipsis-2">{shop.styleDescription}</Text>
            <View className="row lm-card__stats">
              <Text className="f-xs accent">年营收 {shop.annualRevenue}</Text>
              <Text className="f-xs t3 lm-card__dot">·</Text>
              <Text className="f-xs t3">{count(shop.articleCount)} 篇方法论</Text>
              <Text className="f-xs t3 lm-card__dot">·</Text>
              <Text className="f-xs t3">{count(shop.followerCount)} 粉丝</Text>
            </View>
            {shop.periods ? (
              <View className="tag tag-accent lm-card__tag">
                <Text>已办 {shop.periods} 期游学</Text>
              </View>
            ) : null}
          </View>
        </View>
      ))}

      {shops.length ? (
        <LoadMore loading={list.isFetchingNextPage} hasMore={!!list.hasNextPage} count={shops.length} onLoadMore={() => list.fetchNextPage()} />
      ) : null}
    </View>
  );
}
