import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/request';
import Card from '@/components/Card';
import Tag from '@/components/Tag';
import UserRow from '@/components/UserRow';
import ListEmpty from '@/components/ListEmpty';
import ProductCard from '@/components/ProductCard';
import SectionTitle from '@/components/SectionTitle';
import { toast, toastError, toastSuccess } from '@/components/Toast';
import { errMsg, deadlineText } from '@/components/utils';
import './index.scss';

const STATUS_LABELS: Record<string, string> = {
  recruiting: '招募中',
  formed: '已成团',
  completed: '已完成',
  cancelled: '已取消',
};

export default function GroupBuyDetail() {
  const router = useRouter();
  const id = Number(router.params?.id ?? 0);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const detail = useQuery({ queryKey: ['groupbuy-detail', id], queryFn: () => api.groupbuy.detail(id), enabled: !!id });
  const item = detail.data;

  const act = async () => {
    if (!item || busy) return;
    setBusy(true);
    try {
      if (item.joined) {
        await api.groupbuy.quit(item.id);
        toastSuccess('已退出拼单');
      } else {
        await api.groupbuy.join(item.id);
        toastSuccess('参团成功');
      }
      queryClient.invalidateQueries({ queryKey: ['groupbuy-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['groupbuy-list'] });
      queryClient.invalidateQueries({ queryKey: ['groupbuy-mine'] });
    } catch (e) {
      toastError(errMsg(e, '操作失败'));
    } finally {
      setBusy(false);
    }
  };

  const messageHost = async () => {
    if (!item) return;
    try {
      await api.message.send({ receiverId: item.initiatorId, content: `我想拼单：${item.title}（${item.currentCount}/${item.targetCount} 件）` });
      toast('已发送私信');
      Taro.navigateTo({ url: '/pages/interaction/message-center' });
    } catch (e) {
      toastError(errMsg(e, '私信发送失败'));
    }
  };

  if (!id) {
    return (
      <View className="page">
        <ListEmpty error="缺少拼单 ID，请从拼单广场进入" />
      </View>
    );
  }

  const percent = item && item.targetCount > 0 ? Math.min(100, Math.round((item.currentCount / item.targetCount) * 100)) : 0;

  return (
    <View className="page">
      <ListEmpty loading={detail.isLoading} error={detail.isError ? errMsg(detail.error, '拼单详情加载失败') : null} empty={!item} onRetry={() => detail.refetch()} />

      {item ? (
        <View>
          <Card>
            <View className="row-between">
              <Text className="gbb__title f-lg bold t1 flex-1">{item.title}</Text>
              <Text className="gbb__status f-xs brand">{STATUS_LABELS[item.status] ?? item.status}</Text>
            </View>
            <View className="row wrap gbb__tags">
              <Tag styleTag={item.styleTag} size="md" />
              {item.market ? (
                <View className="tag tag-gray">
                  <Text>📍 {item.market}</Text>
                </View>
              ) : null}
              <View className="tag tag-outline">
                <Text>{deadlineText(item.deadlineAt)}</Text>
              </View>
            </View>

            <View className="gbb__progress">
              <View className="gbb__track">
                <View className="gbb__bar" style={{ width: `${percent}%` }} />
              </View>
              <View className="row-between gbb__progress-text">
                <Text className="f-sm t2">
                  <Text className="bold accent">{item.currentCount}</Text> / {item.targetCount} 件
                </Text>
                <Text className="f-xs t3">{percent}%</Text>
              </View>
            </View>

            <View className="divider" />
            <Text className="f-sm t2 gbb__desc">{item.description || '发起人未填写说明。'}</Text>
            <Text className="f-xs t3 gbb__deadline">截止时间：{item.deadlineAt?.slice(0, 16).replace('T', ' ')}</Text>
          </Card>

          <Card title="发起人">
            <UserRow
              user={item.initiator}
              showFollow={false}
              onClick={() => Taro.navigateTo({ url: `/pages/profile/index` })}
              extra={
                <View className="btn btn-ghost btn-sm" onClick={messageHost}>
                  <Text>私信</Text>
                </View>
              }
            />
          </Card>

          {item.product ? (
            <View>
              <SectionTitle title="拼单款" subtitle="点击查看款详情" />
              <ProductCard product={item.product} hideContact onClick={() => Taro.navigateTo({ url: `/pages/source/detail?id=${item.product?.id}` })} />
            </View>
          ) : null}

          <View className="gbb__placeholder" />
          <View className="fixed-bottom row">
            <View className="btn btn-plain gbb__share" onClick={messageHost}>
              <Text>问发起人</Text>
            </View>
            <View className={`btn flex-1 ${item.joined ? 'btn-plain' : 'btn-accent'} ${busy ? 'btn-disabled' : ''}`}>
              <Text onClick={act}>{item.joined ? '退出拼单' : '我要参团'}</Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
