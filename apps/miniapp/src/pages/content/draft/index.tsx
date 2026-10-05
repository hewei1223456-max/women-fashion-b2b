import { View, Text, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContentType } from '@wfb/shared-types';
import { timeAgo } from '@wfb/shared-utils';
import { api } from '@/services/request';
import './index.scss';

const TYPE_LABELS: Record<ContentType, string> = {
  image_text: '图文',
  video: '视频',
  long_article: '长文',
  product_card: '款卡片',
  sourcing_shot: '实拍',
  outfit: '穿搭',
  groupbuy_recruit: '拼单招募',
  fair_info: '订货会',
};

export default function DraftBox() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['drafts'], queryFn: () => api.content.drafts() });

  const remove = useMutation({
    mutationFn: (id: number) => api.content.deleteDraft(id),
    onSuccess: () => {
      Taro.showToast({ title: '草稿已删除', icon: 'success' });
      void queryClient.invalidateQueries({ queryKey: ['drafts'] });
    },
    onError: (e: Error) => Taro.showToast({ title: e.message || '删除失败', icon: 'none' }),
  });

  const drafts = query.data ?? [];

  const confirmRemove = (id: number, title: string) => {
    Taro.showModal({
      title: '删除草稿',
      content: `确认删除「${title || '无标题草稿'}」？删除后不可恢复。`,
      success: (res) => {
        if (res.confirm) remove.mutate(id);
      },
    });
  };

  return (
    <View className="page">
      <View className="dr-warn">
        <Text className="dr-warn__text">💾 草稿仅自己可见，编辑过程中每 5 秒自动保存一次；草稿保留 30 天，发布后可随时回到这里继续创作。</Text>
      </View>

      {query.isLoading ? <View className="loading">草稿加载中…</View> : null}

      {query.isError ? (
        <View className="card" onClick={() => query.refetch()}>
          <Text className="f-md t2">草稿加载失败（{(query.error as Error)?.message ?? '网络异常'}）</Text>
          <Text className="f-sm brand mt-xs">点击重试</Text>
        </View>
      ) : null}

      {!query.isLoading && !query.isError && drafts.length === 0 ? (
        <View className="empty">
          还没有草稿
          <Text className="brand" onClick={() => Taro.redirectTo({ url: '/pages/content/publish' }).catch(() => undefined)}>
            {' '}
            去创作第一篇
          </Text>
        </View>
      ) : null}

      {drafts.length > 0 ? (
        <View className="ct-summary">
          <View className="ct-summary__cell">
            <Text className="ct-summary__num">{drafts.length}</Text>
            <Text className="ct-summary__label">草稿数</Text>
          </View>
          <View className="ct-summary__cell">
            <Text className="ct-summary__num">{drafts.filter((d) => d.scheduledAt).length}</Text>
            <Text className="ct-summary__label">已设定时</Text>
          </View>
          <View className="ct-summary__cell">
            <Text className="ct-summary__num">{drafts.filter((d) => d.images?.length).length}</Text>
            <Text className="ct-summary__label">含图片</Text>
          </View>
        </View>
      ) : null}

      {drafts.map((d) => (
        <View key={d.id} className="ct-item">
          <Image className="ct-item__cover" src={d.images?.[0] ?? d.videoUrl ?? ''} mode="aspectFill" />
          <View className="ct-item__body">
            <View>
              <Text className="ct-item__title ellipsis-2">{d.title || '无标题草稿'}</Text>
              <View className="ct-badges">
                <Text className="ct-badge">{TYPE_LABELS[d.contentType] ?? d.contentType}</Text>
                {d.scheduledAt ? <Text className="ct-badge ct-badge--pending">定时 {timeAgo(d.scheduledAt)}</Text> : null}
                {d.styleTags?.map((t) => (
                  <Text key={t} className="ct-badge">
                    {t}
                  </Text>
                ))}
              </View>
              <Text className="ct-item__stats">
                更新于 {timeAgo(d.updatedAt)} · {d.images?.length ?? 0} 图 · {(d.content ?? '').length} 字
              </Text>
            </View>
            <View className="ct-actions">
              <Text
                className="ct-action ct-action--primary"
                onClick={() => Taro.redirectTo({ url: `/pages/content/publish?draftId=${d.id}` }).catch(() => undefined)}
              >
                继续编辑
              </Text>
              <Text className="ct-action ct-action--danger" onClick={() => confirmRemove(d.id, d.title)}>
                删除
              </Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}
