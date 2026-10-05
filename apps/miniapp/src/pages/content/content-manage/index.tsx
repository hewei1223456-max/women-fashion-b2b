import { useEffect, useState } from 'react';
import { View, Text, Image, Input } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ArticleSummary } from '@wfb/shared-types';
import { compactNumber, timeAgo } from '@wfb/shared-utils';
import { api } from '@/services/request';
import ListEmpty from '@/components/ListEmpty';
import LoadMore from '@/components/LoadMore';
import './index.scss';

type StatusKey = 'all' | 'pending' | 'approved' | 'rejected';

const STATUSES: { key: StatusKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '审核中' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '未通过' },
];

const AUDIT_LABELS: Record<string, string> = { pending: '审核中', approved: '已通过', rejected: '未通过' };

function go(url: string) {
  Promise.resolve(Taro.navigateTo({ url })).catch(() => Taro.showToast({ title: '页面开发中，敬请期待', icon: 'none' }));
}

export default function ContentManage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusKey>('all');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<ArticleSummary[]>([]);
  const [toppedIds, setToppedIds] = useState<number[]>([]);
  const [restoreId, setRestoreId] = useState('');

  const query = useQuery({
    queryKey: ['content-manage', page],
    queryFn: () => api.content.my({ sort: 'time', page, pageSize: 20 }),
  });

  useEffect(() => {
    if (!query.data) return;
    const rows = query.data.list ?? [];
    setList((prev) => (page <= 1 ? rows : [...prev, ...rows]));
  }, [query.data, page]);

  const refresh = () => {
    setPage(1);
    setList([]);
    void queryClient.invalidateQueries({ queryKey: ['content-manage'] });
  };

  const top = useMutation({
    mutationFn: (id: number) => api.content.top(id),
    onSuccess: (res, id) => {
      setToppedIds((prev) => (res.topped ? [...prev, id] : prev.filter((x) => x !== id)));
      Taro.showToast({ title: res.topped ? '已置顶（最多 3 条）' : '已取消置顶', icon: 'none' });
      void queryClient.invalidateQueries({ queryKey: ['content-manage'] });
    },
    onError: (e: Error) => Taro.showToast({ title: e.message || '置顶失败', icon: 'none' }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.content.remove(id),
    onSuccess: (res) => {
      Taro.showToast({ title: `已删除，可恢复至 ${timeAgo(res.restorableUntil)}`, icon: 'none' });
      refresh();
    },
    onError: (e: Error) => Taro.showToast({ title: e.message || '删除失败', icon: 'none' }),
  });

  const restore = useMutation({
    mutationFn: (id: number) => api.content.restore(id),
    onSuccess: () => {
      Taro.showToast({ title: '已恢复', icon: 'success' });
      setRestoreId('');
      refresh();
    },
    onError: (e: Error) => Taro.showToast({ title: e.message || '恢复失败（可能已超过 30 天）', icon: 'none' }),
  });

  const filtered = status === 'all' ? list : list.filter((i) => i.auditStatus === status);

  const counts = {
    all: list.length,
    pending: list.filter((i) => i.auditStatus === 'pending').length,
    approved: list.filter((i) => i.auditStatus === 'approved').length,
    rejected: list.filter((i) => i.auditStatus === 'rejected').length,
  };

  const confirmRemove = (item: ArticleSummary) => {
    Taro.showModal({
      title: '删除内容',
      content: `确认删除「${item.title}」？30 天内可通过「恢复内容」找回。`,
      success: (res) => {
        if (res.confirm) remove.mutate(item.id);
      },
    });
  };

  const doRestore = () => {
    const id = Number(restoreId);
    if (!id) {
      Taro.showToast({ title: '请输入要恢复的内容 ID', icon: 'none' });
      return;
    }
    restore.mutate(id);
  };

  return (
    <View className="page">
      <View className="ct-chips">
        {STATUSES.map((s) => (
          <Text key={s.key} className={`ct-chip ${status === s.key ? 'is-active' : ''}`} onClick={() => setStatus(s.key)}>
            {s.label} {counts[s.key]}
          </Text>
        ))}
        <Text className="ct-chip" onClick={refresh}>
          ↻ 刷新
        </Text>
      </View>

      <View className="card">
        <Text className="f-md bold">回收站 · 恢复内容</Text>
        <Text className="f-xs t3">删除后 30 天内可恢复，输入内容 ID 找回（内容 ID 可在提示或数据看板链接中查看）</Text>
        <View className="cg-restore">
          <Input
            className="cg-restore__input"
            type="number"
            value={restoreId}
            placeholder="输入内容 ID"
            onInput={(e) => setRestoreId(e.detail.value)}
          />
          <View className="cg-restore__btn" onClick={doRestore}>
            <Text>{restore.isPending ? '恢复中' : '恢复'}</Text>
          </View>
        </View>
      </View>

      <ListEmpty
        loading={query.isLoading && list.length === 0}
        error={query.isError && list.length === 0 ? `加载失败：${(query.error as Error)?.message ?? '网络异常'}` : null}
        empty={!query.isLoading && !query.isError && filtered.length === 0}
        emptyIcon="🧾"
        emptyText={status === 'all' ? '还没有可管理的内容' : '该状态下暂无内容'}
        emptyDesc="审核中 / 已通过 / 未通过的内容都会在这里汇总"
        onRetry={() => query.refetch()}
      />

      {filtered.map((item) => (
        <View key={item.id} className="ct-item">
          <Image className="ct-item__cover" src={item.coverUrl || item.images?.[0]} mode="aspectFill" />
          <View className="ct-item__body">
            <View>
              <Text className="ct-item__title ellipsis-2">{item.title}</Text>
              <View className="ct-badges">
                <Text
                  className={`ct-badge ${
                    item.auditStatus === 'approved' ? 'ct-badge--ok' : item.auditStatus === 'rejected' ? 'ct-badge--bad' : 'ct-badge--pending'
                  }`}
                >
                  {AUDIT_LABELS[item.auditStatus] ?? item.auditStatus}
                </Text>
                <Text className="ct-badge">ID {item.id}</Text>
                {toppedIds.includes(item.id) ? <Text className="ct-badge ct-badge--top">已置顶</Text> : null}
              </View>
              <Text className="ct-item__stats">
                {compactNumber(item.viewCount)} 浏览 · {compactNumber(item.likeCount)} 赞 · {compactNumber(item.collectCount)} 收藏 ·{' '}
                {timeAgo(item.createdAt)}
              </Text>
            </View>
            <View className="ct-actions">
              <Text className="ct-action ct-action--primary" onClick={() => go(`/pages/content/content-analytics?id=${item.id}`)}>
                数据
              </Text>
              <Text className="ct-action" onClick={() => top.mutate(item.id)}>
                {toppedIds.includes(item.id) ? '取消置顶' : '置顶'}
              </Text>
              <Text className="ct-action" onClick={() => go(`/pages/content/comment-manage?id=${item.id}`)}>
                评论管理
              </Text>
              <Text className="ct-action" onClick={() => go(`/pages/content/publish?id=${item.id}`)}>
                编辑
              </Text>
              <Text className="ct-action ct-action--danger" onClick={() => confirmRemove(item)}>
                删除
              </Text>
            </View>
          </View>
        </View>
      ))}

      <LoadMore
        loading={query.isFetching && list.length > 0}
        hasMore={query.data?.hasMore}
        count={list.length}
        onLoadMore={() => {
          if (query.isFetching || !query.data?.hasMore) return;
          setPage((p) => p + 1);
        }}
      />
    </View>
  );
}
