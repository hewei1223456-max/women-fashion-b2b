import { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro, { useReachBottom } from '@tarojs/taro';
import { useQuery } from '@tanstack/react-query';
import type { ArticleSummary, FeedQuery, Meetup } from '@wfb/shared-types';
import { CONTENT_TYPE_LABELS } from '@wfb/shared-types';
import { compactNumber } from '@wfb/shared-utils';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import TabBar from '@/components/TabBar';
import ArticleCard from '@/components/ArticleCard';
import ListEmpty from '@/components/ListEmpty';
import LoadMore from '@/components/LoadMore';
import { errMsg } from '@/components/utils';
import Badge from '@/components/Badge';
import { kindLabel, meetupDateTime, meetupRange, meetupStatus, seatText } from '@/pages/meetup/meetup-utils';
import './index.scss';

/* =========================================================================
 * 资讯首页（原「首页」）
 *
 * 用户反馈：「第一页的资讯里面就只剩下游学了」「把首页改成资讯」
 *          「工具你放得太置顶了，它应该只属于功能那个模块」
 *
 * 因此本页 = 资讯信息流（UGC 社区），工具只保留最底部一行轻量入口。
 * 区块顺序（规格 REDESIGN-V2 第 4 节）：
 *   ① 问候 + 未读铃铛 ② 行业早报条 ③ 今日组局横滑条
 *   ④ 内容流 Tabs ⑤ 信息流卡片 ⑥ 底部轻量工具入口
 * ========================================================================= */

type FeedTabKey = 'recommend' | 'follow' | 'city' | 'meetup' | 'rant' | 'review';

const FEED_TABS: { key: FeedTabKey; label: string }[] = [
  { key: 'recommend', label: '推荐' },
  { key: 'follow', label: '关注' },
  { key: 'city', label: '同城' },
  { key: 'meetup', label: '组局' },
  { key: 'rant', label: '吐槽' },
  { key: 'review', label: '实评' },
];

/**
 * FeedQuery 的 type 目前只收录了 article/video/product 等旧值。
 * 新增的 UGC 类型（rant/review/meetup）后端按 contentType 直传过滤（source/service.ts 已支持），
 * 契约包不在本次改动范围内，这里做一次显式适配，避免用 any 污染整条链路。
 */
function infoFeedQuery(q: { page: number; pageSize?: number; tab?: string; type?: string; city?: string }): FeedQuery {
  return q as unknown as FeedQuery;
}

function go(url: string, tab = false) {
  const task = tab ? Taro.redirectTo({ url }) : Taro.navigateTo({ url });
  Promise.resolve(task).catch(() => {
    Taro.showToast({ title: '页面开发中，敬请期待', icon: 'none' });
  });
}

function Stars({ rating }: { rating?: number }) {
  const n = Math.max(0, Math.min(5, Math.round(rating ?? 0)));
  if (!rating) return null;
  return (
    <View className="row info-row__stars">
      <Text className="info-row__stars-icon">{'★'.repeat(n)}{'☆'.repeat(5 - n)}</Text>
      <Text className="info-row__stars-text">{n}.0</Text>
    </View>
  );
}

/**
 * 「组局」Tab 的整宽卡片：线下要素一次看全（时间 / 地点 / 集合点 / 报名方式 / 报名条件）。
 * 样式只依赖本页 index.scss —— 首页在主包，不引用分包目录里的样式，避免小程序分包 CSS 顺序问题。
 */
function MeetupFeedCard({ meetup, onClick }: { meetup: Meetup; onClick: () => void }) {
  const status = meetupStatus(meetup);
  return (
    <View className="info-meetup-full" onClick={onClick}>
      <View className="row-between">
        <View className="row">
          <View className="tag info-meetup__kind">
            <Text>{kindLabel(meetup.kind)}</Text>
          </View>
          <Text className={`info-meetup__status info-meetup__status--${status.tone}`}>{status.text}</Text>
        </View>
        <Text className="f-xs t3">{seatText(meetup)}</Text>
      </View>
      <Text className="info-meetup-full__title bold t1 ellipsis-2">{meetup.title}</Text>
      <View className="info-meetup-full__facts">
        <Text className="info-meetup__line">🕐 时间：{meetupRange(meetup.startAt, meetup.endAt)}</Text>
        <Text className="info-meetup__line">📍 地点：{[meetup.city, meetup.venue].filter(Boolean).join(' · ')}</Text>
        <Text className="info-meetup__line">🚩 集合点：{meetup.gatheringPoint || '待定'}</Text>
        <Text className="info-meetup__line">✍️ 报名方式：{meetup.signupMethod || '待定'}</Text>
        <Text className="info-meetup__line">✅ 报名条件：{meetup.signupRequirement || '待定'}</Text>
        {meetup.fee ? <Text className="info-meetup__line">💰 费用：{meetup.fee}</Text> : null}
      </View>
      <View className="row-between info-meetup__foot">
        <View className="row flex-1">
          <Image className="info-meetup__avatar" src={meetup.initiator?.avatarUrl} mode="aspectFill" />
          <Text className="f-xs t2 ellipsis info-meetup__name">{meetup.initiator?.nickname ?? '匿名同行'} 发起</Text>
          {meetup.initiator ? <Badge user={meetup.initiator} size="xs" max={2} /> : null}
        </View>
        <Text className="info-meetup__cta">{meetup.joined ? '已报名 ›' : '去报名 ›'}</Text>
      </View>
    </View>
  );
}

export default function Index() {
  const [tab, setTab] = useState<FeedTabKey>('recommend');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<ArticleSummary[]>([]);

  const user = useAppStore((s) => s.user);
  const unreadTotal = useAppStore((s) => s.unread.total);
  const setUnread = useAppStore((s) => s.setUnread);

  const city = user?.sourcingCities?.[0] ?? '广州';

  /* ① 行业早报条：资讯流里 type=news 的一条 */
  const news = useQuery({ queryKey: ['info-morning-news'], queryFn: () => api.info.feed({ page: 1, pageSize: 10 }) });

  /* ③ 今日组局横滑条：组局是一等公民（闪动形态），单独取，卡片才能展示线下要素 */
  const meetups = useQuery({
    queryKey: ['meetups-today'],
    queryFn: () => api.meetup.list({ page: 1, pageSize: 8 }),
    retry: 1,
  });

  /* ⑤ 信息流：六个 Tab 统一走 /api/info/feed；组局/吐槽/实评按 contentType 过滤
   *    （后端已在摘要行上下发 rating / wouldRebuy / meetup，卡片可直接渲染） */
  const feed = useQuery({
    queryKey: ['info-feed', tab, city, page],
    queryFn: () =>
      api.info.feed(
        infoFeedQuery({
          page,
          pageSize: 10,
          tab: tab === 'city' ? 'city' : tab === 'follow' ? 'follow' : 'recommend',
          type: tab === 'meetup' || tab === 'rant' || tab === 'review' ? tab : 'all',
          city: tab === 'city' ? city : undefined,
        }),
      ),
  });

  const unread = useQuery({ queryKey: ['unread-count'], queryFn: () => api.notification.unreadCount() });

  useEffect(() => {
    if (unread.data) setUnread(unread.data);
  }, [unread.data, setUnread]);

  useEffect(() => {
    if (!feed.data) return;
    const rows = feed.data.list ?? [];
    setList((prev) => (page <= 1 ? rows : [...prev, ...rows]));
  }, [feed.data, page]);

  const meetupRows = useMemo<Meetup[]>(() => meetups.data?.list ?? [], [meetups.data]);

  const switchTab = (key: FeedTabKey) => {
    if (key === tab) return;
    setTab(key);
    setPage(1);
    setList([]);
  };

  useReachBottom(() => {
    if (feed.isFetching || !feed.data?.hasMore) return;
    setPage((p) => p + 1);
  });

  const morningNews = (news.data?.list ?? []).find((a) => a.type === 'news') ?? news.data?.list?.[0];
  const strategy = feed.data?.strategy;

  return (
    <View className="page-safe info-home">
      {/* ① 问候 + 未读铃铛 */}
      <View className="info-head">
        <View className="col">
          <Text className="info-head__title">你好{user?.nickname ? `，${user.nickname}` : ''}</Text>
          <Text className="info-head__sub">同行在聊什么 · 今天有什么局</Text>
        </View>
        <View className="info-bell" onClick={() => go('/pages/interaction/message-center')}>
          <Text className="info-bell__icon">🔔</Text>
          {unreadTotal > 0 ? <Text className="info-bell__badge">{unreadTotal > 99 ? '99+' : unreadTotal}</Text> : null}
        </View>
      </View>

      {/* ② 行业早报条 */}
      {news.isLoading ? (
        <View className="loading">早报加载中…</View>
      ) : morningNews ? (
        <View className="info-news" onClick={() => go(`/pages/info/detail?id=${morningNews.id}`)}>
          <Text className="info-news__label">行业早报</Text>
          <Text className="info-news__title">{morningNews.title}</Text>
          <Text className="info-news__arrow">›</Text>
        </View>
      ) : (
        <View className="card-flat" onClick={() => news.refetch()}>
          <Text className="f-sm t3">早报暂不可用，点此重试</Text>
        </View>
      )}

      {/* ③ 今日组局横滑条（时间 / 地点 / 已报名人数） */}
      <View className="info-sec">
        <View className="row">
          <Text className="info-sec__title">今日组局</Text>
          <Text className="info-sec__hint">一起去拿货 · 一起做货 · 同业交流</Text>
        </View>
        <View className="row">
          <Text className="info-sec__more" onClick={() => go('/pages/meetup/create')}>
            + 发起
          </Text>
          <Text className="info-sec__more" onClick={() => go('/pages/meetup/list')}>
            全部组局 ›
          </Text>
        </View>
      </View>

      {meetups.isLoading ? (
        <View className="info-meetup-strip row">
          <View className="info-meetup-skeleton" />
          <View className="info-meetup-skeleton" />
        </View>
      ) : meetups.isError ? (
        <View className="card-flat" onClick={() => meetups.refetch()}>
          <Text className="f-sm t3">组局加载失败（{errMsg(meetups.error, '网络异常')}），点此重试</Text>
        </View>
      ) : meetupRows.length ? (
        <ScrollView scrollX className="info-meetup-strip">
          {meetupRows.map((m) => {
            const status = meetupStatus(m);
            return (
              <View key={m.id} className="info-meetup" onClick={() => go(`/pages/meetup/detail?id=${m.id}`)}>
                <View className="row-between">
                  <View className="tag info-meetup__kind">
                    <Text>{kindLabel(m.kind)}</Text>
                  </View>
                  <Text className={`info-meetup__status info-meetup__status--${status.tone}`}>{status.text}</Text>
                </View>
                <Text className="info-meetup__title bold ellipsis-2">{m.title}</Text>
                <Text className="info-meetup__line ellipsis">🕐 {meetupDateTime(m.startAt)}</Text>
                <Text className="info-meetup__line ellipsis">📍 {[m.city, m.venue].filter(Boolean).join(' · ')}</Text>
                <Text className="info-meetup__line ellipsis">🚩 集合：{m.gatheringPoint || '待定'}</Text>
                <View className="row-between info-meetup__foot">
                  <Text className="info-meetup__seats">{seatText(m)}</Text>
                  <Text className="info-meetup__cta">{m.joined ? '已报名' : '报名 ›'}</Text>
                </View>
              </View>
            );
          })}
          <View className="info-meetup info-meetup--more" onClick={() => go('/pages/meetup/list')}>
            <Text className="info-meetup__more-icon">＋</Text>
            <Text className="f-xs t3">发起组局 / 看全部</Text>
          </View>
        </ScrollView>
      ) : (
        <View className="card-flat" onClick={() => go('/pages/meetup/create')}>
          <Text className="f-sm t3">今天还没有局，点这里发起一个（可约一起去拿货 / 一起做货）</Text>
        </View>
      )}

      {/* ④ 内容流 Tabs */}
      <ScrollView scrollX className="info-tabs">
        <View className="info-tabs__inner row">
          {FEED_TABS.map((t) => (
            <View
              key={t.key}
              className={`info-tab ${t.key === tab ? 'is-active' : ''}`}
              onClick={() => switchTab(t.key)}
            >
              <Text className="info-tab__label">{t.label}</Text>
              <View className="info-tab__line" />
            </View>
          ))}
        </View>
      </ScrollView>

      {strategy ? (
        <Text className="info-strategy ellipsis-2">
          推荐策略：{strategy}
          {feed.data?.visitCount ? `（第 ${feed.data.visitCount} 次访问）` : ''}
        </Text>
      ) : null}

      {/* ⑤ 信息流卡片：组局走整宽的线下要素卡，吐槽/实评用普通卡片 + UGC 补充信息 */}
      <View>
        <ListEmpty
          loading={feed.isLoading && list.length === 0}
          error={feed.isError && list.length === 0 ? `内容加载失败：${errMsg(feed.error, '网络异常')}` : null}
          empty={!feed.isLoading && !feed.isError && list.length === 0}
          emptyText={
            tab === 'follow'
              ? '还没有关注的人发布内容'
              : tab === 'city'
                ? `同城（${city}）暂时没有内容`
                : tab === 'meetup'
                  ? '还没有人发起组局'
                  : tab === 'rant'
                    ? '还没有人吐槽'
                    : tab === 'review'
                      ? '还没有拿货实评'
                      : '暂无推荐内容'
          }
          emptyDesc={
            tab === 'meetup'
              ? '点右上角「+ 发起」，约同行一起去拿货 / 一起做货'
              : tab === 'follow'
                ? '去资讯流关注几个同行，这里就会热闹起来'
                : '换个标签或稍后再试'
          }
          onRetry={() => feed.refetch()}
        />

        {list.map((item) => {
          const typeLabel = CONTENT_TYPE_LABELS[item.contentType] ?? '内容';
          const isReview = item.contentType === 'review';
          if (item.contentType === 'meetup' && item.meetup) {
            return (
              <MeetupFeedCard
                key={item.id}
                meetup={item.meetup}
                onClick={() => go(`/pages/meetup/detail?id=${item.meetup?.id ?? 0}`)}
              />
            );
          }
          return (
            <View key={item.id} className="info-row">
              <ArticleCard
                article={item}
                showReason
                onClick={() => go(`/pages/info/detail?id=${item.id}`)}
                onUserClick={(uid) => uid && go(`/pages/profile/index?userId=${uid}`)}
                footer={
                  item.contentType === 'rant' || isReview || item.contentType === 'meetup' ? (
                    <View className="info-row__ugc">
                      <View className="tag tag-outline">
                        <Text>#{typeLabel}</Text>
                      </View>
                      {isReview ? <Stars rating={item.rating} /> : null}
                      {isReview && item.wouldRebuy !== undefined ? (
                        <View className={`tag ${item.wouldRebuy ? 'tag-success' : 'tag-gray'}`}>
                          <Text>{item.wouldRebuy ? '会再拿' : '不会复拿'}</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null
                }
              />
            </View>
          );
        })}

        <LoadMore
          loading={feed.isFetching && list.length > 0}
          hasMore={feed.data?.hasMore}
          count={list.length}
          onLoadMore={() => {
            if (feed.isFetching || !feed.data?.hasMore) return;
            setPage((p) => p + 1);
          }}
        />
      </View>

      {/* ⑥ 底部轻量工具入口（工具归属「功能」Tab，首页不再放大区块） */}
      <View className="info-tools" onClick={() => go('/pages/tools/index', true)}>
        <Text className="info-tools__icon">🛠️</Text>
        <View className="col flex-1">
          <Text className="info-tools__title">全部工具</Text>
          <Text className="info-tools__desc">文案改写 · 去水印 · 爆款选题 · AI 配图 …</Text>
        </View>
        <Text className="info-tools__arrow">›</Text>
      </View>

      <Text className="info-foot">共 {compactNumber(list.length)} 条内容 · 内容由同行发布</Text>

      <TabBar current="info" />
    </View>
  );
}
