import { useMemo, useState } from 'react';
import { View, Text, Image, Input, RichText, ScrollView } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Comment } from '@wfb/shared-types';
import { ARTICLE_TYPE_LABELS, STYLE_COLORS } from '@wfb/shared-types';
import { compactNumber, timeAgo } from '@wfb/shared-utils';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import ListEmpty from '@/components/ListEmpty';
import LoadMore from '@/components/LoadMore';
import './index.scss';

type MdKind = 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'ol' | 'quote' | 'tr';

interface MdBlock {
  kind: MdKind;
  text: string;
  order?: number;
  /** 表格行：单元格文本 */
  cells?: string[];
}

/** 去掉 markdown 行内标记，小程序端不支持原生富文本渲染 markdown */
function inlineText(raw: string): string {
  return raw
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\((?:.+?)\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*>\s?/, '')
    .trim();
}

/** 轻量 markdown 分块（标题/列表/引用/表格/段落），只依赖 View + Text，跨端一致 */
function parseMarkdown(src: string): MdBlock[] {
  const out: MdBlock[] = [];
  src.split(/\r?\n/).forEach((line) => {
    const t = line.trim();
    if (!t) return;
    // 表格行：| a | b |，跳过分隔行 |---|---|
    if (/^\|.*\|$/.test(t)) {
      const cells = t
        .slice(1, -1)
        .split('|')
        .map((c) => inlineText(c.trim()));
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) return;
      out.push({ kind: 'tr', text: cells.join(' / '), cells });
      return;
    }
    if (/^###\s+/.test(t)) out.push({ kind: 'h3', text: inlineText(t.replace(/^###\s+/, '')) });
    else if (/^##\s+/.test(t)) out.push({ kind: 'h2', text: inlineText(t.replace(/^##\s+/, '')) });
    else if (/^#\s+/.test(t)) out.push({ kind: 'h1', text: inlineText(t.replace(/^#\s+/, '')) });
    else if (/^>\s?/.test(t)) out.push({ kind: 'quote', text: inlineText(t) });
    else if (/^\d+[.、)]\s*/.test(t)) {
      const order = Number(t.match(/^(\d+)/)?.[1] ?? 0);
      out.push({ kind: 'ol', text: inlineText(t.replace(/^\d+[.、)]\s*/, '')), order });
    } else if (/^[-*+]\s+/.test(t)) out.push({ kind: 'li', text: inlineText(t) });
    else out.push({ kind: 'p', text: inlineText(t) });
  });
  return out;
}

function go(url: string) {
  Promise.resolve(Taro.navigateTo({ url })).catch(() => {
    Taro.showToast({ title: '页面开发中，敬请期待', icon: 'none' });
  });
}

export default function InfoDetail() {
  const router = useRouter();
  const id = Number(router.params.id ?? 0);
  const queryClient = useQueryClient();
  const user = useAppStore((s) => s.user);

  const [commentText, setCommentText] = useState('');
  const [commentPage, setCommentPage] = useState(1);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);

  const detail = useQuery({
    queryKey: ['info-detail', id],
    queryFn: () => api.info.detail(id),
    enabled: id > 0,
  });
  const comments = useQuery({
    queryKey: ['article-comments', id, commentPage],
    queryFn: () => api.interaction.commentList('article', id, { page: commentPage, pageSize: 20, sort: 'hot' }),
    enabled: id > 0,
  });

  const act = useMutation({
    mutationFn: async (kind: 'like' | 'unlike' | 'collect' | 'uncollect' | 'follow' | 'unfollow') => {
      const article = detail.data;
      if (!article) return null;
      switch (kind) {
        case 'like':
          return api.interaction.like({ targetType: 'article', targetId: id });
        case 'unlike':
          return api.interaction.unlike({ targetType: 'article', targetId: id });
        case 'collect':
          return api.interaction.collect({ targetType: 'article', targetId: id });
        case 'uncollect':
          return api.interaction.uncollect({ targetType: 'article', targetId: id });
        case 'follow':
          return api.interaction.follow({ userId: article.author.id });
        default:
          return api.interaction.unfollow({ userId: article.author.id });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['info-detail', id] });
    },
    onError: (e: Error) => Taro.showToast({ title: e.message || '操作失败', icon: 'none' }),
  });

  const sendComment = useMutation({
    mutationFn: (content: string) =>
      api.interaction.comment({
        targetType: 'article',
        targetId: id,
        content,
        parentId: replyTo?.id,
      }),
    onSuccess: () => {
      setCommentText('');
      setReplyTo(null);
      Taro.showToast({ title: '评论成功', icon: 'success' });
      void queryClient.invalidateQueries({ queryKey: ['article-comments', id] });
      void queryClient.invalidateQueries({ queryKey: ['info-detail', id] });
    },
    onError: (e: Error) => Taro.showToast({ title: e.message || '评论失败', icon: 'none' }),
  });

  const share = useMutation({
    mutationFn: (channel: 'wechat' | 'moments' | 'group' | 'link') =>
      api.interaction.share({ targetType: 'article', targetId: id, channel }),
    onSuccess: () => Taro.showToast({ title: '转发已记录', icon: 'success' }),
    onError: (e: Error) => Taro.showToast({ title: e.message || '转发失败', icon: 'none' }),
  });

  const article = detail.data;
  const isHtml = useMemo(() => !!article && /<[a-z][\s\S]*>/i.test(article.content ?? ''), [article]);
  const blocks = useMemo(() => (isHtml ? [] : parseMarkdown(article?.content ?? '')), [isHtml, article?.content]);
  const list: Comment[] = comments.data?.list ?? [];

  const onShare = () => {
    Taro.showActionSheet({ itemList: ['微信好友', '朋友圈', '微信群', '复制链接'] })
      .then((res) => {
        const channels: ('wechat' | 'moments' | 'group' | 'link')[] = ['wechat', 'moments', 'group', 'link'];
        share.mutate(channels[res.tapIndex] ?? 'link');
      })
      .catch(() => undefined);
  };

  const submitComment = () => {
    const text = commentText.trim();
    if (!text) {
      Taro.showToast({ title: '评论内容不能为空', icon: 'none' });
      return;
    }
    if (!user) {
      Taro.showToast({ title: '请先登录', icon: 'none' });
      go('/pages/auth/login');
      return;
    }
    sendComment.mutate(text);
  };

  if (!id) {
    return (
      <View className="page">
        <View className="empty">缺少内容 id，无法打开</View>
      </View>
    );
  }

  return (
    <View className="page ad-page">
      {detail.isLoading ? <View className="loading">加载中…</View> : null}

      {detail.isError ? (
        <View className="card" onClick={() => detail.refetch()}>
          <Text className="f-md t2">内容加载失败（{(detail.error as Error)?.message ?? '网络异常'}）</Text>
          <Text className="f-sm brand mt-xs">点击重试</Text>
        </View>
      ) : null}

      {article ? (
        <View>
          <View className="ad-head">
            <Text className="ad-title">{article.title}</Text>
            <View className="ad-sub">
              <Image className="ad-sub__avatar" src={article.author.avatarUrl} mode="aspectFill" />
              <View className="flex-1">
                <Text className="ad-sub__name">{article.author.nickname}</Text>
                <Text className="ad-sub__meta">
                  {ARTICLE_TYPE_LABELS[article.type] ?? '资讯'} · {timeAgo(article.createdAt)} · {compactNumber(article.viewCount)}阅读
                </Text>
              </View>
              <Text
                className={`ad-follow ${article.followed ? 'is-on' : ''}`}
                onClick={() => act.mutate(article.followed ? 'unfollow' : 'follow')}
              >
                {article.followed ? '已关注' : '+ 关注'}
              </Text>
            </View>
            <View className="row wrap mt-xs">
              {article.styleTags.map((t) => (
                <Text key={t} className="tag" style={{ color: STYLE_COLORS[t] ?? '#2b4acb' }}>
                  #{t}
                </Text>
              ))}
              {article.topics.map((t) => (
                <Text key={t} className="tag tag-gray" onClick={() => go(`/pages/topic/detail?tag=${encodeURIComponent(t)}`)}>
                  #{t}
                </Text>
              ))}
            </View>
          </View>

          {article.coverUrl ? <Image className="ad-cover" src={article.coverUrl} mode="aspectFill" /> : null}

          {isHtml ? (
            <RichText className="ad-rich" nodes={article.content} />
          ) : (
            <View className="ad-md">
              {blocks.map((b, idx) =>
                b.kind === 'tr' ? (
                  <View key={`tr-${idx}`} className="md-tr">
                    {(b.cells ?? []).map((cell, ci) => (
                      <View key={`${cell}-${ci}`} className={`md-td ${ci === 0 ? 'is-key' : ''}`}>
                        <Text className="md-td-text">{cell}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View key={`${b.kind}-${idx}`} className={`md-block md-${b.kind}`}>
                    <Text className={`md-text ${b.kind === 'h1' || b.kind === 'h2' || b.kind === 'h3' ? 'bold' : ''}`}>
                      {b.kind === 'li' ? `• ${b.text}` : b.kind === 'ol' ? `${b.order ?? idx + 1}. ${b.text}` : b.text}
                    </Text>
                  </View>
                ),
              )}
            </View>
          )}

          {article.location ? <Text className="f-xs t3">📍 {article.location}</Text> : null}

          {article.attachments?.length ? (
            <View className="card">
              <Text className="f-md bold">附件资料</Text>
              {article.attachments.map((f) => (
                <View key={f.url} className="ad-attach">
                  <Text className="ad-attach__name">📎 {f.name}</Text>
                  <Text
                    className="ad-attach__action"
                    onClick={() => {
                      void Taro.setClipboardData({ data: f.url });
                    }}
                  >
                    复制链接
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* 资讯 → 货源 联动 */}
          {article.relatedProducts?.length ? (
            <View className="card">
              <Text className="f-md bold">文中相关货源</Text>
              <ScrollView scrollX className="ad-products">
                {article.relatedProducts.map((p) => (
                  <View key={p.id} className="ad-product" onClick={() => go(`/pages/source/detail?id=${p.id}`)}>
                    <Image className="ad-product__img" src={p.images?.[0]} mode="aspectFill" />
                    <Text className="ad-product__title">{p.title}</Text>
                    <Text className="ad-product__price">¥{p.priceRange}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* 货源 → 功能 联动 */}
          {article.toolEntries?.length ? (
            <View className="card">
              <Text className="f-md bold">用工具二次创作</Text>
              <View className="ad-tools mt-xs">
                {article.toolEntries.map((t) => (
                  <Text key={t.key} className="ad-tool" onClick={() => go(t.path)}>
                    {t.label}
                  </Text>
                ))}
              </View>
            </View>
          ) : null}

          {/* 相关阅读 */}
          {article.related?.length ? (
            <View className="card">
              <Text className="f-md bold">相关阅读</Text>
              {article.related.map((r) => (
                <View key={r.id} className="ad-attach" onClick={() => go(`/pages/info/detail?id=${r.id}`)}>
                  <Text className="ad-attach__name">{r.title}</Text>
                  <Text className="ad-attach__action">›</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* 评论区 */}
      <View className="card">
        <View className="row-between">
          <Text className="f-md bold">评论 {article ? compactNumber(article.commentCount) : ''}</Text>
          {replyTo ? (
            <Text className="f-xs t3" onClick={() => setReplyTo(null)}>
              取消回复 {replyTo.user?.nickname}
            </Text>
          ) : null}
        </View>

        <ListEmpty
          loading={comments.isLoading && list.length === 0}
          error={comments.isError ? `评论加载失败：${(comments.error as Error)?.message ?? '网络异常'}` : null}
          empty={!comments.isLoading && !comments.isError && list.length === 0}
          emptyIcon="💬"
          emptyText="还没有评论，来说两句"
          onRetry={() => comments.refetch()}
        />

        {list.map((c) => (
          <View key={c.id} className="ac-item">
            <Image className="ac-item__avatar" src={c.user?.avatarUrl} mode="aspectFill" />
            <View className="ac-item__body">
              <Text className="ac-item__name">{c.user?.nickname ?? '匿名用户'}</Text>
              <Text className="ac-item__content">{c.content}</Text>
              {c.replies?.length
                ? c.replies.map((r) => (
                    <View key={r.id} className="ac-reply">
                      <Text className="ac-reply__text">
                        {r.user?.nickname ?? '匿名'}：{r.content}
                      </Text>
                    </View>
                  ))
                : null}
              <View className="ac-item__meta">
                <Text className="ac-item__time">{timeAgo(c.createdAt)}</Text>
                <Text className="ac-item__del" onClick={() => setReplyTo(c)}>
                  回复
                </Text>
              </View>
            </View>
          </View>
        ))}

        <LoadMore
          loading={comments.isFetching && list.length > 0}
          hasMore={comments.data?.hasMore}
          count={list.length}
          onLoadMore={() => {
            if (comments.isFetching || !comments.data?.hasMore) return;
            setCommentPage((p) => p + 1);
          }}
        />
      </View>

      {/* 底部操作条 */}
      <View className="fixed-bottom">
        <View className="ad-actions">
          <View className={`ad-action ${article?.liked ? 'is-on' : ''}`} onClick={() => act.mutate(article?.liked ? 'unlike' : 'like')}>
            <Text className="ad-action__icon">{article?.liked ? '❤️' : '🤍'}</Text>
            <Text className="ad-action__label">{compactNumber(article?.likeCount ?? 0)}</Text>
          </View>
          <View className={`ad-action ${article?.collected ? 'is-on' : ''}`} onClick={() => act.mutate(article?.collected ? 'uncollect' : 'collect')}>
            <Text className="ad-action__icon">{article?.collected ? '⭐' : '☆'}</Text>
            <Text className="ad-action__label">{compactNumber(article?.collectCount ?? 0)}</Text>
          </View>
          <View className="ad-comment-btn" onClick={() => Taro.showToast({ title: '在下方输入框写评论', icon: 'none' })}>
            <Text className="ad-comment-btn__ph">写评论…</Text>
          </View>
          <View className="ad-action" onClick={onShare}>
            <Text className="ad-action__icon">↗️</Text>
            <Text className="ad-action__label">{compactNumber(article?.shareCount ?? 0)}</Text>
          </View>
        </View>
      </View>

      <View className="fixed-bottom ad-input-wrap">
        <View className="ad-input-bar">
          <Input
            className="ad-input"
            value={commentText}
            placeholder={replyTo ? `回复 ${replyTo.user?.nickname ?? ''}` : '友善评论，共建行业认知'}
            confirmType="send"
            onInput={(e) => setCommentText(e.detail.value)}
            onConfirm={submitComment}
          />
          <View className="ad-send" onClick={submitComment}>
            <Text>{sendComment.isPending ? '发送中' : '发送'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
