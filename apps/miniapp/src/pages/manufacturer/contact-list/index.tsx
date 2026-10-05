import { useState } from 'react';
import { View, Text, Textarea } from '@tarojs/components';
import Taro, { useReachBottom } from '@tarojs/taro';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { ContactLog } from '@wfb/shared-types';
import { timeAgo } from '@wfb/shared-utils';
import { api } from '@/services/request';
import Tabs from '@/components/Tabs';
import ListEmpty from '@/components/ListEmpty';
import LoadMore from '@/components/LoadMore';
import UserRow from '@/components/UserRow';
import Modal from '@/components/Modal';
import Card from '@/components/Card';
import { toastError } from '@/components/Toast';
import { errMsg } from '@/components/utils';
import './index.scss';

const STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待跟进' },
  { key: 'contacted', label: '已联系' },
  { key: 'converted', label: '已转化' },
  { key: 'invalid', label: '无效' },
];

const STATUS_LABELS: Record<string, string> = {
  pending: '待跟进',
  contacted: '已联系',
  converted: '已转化',
  invalid: '无效',
};

export default function ContactList() {
  const [status, setStatus] = useState('all');
  const [target, setTarget] = useState<ContactLog | null>(null);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);

  const dashboard = useQuery({ queryKey: ['contact-dashboard'], queryFn: () => api.contact.dashboard() });

  const list = useInfiniteQuery({
    queryKey: ['contact-list', status],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.contact.list({
        followUpStatus: status === 'all' ? undefined : status,
        page: Number(pageParam),
        pageSize: 15,
      }),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  const rows: ContactLog[] = (list.data?.pages ?? []).flatMap((p) => p.list);
  const quota = dashboard.data?.quota;

  useReachBottom(() => {
    if (list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage();
  });

  const openSend = (row: ContactLog) => {
    setTarget(row);
    setContent(`你好，看到你对「${row.productTitle ?? '我们的款'}」感兴趣，可以发你最新款和拿货价～`);
  };

  const send = async () => {
    if (!target || !content.trim()) return toastError('请输入私信内容');
    if (sending) return;
    setSending(true);
    try {
      const res = await api.contact.send({
        shopOwnerId: target.shopOwnerId,
        content: content.trim(),
        productId: target.productId,
      });
      if (res.sent) {
        Taro.showToast({ title: `已发送，今日剩余 ${res.remainingQuota} 条`, icon: 'success' });
        setTarget(null);
        dashboard.refetch();
        list.refetch();
      } else {
        toastError(res.reason || '发送失败：可能已超出每日配额');
      }
    } catch (e) {
      toastError(errMsg(e, '发送失败'));
    } finally {
      setSending(false);
    }
  };

  return (
    <View className="page-safe">
      <Card title="今日主动私信配额" subtitle={quota ? `每日重置：${quota.resetAt?.slice(0, 16).replace('T', ' ')}` : '加载中...'}>
        <View className="row-between">
          <Text className="f-sm t2">
            已用 <Text className="bold accent">{quota?.used ?? 0}</Text> / {quota?.limit === -1 ? '不限' : quota?.limit ?? 0}
          </Text>
          <Text className="f-xs t3">主动私信面向「加微过你的店主」</Text>
        </View>
      </Card>

      <Tabs items={STATUS_TABS} current={status} onChange={setStatus} scroll />

      <ListEmpty
        loading={list.isLoading}
        error={list.isError ? errMsg(list.error, '加微记录加载失败') : null}
        empty={!rows.length}
        emptyText="暂无加微记录"
        emptyDesc="店主在款详情点击「加微信」后会出现在这里"
        onRetry={() => list.refetch()}
      />

      {rows.map((row) => (
        <View key={row.id} className="contact-row">
          <UserRow
            user={
              row.shopOwner ?? {
                id: row.shopOwnerId,
                nickname: `店主 #${row.shopOwnerId}`,
                avatarUrl: '',
                role: 'shop_owner',
                certStatus: 'none',
                memberLevel: 'free',
                styleTags: [],
              }
            }
            showFollow={false}
            desc={row.productTitle ? `咨询款：${row.productTitle}` : '加微咨询'}
            extra={
              <View className="btn btn-sm btn-primary" onClick={() => openSend(row)}>
                <Text>发私信</Text>
              </View>
            }
          />
          <View className="row-between contact-row__foot">
            <Text className="f-xs t3">{timeAgo(row.contactedAt)}加微 · 来源 {row.source}</Text>
            <Text className={`contact-row__status f-xs ${row.followUpStatus === 'converted' ? 'brand' : 't3'}`}>
              {STATUS_LABELS[row.followUpStatus] ?? row.followUpStatus}
            </Text>
          </View>
        </View>
      ))}

      {rows.length ? (
        <LoadMore loading={list.isFetchingNextPage} hasMore={!!list.hasNextPage} count={rows.length} onLoadMore={() => list.fetchNextPage()} />
      ) : null}

      <Modal
        visible={!!target}
        title={`私信 ${target?.shopOwner?.nickname ?? '店主'}`}
        confirmText={sending ? '发送中...' : '发送'}
        cancelText="取消"
        onCancel={() => setTarget(null)}
        onConfirm={send}
      >
        <View className="contact-row__form">
          <Text className="f-xs t3">内容不可包含联系方式与敏感词，超配额会被拦截。</Text>
          <Textarea
            className="textarea contact-row__textarea"
            value={content}
            maxlength={200}
            placeholder="输入私信内容"
            onInput={(e) => setContent(e.detail.value)}
          />
        </View>
      </Modal>
    </View>
  );
}
