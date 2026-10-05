import { useState } from 'react';
import type { TargetType } from '@wfb/shared-types';
import { View, Text, Input } from '@tarojs/components';
import Taro, { useReachBottom, useRouter } from '@tarojs/taro';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { Comment } from '@wfb/shared-types';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import Tabs from '@/components/Tabs';
import ListEmpty from '@/components/ListEmpty';
import LoadMore from '@/components/LoadMore';
import CommentItem from '@/components/CommentItem';
import { toastError, toastSuccess } from '@/components/Toast';
import { errMsg } from '@/components/utils';
import './index.scss';

const SORTS = [
  { key: 'hot', label: '最热' },
  { key: 'time', label: '最新' },
];

export default function CommentList() {
  const router = useRouter();
  const targetType = (router.params?.targetType ?? 'article') as TargetType;
  const targetId = Number(router.params?.targetId ?? 0);
  const me = useAppStore((s) => s.user);
  const queryClient = useQueryClient();

  const [sort, setSort] = useState('hot');
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [sending, setSending] = useState(false);

  const list = useInfiniteQuery({
    queryKey: ['comments', targetType, targetId, sort],
    initialPageParam: 1,
    enabled: !!targetId,
    queryFn: ({ pageParam }) => api.interaction.commentList(targetType, targetId, { sort, page: Number(pageParam), pageSize: 15 }),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  const comments: Comment[] = (list.data?.pages ?? []).flatMap((p) => p.list);

  useReachBottom(() => {
    if (list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage();
  });

  const submit = async () => {
    const content = draft.trim();
    if (!content) return toastError('请输入评论内容');
    if (sending) return;
    setSending(true);
    try {
      await api.interaction.comment({
        targetType,
        targetId,
        content,
        parentId: replyTo?.id,
      });
      setDraft('');
      setReplyTo(null);
      toastSuccess('评论已发布');
      queryClient.invalidateQueries({ queryKey: ['comments', targetType, targetId] });
    } catch (e) {
      toastError(errMsg(e, '评论失败'));
    } finally {
      setSending(false);
    }
  };

  const likeComment = async (comment: Comment) => {
    try {
      if (comment.liked) await api.interaction.unlike({ targetType: 'comment', targetId: comment.id });
      else await api.interaction.like({ targetType: 'comment', targetId: comment.id });
      queryClient.invalidateQueries({ queryKey: ['comments', targetType, targetId] });
    } catch (e) {
      toastError(errMsg(e, '操作失败'));
    }
  };

  const deleteComment = (comment: Comment) => {
    Taro.showModal({
      title: '删除评论',
      content: '删除后不可恢复，确定删除吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.interaction.deleteComment(comment.id);
          toastSuccess('已删除');
          queryClient.invalidateQueries({ queryKey: ['comments', targetType, targetId] });
        } catch (e) {
          toastError(errMsg(e, '删除失败'));
        }
      },
    });
  };

  if (!targetId) {
    return (
      <View className="page">
        <ListEmpty error="缺少评论目标，请从内容详情进入" />
      </View>
    );
  }

  return (
    <View className="page-safe comments">
      <Tabs items={SORTS} current={sort} onChange={setSort} />

      <View className="comments__summary row-between">
        <Text className="f-xs t3">共 {list.data?.pages?.[0]?.total ?? 0} 条评论</Text>
        <Text className="f-xs t3">{targetType === 'product' ? '货源款' : '资讯'}</Text>
      </View>

      <ListEmpty
        loading={list.isLoading}
        error={list.isError ? errMsg(list.error, '评论加载失败') : null}
        empty={!comments.length}
        emptyText="还没有评论"
        emptyDesc="来说说你的拿货经验或款式反馈"
        onRetry={() => list.refetch()}
      />

      <View className="comments__list">
        {comments.map((c) => (
          <CommentItem
            key={c.id}
            comment={c}
            canDelete={!!me && c.userId === me.id}
            onLike={likeComment}
            onReply={(target) => setReplyTo(target)}
            onDelete={deleteComment}
            onUserClick={(userId) => Taro.navigateTo({ url: `/pages/profile/index?userId=${userId}` })}
          />
        ))}
      </View>

      {comments.length ? (
        <LoadMore loading={list.isFetchingNextPage} hasMore={!!list.hasNextPage} count={comments.length} onLoadMore={() => list.fetchNextPage()} />
      ) : null}

      <View className="comments__placeholder" />
      <View className="comments__bar">
        {replyTo ? (
          <View className="comments__reply-hint row-between">
            <Text className="f-xs t3">回复 @{replyTo.user?.nickname ?? '用户'}</Text>
            <Text className="f-xs brand" onClick={() => setReplyTo(null)}>
              取消
            </Text>
          </View>
        ) : null}
        <View className="row">
          <Input
            className="comments__input flex-1"
            value={draft}
            placeholder={replyTo ? `回复 @${replyTo.user?.nickname ?? ''}` : '说点什么…'}
            confirmType="send"
            onInput={(e) => setDraft(e.detail.value)}
            onConfirm={submit}
          />
          <View className={`btn btn-sm btn-primary comments__send ${sending ? 'btn-disabled' : ''}`} onClick={submit}>
            <Text>{sending ? '发送中' : '发送'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
