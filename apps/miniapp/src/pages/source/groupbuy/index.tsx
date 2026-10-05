import { useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro, { useReachBottom } from '@tarojs/taro';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GroupBuy } from '@wfb/shared-types';
import { STYLE_TAGS } from '@wfb/shared-types';
import { api } from '@/services/request';
import Tabs from '@/components/Tabs';
import FilterBar from '@/components/FilterBar';
import ListEmpty from '@/components/ListEmpty';
import LoadMore from '@/components/LoadMore';
import Tag from '@/components/Tag';
import { toastError, toastSuccess } from '@/components/Toast';
import { errMsg, deadlineText, asList } from '@/components/utils';
import './index.scss';

const TABS = [
  { key: 'square', label: '拼单广场' },
  { key: 'mine', label: '我的拼单' },
];

const STATUS_LABELS: Record<string, string> = {
  recruiting: '招募中',
  formed: '已成团',
  completed: '已完成',
  cancelled: '已取消',
};

export default function GroupBuySquare() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('square');
  const [styleTag, setStyleTag] = useState('');
  const [busyId, setBusyId] = useState(0);

  const list = useInfiniteQuery({
    queryKey: ['groupbuy-list', styleTag],
    initialPageParam: 1,
    enabled: tab === 'square',
    queryFn: ({ pageParam }) => api.groupbuy.list({ styleTag: styleTag || undefined, page: Number(pageParam), pageSize: 10 }),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  const mine = useQuery({ queryKey: ['groupbuy-mine'], queryFn: () => api.groupbuy.mine(), enabled: tab === 'mine' });

  const items: GroupBuy[] = tab === 'square' ? (list.data?.pages ?? []).flatMap((p) => p.list) : asList<GroupBuy>(mine.data);
  const loading = tab === 'square' ? list.isLoading : mine.isLoading;
  const error = tab === 'square' ? list.error : mine.error;
  const refetch = tab === 'square' ? () => list.refetch() : () => mine.refetch();

  useReachBottom(() => {
    if (tab === 'square' && list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage();
  });

  const join = async (item: GroupBuy) => {
    setBusyId(item.id);
    try {
      if (item.joined) {
        await api.groupbuy.quit(item.id);
        toastSuccess('已退出拼单');
      } else {
        await api.groupbuy.join(item.id);
        toastSuccess('参团成功');
      }
      queryClient.invalidateQueries({ queryKey: ['groupbuy-list'] });
      queryClient.invalidateQueries({ queryKey: ['groupbuy-mine'] });
      queryClient.invalidateQueries({ queryKey: ['groupbuy-detail', item.id] });
    } catch (e) {
      toastError(errMsg(e, '操作失败'));
    } finally {
      setBusyId(0);
    }
  };

  const renderCard = (item: GroupBuy) => {
    const percent = item.targetCount > 0 ? Math.min(100, Math.round((item.currentCount / item.targetCount) * 100)) : 0;
    return (
      <View key={item.id} className="groupbuy-card" onClick={() => Taro.navigateTo({ url: `/pages/source/groupbuy-detail?id=${item.id}` })}>
        <View className="row">
          {item.product?.images?.[0] ? (
            <Image className="groupbuy-card__cover" src={item.product.images[0]} mode="aspectFill" />
          ) : (
            <View className="groupbuy-card__cover groupbuy-card__cover--empty col-center">
              <Text className="f-xs t3">拼单</Text>
            </View>
          )}
          <View className="col flex-1 groupbuy-card__main">
            <View className="row-between">
              <Text className="groupbuy-card__title bold t1 ellipsis">{item.title}</Text>
              <Text className="groupbuy-card__status f-xs brand">{STATUS_LABELS[item.status] ?? item.status}</Text>
            </View>
            <Text className="groupbuy-card__desc f-xs t3 ellipsis-2">{item.description}</Text>
            <View className="row wrap groupbuy-card__tags">
              <Tag styleTag={item.styleTag} />
              {item.market ? (
                <View className="tag tag-gray">
                  <Text>📍{item.market}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View className="groupbuy-card__progress">
          <View className="groupbuy-card__track">
            <View className="groupbuy-card__bar" style={{ width: `${percent}%` }} />
          </View>
          <View className="row-between groupbuy-card__progress-text">
            <Text className="f-xs t3">
              已拼 {item.currentCount} / {item.targetCount} 件
            </Text>
            <Text className="f-xs t3">{deadlineText(item.deadlineAt)}</Text>
          </View>
        </View>

        <View className="row-between groupbuy-card__foot">
          <Text className="f-xs t3">发起人：{item.initiator?.nickname ?? '匿名店主'}</Text>
          <View
            className={`btn btn-sm ${item.joined ? 'btn-plain' : 'btn-primary'} ${busyId === item.id ? 'btn-disabled' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              if (busyId) return;
              join(item);
            }}
          >
            <Text>{item.joined ? '退出拼单' : '我要参团'}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View className="page-safe">
      <Tabs items={TABS} current={tab} onChange={setTab} />

      {tab === 'square' ? (
        <FilterBar
          groups={[{ key: 'styleTag', label: '风格', options: STYLE_TAGS.map((t) => ({ value: t, label: t })) }]}
          value={{ styleTag }}
          onChange={(_, next) => setStyleTag((next as string) || '')}
        />
      ) : null}

      <ListEmpty
        loading={loading}
        error={error ? errMsg(error, '拼单加载失败') : null}
        empty={!items.length}
        emptyText={tab === 'mine' ? '你还没有参与拼单' : '暂无拼单，来发起第一个'}
        onRetry={refetch}
      />

      {items.map(renderCard)}

      {tab === 'square' && items.length ? (
        <LoadMore loading={list.isFetchingNextPage} hasMore={!!list.hasNextPage} count={items.length} onLoadMore={() => list.fetchNextPage()} />
      ) : null}

      <View className="groupbuy__placeholder" />
      <View className="fixed-bottom">
        <View className="btn btn-accent btn-block" onClick={() => Taro.navigateTo({ url: '/pages/source/groupbuy-create' })}>
          <Text>+ 发起拼单</Text>
        </View>
      </View>
    </View>
  );
}
