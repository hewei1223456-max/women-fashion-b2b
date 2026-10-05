import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useReachBottom, useRouter } from '@tarojs/taro';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { UserBrief } from '@wfb/shared-types';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import Tabs from '@/components/Tabs';
import ListEmpty from '@/components/ListEmpty';
import LoadMore from '@/components/LoadMore';
import UserRow from '@/components/UserRow';
import { toastError } from '@/components/Toast';
import { errMsg } from '@/components/utils';
import './index.scss';

const TABS = [
  { key: 'followers', label: '粉丝' },
  { key: 'following', label: '关注' },
];

export default function FollowerList() {
  const router = useRouter();
  const me = useAppStore((s) => s.user);
  const userId = Number(router.params?.userId ?? me?.id ?? 0);
  const [tab, setTab] = useState(String(router.params?.tab ?? 'followers'));
  const [followed, setFollowed] = useState<Record<number, boolean>>({});

  const list = useInfiniteQuery({
    queryKey: ['relation', userId, tab],
    initialPageParam: 1,
    enabled: !!userId,
    queryFn: ({ pageParam }) =>
      tab === 'followers' ? api.profile.followers(userId, { page: Number(pageParam), pageSize: 20 }) : api.profile.following(userId, { page: Number(pageParam), pageSize: 20 }),
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

  if (!userId) {
    return (
      <View className="page">
        <ListEmpty error="缺少用户 ID，请先登录" />
      </View>
    );
  }

  return (
    <View className="page">
      <Tabs items={TABS} current={tab} onChange={setTab} />

      <View className="fans__summary row-between">
        <Text className="f-xs t3">
          共 {list.data?.pages?.[0]?.total ?? 0} 人{tab === 'followers' ? '关注了你' : '被你关注'}
        </Text>
        <Text className="f-xs brand" onClick={() => Taro.navigateTo({ url: '/pages/interaction/message-center' })}>
          去消息中心 →
        </Text>
      </View>

      <View className="fans__list">
        <ListEmpty
          loading={list.isLoading}
          error={list.isError ? errMsg(list.error, '列表加载失败') : null}
          empty={!users.length}
          emptyText={tab === 'followers' ? '还没有粉丝' : '还没有关注任何人'}
          emptyDesc="多发布优质内容，粉丝会慢慢来"
          onRetry={() => list.refetch()}
        />

        {users.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            showFollow={u.id !== me?.id}
            followed={followed[u.id] ?? false}
            onFollow={(next) => toggleFollow(u, next)}
            onClick={() => Taro.navigateTo({ url: `/pages/source/manufacturer?id=${u.id}` })}
          />
        ))}
      </View>

      {users.length ? (
        <LoadMore loading={list.isFetchingNextPage} hasMore={!!list.hasNextPage} count={users.length} onLoadMore={() => list.fetchNextPage()} />
      ) : null}
    </View>
  );
}
