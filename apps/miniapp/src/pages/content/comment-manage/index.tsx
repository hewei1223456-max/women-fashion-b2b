import { useState } from 'react';
import { View, Text, Image, Input } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Comment } from '@wfb/shared-types';
import { compactNumber, timeAgo } from '@wfb/shared-utils';
import { api } from '@/services/request';
import ListEmpty from '@/components/ListEmpty';
import LoadMore from '@/components/LoadMore';
import { UserBadges } from '@/components/Badge';
import './index.scss';

type SortKey = 'hot' | 'time';

export default function CommentManage() {
  const router = useRouter();
  const id = Number(router.params.id ?? 0);
  const queryClient = useQueryClient();
  const [sort, setSort] = useState<SortKey>('hot');
  const [page, setPage] = useState(1);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [text, setText] = useState('');

  const mine = useQuery({
    queryKey: ['content-manage', 1],
    queryFn: () => api.content.my({ sort: 'time', page: 1, pageSize: 20 }),
    enabled: id <= 0,
  });
  const comments = useQuery({
    queryKey: ['manage-comments', id, sort, page],
    queryFn: () => api.interaction.commentList('article', id, { page, pageSize: 20, sort }),
    enabled: id > 0,
  });

  const remove = useMutation({
    mutationFn: (commentId: number) => api.interaction.deleteComment(commentId),
    onSuccess: () => {
      Taro.showToast({ title: '评论已删除', icon: 'success' });
      void queryClient.invalidateQueries({ queryKey: ['manage-comments', id] });
    },
    onError: (e: Error) => Taro.showToast({ title: e.message || '删除失败', icon: 'none' }),
  });

  const reply = useMutation({
    mutationFn: (payload: { content: string; parentId?: number }) =>
      api.interaction.comment({ targetType: 'article', targetId: id, content: payload.content, parentId: payload.parentId }),
    onSuccess: () => {
      setText('');
      setReplyTo(null);
      Taro.showToast({ title: '回复成功', icon: 'success' });
      void queryClient.invalidateQueries({ queryKey: ['manage-comments', id] });
    },
    onError: (e: Error) => Taro.showToast({ title: e.message || '回复失败', icon: 'none' }),
  });

  if (!id) {
    const rows = mine.data?.list ?? [];
    return (
      <View className="page">
        <View className="card">
          <Text className="f-lg bold">评论管理</Text>
          <Text className="f-sm t3">选择一篇内容，集中回复与删除评论</Text>
        </View>
        <ListEmpty
          loading={mine.isLoading}
          error={mine.isError ? `内容加载失败：${(mine.error as Error)?.message ?? '网络异常'}` : null}
          empty={!mine.isLoading && !mine.isError && rows.length === 0}
          emptyIcon="🗂️"
          emptyText="还没有内容"
          emptyDesc="发布内容后即可在这里管理评论"
          onRetry={() => mine.refetch()}
        />
        {rows.length > 0 ? (
          <View className="card">
            {rows.map((r) => (
              <View
                key={r.id}
                className="cm-pick"
                onClick={() => Taro.redirectTo({ url: `/pages/content/comment-manage?id=${r.id}` }).catch(() => undefined)}
              >
                <Text className="cm-pick__title">{r.title}</Text>
                <Text className="cm-pick__go">{compactNumber(r.commentCount)} 条评论 ›</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  const list: Comment[] = comments.data?.list ?? [];

  const confirmRemove = (c: Comment) => {
    Taro.showModal({
      title: '删除评论',
      content: `确认删除「${c.user?.nickname ?? '匿名'}」的评论？`,
      success: (res) => {
        if (res.confirm) remove.mutate(c.id);
      },
    });
  };

  const submitReply = () => {
    const value = text.trim();
    if (!value) {
      Taro.showToast({ title: '回复内容不能为空', icon: 'none' });
      return;
    }
    reply.mutate({ content: value, parentId: replyTo?.id });
  };

  return (
    <View className="page cm-page">
      <View className="ct-chips">
        {(['hot', 'time'] as SortKey[]).map((s) => (
          <Text
            key={s}
            className={`ct-chip ${sort === s ? 'is-active' : ''}`}
            onClick={() => {
              setSort(s);
              setPage(1);
            }}
          >
            {s === 'hot' ? '最热' : '最新'}
          </Text>
        ))}
        <Text className="ct-chip" onClick={() => comments.refetch()}>
          ↻ 刷新
        </Text>
      </View>

      <ListEmpty
        loading={comments.isLoading && list.length === 0}
        error={comments.isError ? `评论加载失败：${(comments.error as Error)?.message ?? '网络异常'}` : null}
        empty={!comments.isLoading && !comments.isError && list.length === 0}
        emptyIcon="💬"
        emptyText="还没有评论"
        emptyDesc="读者评论后可以在这里回复或删除"
        onRetry={() => comments.refetch()}
      />

      {list.length > 0 ? (
        <View className="card">
          {list.map((c) => (
            <View key={c.id} className="cm-item">
              <Image className="cm-item__avatar" src={c.user?.avatarUrl} mode="aspectFill" />
              <View className="cm-item__body">
                <View className="row">
                  <Text className="cm-item__name">
                    {c.user?.nickname ?? '匿名用户'} · {c.status === 'pending' ? '待审核' : ''}
                  </Text>
                  {c.user ? <UserBadges user={c.user} max={1} size="xs" /> : null}
                </View>
                <Text className="cm-item__content">{c.content}</Text>
                {c.replies?.length
                  ? c.replies.map((r) => (
                      <View key={r.id} className="cm-reply">
                        <Text className="cm-reply__text">
                          {r.user?.nickname ?? '匿名'}：{r.content}
                        </Text>
                      </View>
                    ))
                  : null}
                <View className="cm-item__meta">
                  <Text className="cm-item__time">
                    {timeAgo(c.createdAt)} · {compactNumber(c.likeCount)} 赞 · {c.replyCount} 回复
                  </Text>
                  <View className="cm-item__ops">
                    <Text className="cm-op" onClick={() => setReplyTo(c)}>
                      回复
                    </Text>
                    <Text className="cm-op cm-op--danger" onClick={() => confirmRemove(c)}>
                      删除
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <LoadMore
        loading={comments.isFetching && list.length > 0}
        hasMore={comments.data?.hasMore}
        count={list.length}
        onLoadMore={() => {
          if (comments.isFetching || !comments.data?.hasMore) return;
          setPage((p) => p + 1);
        }}
      />

      <View className="fixed-bottom">
        {replyTo ? (
          <Text className="f-xs t3" onClick={() => setReplyTo(null)}>
            正在回复 {replyTo.user?.nickname ?? '匿名'}，点击取消
          </Text>
        ) : null}
        <View className="cm-bar">
          <Input
            className="cm-input"
            value={text}
            placeholder="以作者身份回复…"
            confirmType="send"
            onInput={(e) => setText(e.detail.value)}
            onConfirm={submitReply}
          />
          <View className="cm-send" onClick={submitReply}>
            <Text>{reply.isPending ? '发送中' : '发送'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
