import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useReachBottom, useRouter } from '@tarojs/taro';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { TargetType, UserBrief } from '@wfb/shared-types';
import { api } from '@/services/request';
import ListEmpty from '@/components/ListEmpty';
import LoadMore from '@/components/LoadMore';
import UserRow from '@/components/UserRow';
import Card from '@/components/Card';
import { toastError } from '@/components/Toast';
import { errMsg } from '@/components/utils';
import './index.scss';

export default function LikeList() {
  const router = useRouter();
  const targetType = (router.params?.targetType ?? 'article') as TargetType;
  const targetId = Number(router.params?.targetId ?? 0);
  const [followed, setFollowed] = useState<Record<number, boolean>>({});

  const list = useInfiniteQuery({
    queryKey: ['likes', targetType, targetId],
    initialPageParam: 1,
    enabled: !!targetId,
    queryFn: ({ pageParam }) => api.interaction.likes(targetType, targetId, { page: Number(pageParam), pageSize: 20 }),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  const users: UserBrief[] = (list.data?.pages ?? []).flatMap((p) => p.list);

  useReachBottom(() => {
    if (list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage();
  });

  const toggleFollow = async (user: UserBrief, next: boolean) => {
    setFollowed((prev) => ({ ...prev, [user.id]: next }));
    try {
      if (next) await api.interaction.follow({ userId: user.id });
      else await api.interaction.unfollow({ userId: user.id });
    } catch (e) {
      setFollowed((prev) => ({ ...prev, [user.id]: !next }));
      toastError(errMsg(e, '操作失败'));
    }
  };

  if (!targetId) {
    return (
      <View className="page">
        <ListEmpty error="缺少目标 ID，请从内容详情进入" />
      </View>
    );
  }

  return (
    <View className="page">
      <Card title="点赞的人" subtitle={list.data?.pages?.[0] ? `共 ${list.data.pages[0].total} 人` : undefined} noPadding>
        <View className="like-list__body">
          <ListEmpty
            loading={list.isLoading}
            error={list.isError ? errMsg(list.error, '点赞列表加载失败') : null}
            empty={!users.length}
            emptyText="还没有人点赞"
            onRetry={() => list.refetch()}
          />

          {users.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              followed={followed[u.id] ?? false}
              onFollow={(next) => toggleFollow(u, next)}
              onClick={() => Taro.navigateTo({ url: `/pages/profile/index?userId=${u.id}` })}
            />
          ))}

          {users.length ? (
            <LoadMore loading={list.isFetchingNextPage} hasMore={!!list.hasNextPage} count={users.length} onLoadMore={() => list.fetchNextPage()} />
          ) : null}
        </View>
      </Card>

      <Text className="f-xs t3 like-list__tip">{targetType === 'product' ? '这些店主点赞了该款' : '这些用户点赞了该内容'}</Text>
    </View>
  );
}
