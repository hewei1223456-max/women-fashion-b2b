import { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useQuery } from '@tanstack/react-query';
import type { ArticleSummary } from '@wfb/shared-types';
import { ARTICLE_TYPE_LABELS, TOOLS } from '@wfb/shared-types';
import { compactNumber, timeAgo } from '@wfb/shared-utils';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import TabBar from '@/components/TabBar';
import './index.scss';

type HomeTab = 'recommend' | 'follow';

const QUICK_TOOLS = TOOLS.slice(0, 8);

const MODULES = [
  { key: 'info', icon: '📖', name: '资讯', desc: '早报·游学·课程', path: '/pages/info/distillation' },
  { key: 'source', icon: '🧵', name: '货源', desc: '新款·厂家·拼单', path: '/pages/source/index', tab: true },
  { key: 'tools', icon: '🛠️', name: '功能', desc: 'AI 提效工具', path: '/pages/tools/index', tab: true },
];

/** 页面跳转容错：目标页尚未上线时给用户明确提示，而不是静默失败 */
function go(url: string, tab = false) {
  const task = tab ? Taro.redirectTo({ url }) : Taro.navigateTo({ url });
  Promise.resolve(task).catch(() => {
    Taro.showToast({ title: '页面开发中，敬请期待', icon: 'none' });
  });
}

function quotaText(freeQuota: number): string {
  if (freeQuota === -1) return '不限次';
  if (freeQuota === 0) return '会员';
  return `免费${freeQuota}次/日`;
}

export default function Index() {
  const [tab, setTab] = useState<HomeTab>('recommend');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<ArticleSummary[]>([]);

  const user = useAppStore((s) => s.user);
  const unreadTotal = useAppStore((s) => s.unread.total);
  const setUnread = useAppStore((s) => s.setUnread);

  const feed = useQuery({
    queryKey: ['home-feed', tab, page],
    queryFn: () => api.info.feed({ tab, page, pageSize: 10 }),
  });
  const news = useQuery({ queryKey: ['home-news'], queryFn: () => api.info.feed({ page: 1, pageSize: 10 }) });
  const sourceFeed = useQuery({ queryKey: ['home-source'], queryFn: () => api.source.feed({ page: 1, pageSize: 6 }) });
  const unread = useQuery({ queryKey: ['unread-count'], queryFn: () => api.notification.unreadCount() });

  useEffect(() => {
    if (unread.data) setUnread(unread.data);
  }, [unread.data, setUnread]);

  useEffect(() => {
    if (!feed.data) return;
    const rows = feed.data.list ?? [];
    setList((prev) => (page <= 1 ? rows : [...prev, ...rows]));
  }, [feed.data, page]);

  const switchTab = (key: HomeTab) => {
    if (key === tab) return;
    setTab(key);
    setPage(1);
    setList([]);
  };

  const morningNews = (news.data?.list ?? []).find((a) => a.type === 'news') ?? news.data?.list?.[0];
  const products = sourceFeed.data?.list ?? [];
  const strategy = feed.data?.strategy;
  const coldStart = feed.data?.coldStart;

  return (
    <View className="page-safe">
      <View className="home-head">
        <View className="col">
          <Text className="home-head__title">你好{user?.nickname ? `，${user.nickname}` : ''}</Text>
          <Text className="home-head__sub">{user ? `${ARTICLE_TYPE_LABELS.news} · 认知 + 连接 + 效率` : '女装行业认知基础设施'}</Text>
        </View>
        <View className="home-bell" onClick={() => go('/pages/interaction/message-center')}>
          <Text className="home-bell__icon">🔔</Text>
          {unreadTotal > 0 ? <Text className="home-bell__badge">{unreadTotal > 99 ? '99+' : unreadTotal}</Text> : null}
        </View>
      </View>

      {/* 行业早报条 */}
      {news.isLoading ? (
        <View className="loading">早报加载中…</View>
      ) : morningNews ? (
        <View className="home-news" onClick={() => go(`/pages/info/detail?id=${morningNews.id}`)}>
          <Text className="home-news__label">行业早报</Text>
          <Text className="home-news__title">{morningNews.title}</Text>
          <Text className="home-news__arrow">›</Text>
        </View>
      ) : (
        <View className="card-flat" onClick={() => news.refetch()}>
          <Text className="f-sm t3">早报暂不可用，点此重试</Text>
        </View>
      )}

      {/* 三大模块入口 */}
      <View className="home-mods">
        {MODULES.map((m) => (
          <View key={m.key} className="home-mod" onClick={() => go(m.path, !!m.tab)}>
            <Text className="home-mod__icon">{m.icon}</Text>
            <Text className="home-mod__name">{m.name}</Text>
            <Text className="home-mod__desc">{m.desc}</Text>
          </View>
        ))}
      </View>

      {/* 快捷工具 */}
      <View className="home-sec">
        <Text className="home-sec__title">快捷工具</Text>
        <Text className="home-sec__more" onClick={() => go('/pages/tools/index', true)}>
          全部 10 个 ›
        </Text>
      </View>
      <View className="home-tools">
        {QUICK_TOOLS.map((t) => (
          <View key={t.key} className="home-tool" onClick={() => go(t.path)}>
            <Text className="home-tool__icon">{t.icon}</Text>
            <Text className="home-tool__name">{t.name}</Text>
            <Text className="home-tool__quota">{quotaText(t.freeQuota)}</Text>
          </View>
        ))}
      </View>

      {/* 热门货源 */}
      {products.length > 0 ? (
        <View>
          <View className="home-sec">
            <Text className="home-sec__title">热门货源</Text>
            <Text className="home-sec__more" onClick={() => go('/pages/source/index', true)}>
              更多 ›
            </Text>
          </View>
          <ScrollView scrollX className="home-products">
            {products.map((p) => (
              <View
                key={p.id}
                className="home-product"
                onClick={() => go(`/pages/source/detail?id=${p.id}`)}
              >
                <Image className="home-product__img" src={p.images?.[0]} mode="aspectFill" />
                <Text className="home-product__title">{p.title}</Text>
                <Text className="home-product__price">¥{p.priceRange}</Text>
                <Text className="home-product__meta">
                  {p.shipFrom} · 起订{p.moq}件 · 加微率{Math.round((p.contactRate ?? 0) * 100)}%
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* 推荐流 */}
      <View className="home-sec">
        <View className="row">
          <Text className="home-sec__title">为你推荐</Text>
          {strategy ? <Text className="home-strategy">{coldStart ? '冷启动·探索通道' : strategy}</Text> : null}
        </View>
        <Text className="home-sec__more" onClick={() => go('/pages/info/distillation')}>
          资料库 ›
        </Text>
      </View>

      <View className="home-tabs">
        {(['recommend', 'follow'] as HomeTab[]).map((key) => (
          <Text key={key} className={`home-tab ${tab === key ? 'is-active' : ''}`} onClick={() => switchTab(key)}>
            {key === 'recommend' ? '推荐' : '关注'}
          </Text>
        ))}
      </View>

      {feed.isLoading && list.length === 0 ? <View className="loading">内容加载中…</View> : null}

      {feed.isError && list.length === 0 ? (
        <View className="card" onClick={() => feed.refetch()}>
          <Text className="f-md t2">内容加载失败，请检查网络</Text>
          <Text className="f-sm brand mt-xs">点击重试</Text>
        </View>
      ) : null}

      {!feed.isLoading && !feed.isError && list.length === 0 ? (
        <View className="empty">暂无推荐内容{tab === 'follow' ? '，先去关注几个同行吧' : ''}</View>
      ) : null}

      {list.map((item) => (
        <View key={item.id} className="hf-item" onClick={() => go(`/pages/info/detail?id=${item.id}`)}>
          <Image className="hf-item__cover" src={item.coverUrl} mode="aspectFill" />
          <View className="hf-item__body">
            <View>
              <Text className="hf-item__title ellipsis-2">{item.title}</Text>
              {item.reason ? <Text className="hf-item__reason">{item.reason}</Text> : null}
            </View>
            <View className="hf-item__meta">
              <View className="hf-item__author">
                <Image className="hf-item__avatar" src={item.author?.avatarUrl} mode="aspectFill" />
                <Text className="hf-item__name">{item.author?.nickname ?? '匿名'}</Text>
              </View>
              <Text className="hf-item__stats">
                {compactNumber(item.viewCount)}阅 · {compactNumber(item.likeCount)}赞 · {timeAgo(item.createdAt)}
              </Text>
            </View>
          </View>
        </View>
      ))}

      {list.length > 0 ? (
        <View className="loading" onClick={loadMoreClick}>
          {feed.isFetching ? '加载中…' : feed.data?.hasMore ? '点击加载更多' : '没有更多了'}
        </View>
      ) : null}

      <TabBar current="home" />
    </View>
  );

  function loadMoreClick() {
    if (feed.isFetching) return;
    if (!feed.data?.hasMore) return;
    setPage((p) => p + 1);
  }
}
