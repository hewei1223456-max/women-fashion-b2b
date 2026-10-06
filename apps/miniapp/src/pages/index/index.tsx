import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useReachBottom } from '@tarojs/taro';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { ArticleSummary, FeedQuery, Meetup } from '@wfb/shared-types';
import { compactNumber } from '@wfb/shared-utils';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import TabBar from '@/components/TabBar';
import ListEmpty from '@/components/ListEmpty';
import LoadMore from '@/components/LoadMore';
import Waterfall from '@/components/Waterfall';
import { coverRatioOf } from '@/components/Waterfall/ratio';
import { errMsg } from '@/components/utils';
import WaterfallCard from './WaterfallCard';
import { kindLabel, meetupDateTime, meetupStatus, seatText } from '@/pages/meetup/meetup-utils';
import './index.scss';

/* =========================================================================
 * 资讯首页（原「首页」）
 *
 * 用户反馈：「第一页的资讯里面就只剩下游学了」「把首页改成资讯」
 *          「工具你放得太置顶了，它应该只属于功能那个模块」
 *          「内容资讯那里要跟小红书那样瀑布流」
 *
 * 因此本页 = 资讯信息流（UGC 社区），信息流用**双列错落瀑布流**，工具只保留最底部一行轻量入口。
 * 区块顺序（规格 REDESIGN-V2 第 4 节）：
 *   ① 问候 + 未读铃铛 ② 行业早报条 ③ 今日组局横滑条
 *   ④ 内容流 Tabs ⑤ 双列瀑布流卡片 ⑥ 底部轻量工具入口
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

/* ------------------------- 瀑布流高度预估 -------------------------
 * 只影响「两列怎么分」，不影响真实渲染尺寸：
 *   列宽（750 设计稿）= (750 - 32 页面内边距 - 8 列间距) / 2 ≈ 355
 * 封面高度按解析出的原始高宽比算（与卡片里 padding-top 用的是同一个数），
 * 因此预估高度和真实高度基本一致，两列才不会一边倒。
 * ------------------------------------------------------------------ */
const COL_WIDTH = 355;
const BODY_PADDING = 24;
const TITLE_LINE = 38;
const TITLE_CHARS_PER_LINE = 14;
const REVIEW_ROW = 34;
const MEETUP_BLOCK = 88;
const AUTHOR_ROW = 48;

function estimateCardHeight(a: ArticleSummary): number {
  const cover = a.images?.[0] || a.coverUrl;
  const coverHeight = COL_WIDTH * coverRatioOf(cover);
  const titleLines = (a.title?.length ?? 0) > TITLE_CHARS_PER_LINE ? 2 : 1;
  const isReview = a.contentType === 'review' && !!a.rating;
  const isMeetup = a.contentType === 'meetup' && !!a.meetup;
  const extra = isReview ? REVIEW_ROW : isMeetup ? MEETUP_BLOCK : 0;
  return coverHeight + BODY_PADDING + titleLines * TITLE_LINE + extra + AUTHOR_ROW;
}

export default function Index() {
  const [tab, setTab] = useState<FeedTabKey>('recommend');

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
   *    （后端已在摘要行上下发 rating / wouldRebuy / meetup，卡片可直接渲染）
   *    双列瀑布流需要翻页累积，所以用 useInfiniteQuery + useReachBottom */
  const feed = useInfiniteQuery({
    queryKey: ['info-feed', tab, city],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.info.feed(
        infoFeedQuery({
          page: Number(pageParam),
          pageSize: 12,
          tab: tab === 'city' ? 'city' : tab === 'follow' ? 'follow' : 'recommend',
          type: tab === 'meetup' || tab === 'rant' || tab === 'review' ? tab : 'all',
          city: tab === 'city' ? city : undefined,
        }),
      ),
    getNextPageParam: (last) => (last?.hasMore ? last.page + 1 : undefined),
  });

  const unread = useQuery({ queryKey: ['unread-count'], queryFn: () => api.notification.unreadCount() });

  useEffect(() => {
    if (unread.data) setUnread(unread.data);
  }, [unread.data, setUnread]);

  /** 所有分页拍平；useMemo 只在数据变化时算，配合 Waterfall 内部的分配 memo，滚动时不重算 */
  const list = useMemo<ArticleSummary[]>(() => (feed.data?.pages ?? []).flatMap((p) => p?.list ?? []), [feed.data]);

  const meetupRows = useMemo<Meetup[]>(() => meetups.data?.list ?? [], [meetups.data]);

  const switchTab = (key: FeedTabKey) => {
    if (key === tab) return;
    setTab(key);
  };

  useReachBottom(() => {
    if (feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage();
  });

  const morningNews = (news.data?.list ?? []).find((a) => a.type === 'news') ?? news.data?.list?.[0];
  const strategy = feed.data?.pages?.[0]?.strategy;
  const visitCount = feed.data?.pages?.[0]?.visitCount;

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
          {visitCount ? `（第 ${visitCount} 次访问）` : ''}
        </Text>
      ) : null}

      {/* ⑤ 双列错落瀑布流（小红书式）：封面按原始比例、两列按预估高度贪心分配 */}
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

        {list.length ? (
          <Waterfall
            items={list}
            heightOf={estimateCardHeight}
            itemKey={(item) => item.id}
            renderItem={(item) => (
              <WaterfallCard
                article={item}
                onClick={() =>
                  item.contentType === 'meetup' && item.meetup
                    ? go(`/pages/meetup/detail?id=${item.meetup.id}`)
                    : go(`/pages/info/detail?id=${item.id}`)
                }
                onUserClick={(uid) => uid && go(`/pages/profile/index?userId=${uid}`)}
              />
            )}
          />
        ) : null}

        <LoadMore
          loading={feed.isFetchingNextPage}
          hasMore={!!feed.hasNextPage}
          count={list.length}
          onLoadMore={() => {
            if (feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage();
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
