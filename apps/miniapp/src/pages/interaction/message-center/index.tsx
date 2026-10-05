import { useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro, { useReachBottom } from '@tarojs/taro';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Conversation, Notification } from '@wfb/shared-types';
import { NOTIFICATION_LABELS } from '@wfb/shared-types';
import { timeAgo } from '@wfb/shared-utils';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import Tabs from '@/components/Tabs';
import ListEmpty from '@/components/ListEmpty';
import LoadMore from '@/components/LoadMore';
import ActionSheet from '@/components/ActionSheet';
import { toastError, toastSuccess } from '@/components/Toast';
import { errMsg } from '@/components/utils';
import './index.scss';

const TABS = [
  { key: 'message', label: '私信' },
  { key: 'notification', label: '通知' },
];

export default function MessageCenter() {
  const queryClient = useQueryClient();
  const setUnread = useAppStore((s) => s.setUnread);
  const [tab, setTab] = useState('message');
  const [sheetId, setSheetId] = useState(0);

  const conversations = useQuery({ queryKey: ['conversations'], queryFn: () => api.message.conversations(), enabled: tab === 'message' });

  const notifications = useInfiniteQuery({
    queryKey: ['notifications'],
    initialPageParam: 1,
    enabled: tab === 'notification',
    queryFn: ({ pageParam }) => api.notification.list({ page: Number(pageParam), pageSize: 15 }),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  const unread = useQuery({ queryKey: ['unread-count'], queryFn: () => api.notification.unreadCount() });

  const notifyList: Notification[] = (notifications.data?.pages ?? []).flatMap((p) => p.list);

  useReachBottom(() => {
    if (tab === 'notification' && notifications.hasNextPage && !notifications.isFetchingNextPage) notifications.fetchNextPage();
  });

  const openConversation = (item: Conversation) => {
    Taro.navigateTo({ url: `/pages/interaction/conversation?id=${item.id}` });
  };

  const removeConversation = async (id: number) => {
    setSheetId(0);
    try {
      await api.message.remove(id);
      toastSuccess('已删除会话');
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      unread.refetch().then((res) => {
        if (res.data) setUnread(res.data);
      });
    } catch (e) {
      toastError(errMsg(e, '删除失败'));
    }
  };

  const readAll = async () => {
    try {
      await api.notification.readAll();
      toastSuccess('已全部标记为已读');
      notifications.refetch();
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    } catch (e) {
      toastError(errMsg(e, '操作失败'));
    }
  };

  const openNotification = async (item: Notification) => {
    if (!item.isRead) {
      try {
        await api.notification.read(item.id);
        notifications.refetch();
        queryClient.invalidateQueries({ queryKey: ['unread-count'] });
      } catch {
        /* 忽略已读失败，不影响跳转 */
      }
    }
    if (item.targetType === 'article' && item.targetId) Taro.navigateTo({ url: `/pages/info/detail?id=${item.targetId}` });
    else if (item.targetType === 'product' && item.targetId) Taro.navigateTo({ url: `/pages/source/detail?id=${item.targetId}` });
    else if (item.type === 'message') Taro.navigateTo({ url: '/pages/interaction/message-center' });
    else if (item.type === 'follow' && item.actor) Taro.navigateTo({ url: `/pages/interaction/follower-list?userId=${item.actor.id}` });
  };

  const tabItems = TABS.map((t) => ({
    ...t,
    badge: t.key === 'notification' ? unread.data?.notification : unread.data?.message,
  }));

  return (
    <View className="page-safe">
      <Tabs items={tabItems} current={tab} onChange={setTab} />

      {tab === 'notification' ? (
        <View className="msg__head row-between">
          <Text className="f-xs t3">通知包含点赞、评论、关注、审核结果等</Text>
          <Text className="f-xs brand" onClick={readAll}>
            全部已读
          </Text>
        </View>
      ) : null}

      {tab === 'message' ? (
        <View>
          <ListEmpty
            loading={conversations.isLoading}
            error={conversations.isError ? errMsg(conversations.error, '会话加载失败') : null}
            empty={!conversations.data?.length}
            emptyText="暂无会话"
            emptyDesc="在款详情或厂家主页点击「加微信」「私信」即可开启沟通"
            onRetry={() => conversations.refetch()}
          />
          {(conversations.data ?? []).map((item) => (
            <View
              key={item.id}
              className="msg-row row"
              onClick={() => openConversation(item)}
              onLongPress={() => setSheetId(item.id)}
            >
              <Image className="msg-row__avatar" src={item.peer?.avatarUrl} mode="aspectFill" />
              <View className="col flex-1">
                <View className="row-between">
                  <Text className="msg-row__name bold t1 ellipsis">{item.peer?.nickname ?? '用户'}</Text>
                  <Text className="f-xs t3">{item.lastMessageAt ? timeAgo(item.lastMessageAt) : ''}</Text>
                </View>
                <Text className="msg-row__last f-xs t3 ellipsis">{item.lastMessage || '开始聊天吧'}</Text>
              </View>
              {item.unreadCount > 0 ? (
                <View className="msg-row__badge col-center">
                  <Text className="msg-row__badge-text">{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <View>
          <ListEmpty
            loading={notifications.isLoading}
            error={notifications.isError ? errMsg(notifications.error, '通知加载失败') : null}
            empty={!notifyList.length}
            emptyText="暂无通知"
            onRetry={() => notifications.refetch()}
          />
          {notifyList.map((item) => (
            <View key={item.id} className="notice-row row" onClick={() => openNotification(item)}>
              {item.actor?.avatarUrl ? <Image className="notice-row__avatar" src={item.actor.avatarUrl} mode="aspectFill" /> : <View className="notice-row__avatar notice-row__avatar--sys col-center"><Text className="f-xs t3">系统</Text></View>}
              <View className="col flex-1">
                <View className="row">
                  <Text className="notice-row__title f-sm bold t1">{item.title}</Text>
                  {!item.isRead ? <View className="notice-row__dot" /> : null}
                </View>
                <Text className="notice-row__body f-xs t3 ellipsis-2">{item.body || NOTIFICATION_LABELS[item.type] || ''}</Text>
                <Text className="notice-row__time f-xs t3">{timeAgo(item.createdAt)}</Text>
              </View>
            </View>
          ))}
          {notifyList.length ? (
            <LoadMore
              loading={notifications.isFetchingNextPage}
              hasMore={!!notifications.hasNextPage}
              count={notifyList.length}
              onLoadMore={() => notifications.fetchNextPage()}
            />
          ) : null}
        </View>
      )}

      <ActionSheet
        visible={!!sheetId}
        title="会话操作"
        options={[{ key: 'delete', label: '删除会话', desc: '聊天记录将一并删除', danger: true }]}
        onSelect={() => removeConversation(sheetId)}
        onClose={() => setSheetId(0)}
      />
    </View>
  );
}
