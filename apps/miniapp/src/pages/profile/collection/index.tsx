import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useReachBottom } from '@tarojs/taro';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { ArticleSummary } from '@wfb/shared-types';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import Tabs from '@/components/Tabs';
import ListEmpty from '@/components/ListEmpty';
import LoadMore from '@/components/LoadMore';
import ArticleCard from '@/components/ArticleCard';
import { toastError, toastSuccess } from '@/components/Toast';
import { errMsg } from '@/components/utils';
import './index.scss';

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'image_text', label: '图文' },
  { key: 'video', label: '视频' },
];

export default function MyCollection() {
  const user = useAppStore((s) => s.user);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('all');

  const list = useInfiniteQuery({
    queryKey: ['my-collection', user?.id],
    initialPageParam: 1,
    enabled: !!user?.id,
    queryFn: ({ pageParam }) => api.profile.collect(user?.id ?? 0, { page: Number(pageParam), pageSize: 10 }),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  const all: ArticleSummary[] = (list.data?.pages ?? []).flatMap((p) => p.list);
  const items = tab === 'all' ? all : all.filter((a) => a.contentType === tab);

  useReachBottom(() => {
    if (list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage();
  });

  const uncollect = (article: ArticleSummary) => {
    Taro.showModal({
      title: '取消收藏',
      content: `确定取消收藏「${article.title}」吗？`,
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.interaction.uncollect({ targetType: 'article', targetId: article.id });
          toastSuccess('已取消收藏');
          queryClient.invalidateQueries({ queryKey: ['my-collection', user?.id] });
        } catch (e) {
          toastError(errMsg(e, '操作失败'));
        }
      },
    });
  };

  if (!user?.id) {
    return (
      <View className="page">
        <ListEmpty error="未登录，请先登录后查看收藏" />
      </View>
    );
  }

  return (
    <View className="page-safe">
      <Tabs items={TABS} current={tab} onChange={setTab} />

      <View className="collection__summary row-between">
        <Text className="f-xs t3">共收藏 {list.data?.pages?.[0]?.total ?? 0} 条内容</Text>
        <Text className="f-xs brand" onClick={() => Taro.navigateTo({ url: '/pages/source/index' })}>
          去货源逛款 →
        </Text>
      </View>

      <ListEmpty
        loading={list.isLoading}
        error={list.isError ? errMsg(list.error, '收藏加载失败') : null}
        empty={!items.length}
        emptyText="还没有收藏内容"
        emptyDesc="在资讯或货源内容里点击☆即可收藏"
        onRetry={() => list.refetch()}
      />

      {items.map((a) => (
        <View key={a.id} className="collection__item">
          <ArticleCard article={a} showReason onClick={() => Taro.navigateTo({ url: `/pages/info/detail?id=${a.id}` })} />
          <View className="collection__actions row">
            <View className="btn btn-plain btn-sm" onClick={() => uncollect(a)}>
              <Text>取消收藏</Text>
            </View>
            <View
              className="btn btn-ghost btn-sm collection__source-btn"
              onClick={() => (a.type === 'ugc' ? Taro.navigateTo({ url: '/pages/source/index' }) : Taro.navigateTo({ url: '/pages/info/distillation' }))}
            >
              <Text>{a.type === 'ugc' ? '看同款货源' : '看游学资料'}</Text>
            </View>
          </View>
        </View>
      ))}

      {items.length ? (
        <LoadMore loading={list.isFetchingNextPage} hasMore={!!list.hasNextPage} count={items.length} onLoadMore={() => list.fetchNextPage()} />
      ) : null}
    </View>
  );
}
