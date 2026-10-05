import { useEffect, useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ArticleSummary } from '@wfb/shared-types';
import { compactNumber, timeAgo } from '@wfb/shared-utils';
import { api } from '@/services/request';
import './index.scss';

type BoardKey = 'all' | 'info' | 'source';
type SortKey = 'time' | 'view' | 'interaction';

const BOARDS: { key: BoardKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'info', label: '资讯' },
  { key: 'source', label: '货源' },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'time', label: '最新发布' },
  { key: 'view', label: '最多浏览' },
  { key: 'interaction', label: '最多互动' },
];

const AUDIT_LABELS: Record<string, string> = { pending: '审核中', approved: '已通过', rejected: '未通过' };
const VISIBILITY_LABELS: Record<string, string> = {
  public: '公开',
  fans: '仅粉丝',
  group: '仅群成员',
  elite: '精英群',
  shark: '鲨鱼群',
  landmark: '大店会员',
};

function go(url: string) {
  Promise.resolve(Taro.navigateTo({ url })).catch(() => Taro.showToast({ title: '页面开发中，敬请期待', icon: 'none' }));
}

export default function MyContent() {
  const queryClient = useQueryClient();
  const [board, setBoard] = useState<BoardKey>('all');
  const [sort, setSort] = useState<SortKey>('time');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<ArticleSummary[]>([]);
  const [toppedIds, setToppedIds] = useState<number[]>([]);

  const query = useQuery({
    queryKey: ['my-content', board, sort, page],
    queryFn: () => api.content.my({ board: board === 'all' ? undefined : board, sort, page, pageSize: 10 }),
  });

  useEffect(() => {
    if (!query.data) return;
    const rows = query.data.list ?? [];
    setList((prev) => (page <= 1 ? rows : [...prev, ...rows]));
  }, [query.data, page]);

  const switchBoard = (b: BoardKey) => {
    setBoard(b);
    setPage(1);
    setList([]);
  };
  const switchSort = (s: SortKey) => {
    setSort(s);
    setPage(1);
    setList([]);
  };

  const top = useMutation({
    mutationFn: (id: number) => api.content.top(id),
    onSuccess: (res, id) => {
      setToppedIds((prev) => (res.topped ? [...prev, id] : prev.filter((x) => x !== id)));
      Taro.showToast({ title: res.topped ? '已置顶' : '已取消置顶', icon: 'success' });
      void queryClient.invalidateQueries({ queryKey: ['my-content'] });
    },
    onError: (e: Error) => Taro.showToast({ title: e.message || '置顶失败', icon: 'none' }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.content.remove(id),
    onSuccess: (res) => {
      Taro.showToast({ title: `已删除，${timeAgo(res.restorableUntil)}前可恢复`, icon: 'none' });
      setPage(1);
      setList([]);
      void queryClient.invalidateQueries({ queryKey: ['my-content'] });
    },
    onError: (e: Error) => Taro.showToast({ title: e.message || '删除失败', icon: 'none' }),
  });

  const confirmRemove = (item: ArticleSummary) => {
    Taro.showModal({
      title: '删除内容',
      content: `确认删除「${item.title}」？删除后 30 天内可在内容管理中恢复。`,
      success: (res) => {
        if (res.confirm) remove.mutate(item.id);
      },
    });
  };

  const totals = list.reduce(
    (acc, i) => ({
      view: acc.view + (i.viewCount ?? 0),
      like: acc.like + (i.likeCount ?? 0),
      collect: acc.collect + (i.collectCount ?? 0),
      comment: acc.comment + (i.commentCount ?? 0),
    }),
    { view: 0, like: 0, collect: 0, comment: 0 },
  );

  return (
    <View className="page">
      <View className="ct-tabs">
        {BOARDS.map((b) => (
          <Text key={b.key} className={`ct-tab ${board === b.key ? 'is-active' : ''}`} onClick={() => switchBoard(b.key)}>
            {b.label}
          </Text>
        ))}
      </View>

      <View className="ct-chips">
        {SORTS.map((s) => (
          <Text key={s.key} className={`ct-chip ${sort === s.key ? 'is-active' : ''}`} onClick={() => switchSort(s.key)}>
            {s.label}
          </Text>
        ))}
        <Text className="ct-chip" onClick={() => go('/pages/content/publish')}>
          ＋ 发布
        </Text>
      </View>

      {list.length > 0 ? (
        <View className="mc-summary">
          <View className="mc-summary__cell">
            <Text className="mc-summary__num">{compactNumber(totals.view)}</Text>
            <Text className="mc-summary__label">浏览</Text>
          </View>
          <View className="mc-summary__cell">
            <Text className="mc-summary__num">{compactNumber(totals.like)}</Text>
            <Text className="mc-summary__label">点赞</Text>
          </View>
          <View className="mc-summary__cell">
            <Text className="mc-summary__num">{compactNumber(totals.collect)}</Text>
            <Text className="mc-summary__label">收藏</Text>
          </View>
          <View className="mc-summary__cell">
            <Text className="mc-summary__num">{compactNumber(totals.comment)}</Text>
            <Text className="mc-summary__label">评论</Text>
          </View>
        </View>
      ) : null}

      {query.isLoading && list.length === 0 ? <View className="loading">内容加载中…</View> : null}

      {query.isError && list.length === 0 ? (
        <View className="card" onClick={() => query.refetch()}>
          <Text className="f-md t2">内容加载失败（{(query.error as Error)?.message ?? '网络异常'}）</Text>
          <Text className="f-sm brand mt-xs">点击重试</Text>
        </View>
      ) : null}

      {!query.isLoading && !query.isError && list.length === 0 ? (
        <View className="empty">
          还没有内容
          <Text className="brand" onClick={() => go('/pages/content/publish')}>
            {' '}
            去发布
          </Text>
        </View>
      ) : null}

      {list.map((item) => (
        <View key={item.id} className="ct-item">
          <Image className="ct-item__cover" src={item.coverUrl || item.images?.[0]} mode="aspectFill" />
          <View className="ct-item__body">
            <View onClick={() => go(`/pages/info/detail?id=${item.id}`)}>
              <Text className="ct-item__title ellipsis-2">{item.title}</Text>
              <View className="ct-badges">
                <Text className={`ct-badge ${item.auditStatus === 'approved' ? 'ct-badge--ok' : item.auditStatus === 'rejected' ? 'ct-badge--bad' : 'ct-badge--pending'}`}>
                  {AUDIT_LABELS[item.auditStatus] ?? item.auditStatus}
                </Text>
                <Text className="ct-badge">{VISIBILITY_LABELS[item.visibility] ?? item.visibility}</Text>
                {toppedIds.includes(item.id) ? <Text className="ct-badge ct-badge--top">已置顶</Text> : null}
                {item.topics?.slice(0, 2).map((t) => (
                  <Text key={t} className="ct-badge">
                    #{t}
                  </Text>
                ))}
              </View>
              <Text className="ct-item__stats">
                {compactNumber(item.viewCount)} 浏览 · {compactNumber(item.likeCount)} 赞 · {compactNumber(item.commentCount)} 评论 ·{' '}
                CES {item.cesScore} · {timeAgo(item.createdAt)}
              </Text>
            </View>
            <View className="ct-actions">
              <Text className="ct-action ct-action--primary" onClick={() => go(`/pages/content/content-analytics?id=${item.id}`)}>
                数据看板
              </Text>
              <Text className="ct-action" onClick={() => top.mutate(item.id)}>
                {toppedIds.includes(item.id) ? '取消置顶' : '置顶'}
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

      {list.length > 0 ? (
        <View className="loading" onClick={() => (query.data?.hasMore && !query.isFetching ? setPage((p) => p + 1) : undefined)}>
          {query.isFetching ? '加载中…' : query.data?.hasMore ? '点击加载更多' : '没有更多了'}
        </View>
      ) : null}
    </View>
  );
}
