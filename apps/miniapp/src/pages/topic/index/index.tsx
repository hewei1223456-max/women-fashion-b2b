import { View, Text, Image } from '@tarojs/components';
import Taro, { useReachBottom } from '@tarojs/taro';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Topic } from '@wfb/shared-types';
import { api } from '@/services/request';
import ListEmpty from '@/components/ListEmpty';
import LoadMore from '@/components/LoadMore';
import Card from '@/components/Card';
import { count, errMsg } from '@/components/utils';
import './index.scss';

export default function TopicList() {
  const list = useInfiniteQuery({
    queryKey: ['topic-list'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.topic.list({ page: Number(pageParam), pageSize: 20 }),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  const topics: Topic[] = (list.data?.pages ?? []).flatMap((p) => p.list);
  const maxHeat = topics.reduce((m, t) => Math.max(m, t.heat || 0), 1);

  useReachBottom(() => {
    if (list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage();
  });

  return (
    <View className="page">
      <Card title="话题榜" subtitle="按内容热度（CES）实时排序，点击进入话题聚合">
        <Text className="f-xs t3">热度 = 浏览量 + 互动加权，每日更新</Text>
      </Card>

      <ListEmpty
        loading={list.isLoading}
        error={list.isError ? errMsg(list.error, '话题加载失败') : null}
        empty={!topics.length}
        emptyText="暂无话题"
        emptyDesc="发布内容时带上 #话题，就会出现在这里"
        onRetry={() => list.refetch()}
      />

      {topics.map((topic, index) => (
        <View
          key={topic.tag}
          className="topic-row"
          onClick={() => Taro.navigateTo({ url: `/pages/topic/detail?tag=${encodeURIComponent(topic.tag)}` })}
        >
          <View className={`topic-row__rank col-center ${index < 3 ? 'is-top' : ''}`}>
            <Text className="topic-row__rank-text">{index + 1}</Text>
          </View>
          {topic.coverUrl ? <Image className="topic-row__cover" src={topic.coverUrl} mode="aspectFill" /> : null}
          <View className="col flex-1">
            <Text className="topic-row__name bold t1 ellipsis">#{topic.name}</Text>
            <View className="row topic-row__meta">
              <Text className="f-xs t3">{count(topic.contentCount)} 条内容</Text>
              <Text className="f-xs t3 topic-row__dot">·</Text>
              <Text className="f-xs t3">{count(topic.viewCount)} 浏览</Text>
            </View>
            <View className="topic-row__track">
              <View className="topic-row__bar" style={{ width: `${Math.max(6, Math.round(((topic.heat || 0) / maxHeat) * 100))}%` }} />
            </View>
          </View>
          <Text className="topic-row__heat f-xs accent">🔥 {count(topic.heat)}</Text>
        </View>
      ))}

      {topics.length ? (
        <LoadMore loading={list.isFetchingNextPage} hasMore={!!list.hasNextPage} count={topics.length} onLoadMore={() => list.fetchNextPage()} />
      ) : null}
    </View>
  );
}
