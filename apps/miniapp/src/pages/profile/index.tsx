import { useMemo, useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro, { useReachBottom } from '@tarojs/taro';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ArticleSummary, Draft } from '@wfb/shared-types';
import { planOf } from '@wfb/shared-types';
import { timeAgo } from '@wfb/shared-utils';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import TabBar from '@/components/TabBar';
import Tabs from '@/components/Tabs';
import Tag from '@/components/Tag';
import Card from '@/components/Card';
import ListEmpty from '@/components/ListEmpty';
import LoadMore from '@/components/LoadMore';
import ArticleCard from '@/components/ArticleCard';
import { toast, toastError, toastSuccess } from '@/components/Toast';
import { UserBadges } from '@/components/Badge';
import { certBadge, count, errMsg, asList } from '@/components/utils';
import { VIEW_LABELS, useViewSwitch } from '@/pages/manufacturer/workbench/view-switch';
import './index.scss';

const CONTENT_TABS = [
  { key: 'works', label: '作品' },
  { key: 'collect', label: '收藏' },
  { key: 'likes', label: '喜欢' },
  { key: 'drafts', label: '草稿' },
];

export default function Profile() {
  const user = useAppStore((s) => s.user);
  const logout = useAppStore((s) => s.logout);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('works');

  const userId = user?.id ?? 0;
  const plan = planOf(user?.memberLevel ?? 'free');
  const isManufacturer = user?.role === 'manufacturer';
  /** 视角切换：店主端 / 厂家端（演示用，一键换身份） */
  const { current: view, switching, switchTo } = useViewSwitch();

  const detail = useQuery({ queryKey: ['profile-detail', userId], queryFn: () => api.profile.detail(userId), enabled: !!userId });
  const unread = useQuery({ queryKey: ['unread-count'], queryFn: () => api.notification.unreadCount(), enabled: !!userId });

  const content = useInfiniteQuery({
    queryKey: ['my-content-list', userId, tab],
    initialPageParam: 1,
    enabled: !!userId && tab !== 'drafts',
    queryFn: ({ pageParam }) => {
      const p = { page: Number(pageParam), pageSize: 10 };
      if (tab === 'collect') return api.profile.collect(userId, p);
      if (tab === 'likes') return api.profile.likes(userId, p);
      return api.profile.content(userId, { tab: 'works', ...p });
    },
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  const drafts = useQuery({ queryKey: ['drafts'], queryFn: () => api.content.drafts(), enabled: !!userId && tab === 'drafts' });

  const list: ArticleSummary[] = useMemo(() => (content.data?.pages ?? []).flatMap((p) => p.list), [content.data]);
  const draftList: Draft[] = useMemo(() => asList<Draft>(drafts.data), [drafts.data]);

  useReachBottom(() => {
    if (tab !== 'drafts' && content.hasNextPage && !content.isFetchingNextPage) content.fetchNextPage();
  });

  const go = (url: string) => Taro.navigateTo({ url });

  const doLogout = () => {
    Taro.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.auth.logout();
        } catch {
          /* 演示环境：后端不可用时也允许本地退出 */
        }
        logout();
        queryClient.clear();
        toastSuccess('已退出登录');
        Taro.redirectTo({ url: '/pages/auth/login' });
      },
    });
  };

  const removeDraft = async (draft: Draft) => {
    try {
      await api.content.deleteDraft(draft.id);
      toast('草稿已删除');
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
    } catch (e) {
      toastError(errMsg(e, '删除草稿失败'));
    }
  };

  /* ------------------------------- 未登录 ------------------------------- */
  if (!user) {
    return (
      <View className="page-safe">
        <View className="profile__login col-center">
          <Text className="profile__login-icon">👤</Text>
          <Text className="profile__login-title bold">登录后查看「我的」</Text>
          <Text className="f-xs t3 profile__login-desc">登录可管理作品、收藏、草稿与消息通知</Text>
          <View className="btn btn-primary profile__login-btn" onClick={() => go('/pages/auth/login')}>
            <Text>去登录（演示账号一键登录）</Text>
          </View>
        </View>
        <TabBar current="profile" />
      </View>
    );
  }

  const stats = detail.data;

  return (
    <View className="page-safe profile">
      {/* 视角切换：店主端 / 厂家端（用户要求「单独一个厂家端后台，可以切换视角」） */}
      <Card title="当前视角" subtitle={isManufacturer ? '厂家端 · 发布款 / 加微看板' : '店主端 · 拿货 / 内容 / 组局'}>
        <View className="row profile__view-switch">
          {(['shop_owner', 'manufacturer'] as const).map((v) => (
            <View
              key={v}
              className={`flex-1 btn btn-sm ${view === v ? 'btn-primary' : 'btn-plain'}`}
              onClick={() => {
                if (v === view || switching) return;
                void switchTo(v);
              }}
            >
              <Text>{switching === v ? '切换中…' : VIEW_LABELS[v]}</Text>
            </View>
          ))}
        </View>
        <Text className="f-xs t4 profile__view-hint">演示用：一键切换身份，底部导航与菜单随视角变化</Text>
      </Card>

      {/* 头部 */}
      <View className="profile__header">
        <View className="row">
          <Image className="profile__avatar" src={user.avatarUrl} mode="aspectFill" />
          <View className="col flex-1 profile__head-main">
            <View className="row">
              <Text className="profile__name bold ellipsis">{user.nickname}</Text>
              {certBadge(user.certStatus) ? (
                <View className="tag tag-success profile__cert">
                  <Text>{certBadge(user.certStatus)}</Text>
                </View>
              ) : null}
            </View>
            {/* 身份标识：badges 只在 UserBrief 上，因此优先用 profile.detail 下发的 user，再兜底 store 里的账号 */}
            <View className="row profile__badge-row">
              <UserBadges user={detail.data?.user ?? user} size="xs" max={3} />
            </View>
            <View className="row profile__badges">
              <View className="tag">
                <Text>{plan.label}</Text>
              </View>
              <View className="tag tag-gray">
                <Text>{isManufacturer ? '厂家账号' : '店主账号'}</Text>
              </View>
            </View>
            {(user.styleTags ?? []).length ? (
              <View className="row wrap profile__styles">
                {user.styleTags.slice(0, 4).map((t) => (
                  <Tag key={t} styleTag={t} />
                ))}
              </View>
            ) : null}
          </View>
          <View className="btn btn-ghost btn-sm profile__edit" onClick={() => go('/pages/profile/edit')}>
            <Text>编辑资料</Text>
          </View>
        </View>

        <View className="row profile__stats">
          <View
            className="profile__stat col-center"
            onClick={() => go(`/pages/interaction/follower-list?userId=${user.id}&tab=following`)}
          >
            <Text className="profile__stat-value bold">{count(stats?.followingCount ?? 0)}</Text>
            <Text className="f-xs t3">关注</Text>
          </View>
          <View className="profile__stat col-center" onClick={() => go(`/pages/interaction/follower-list?userId=${user.id}`)}>
            <Text className="profile__stat-value bold">{count(stats?.followerCount ?? 0)}</Text>
            <Text className="f-xs t3">粉丝</Text>
          </View>
          <View className="profile__stat col-center">
            <Text className="profile__stat-value bold">{count(stats?.likeReceived ?? 0)}</Text>
            <Text className="f-xs t3">获赞</Text>
          </View>
          <View className="profile__stat col-center" onClick={() => go('/pages/profile/collection')}>
            <Text className="profile__stat-value bold">{count(stats?.collectCount ?? 0)}</Text>
            <Text className="f-xs t3">收藏</Text>
          </View>
        </View>
      </View>

      {/* 入口菜单 */}
      <Card noPadding>
        <View className="profile__menu">
          <View className="profile__menu-item row-between" onClick={() => go('/pages/interaction/message-center')}>
            <Text className="f-sm t1">💬 消息中心</Text>
            <View className="row">
              {unread.data?.total ? (
                <View className="profile__badge col-center">
                  <Text className="profile__badge-text">{unread.data.total > 99 ? '99+' : unread.data.total}</Text>
                </View>
              ) : null}
              <Text className="profile__arrow f-sm t3">›</Text>
            </View>
          </View>
          <View className="profile__menu-item row-between" onClick={() => go('/pages/profile/collection')}>
            <Text className="f-sm t1">⭐ 我的收藏</Text>
            <Text className="profile__arrow f-sm t3">›</Text>
          </View>
          <View className="profile__menu-item row-between" onClick={() => go('/pages/content/my-content')}>
            <Text className="f-sm t1">📄 我的内容 / 管理</Text>
            <Text className="profile__arrow f-sm t3">›</Text>
          </View>
          <View className="profile__menu-item row-between" onClick={() => setTab('drafts')}>
            <Text className="f-sm t1">🗂️ 草稿箱</Text>
            <Text className="profile__arrow f-sm t3">›</Text>
          </View>
          <View className="profile__menu-item row-between" onClick={() => go('/pages/profile/settings')}>
            <Text className="f-sm t1">⚙️ 设置（通知 / 隐私 / 黑名单）</Text>
            <Text className="profile__arrow f-sm t3">›</Text>
          </View>
          <View className="profile__menu-item row-between" onClick={() => go('/pages/auth/certify')}>
            <Text className="f-sm t1">🛡️ 认证与资质</Text>
            <Text className="profile__arrow f-sm t3">›</Text>
          </View>
        </View>
      </Card>

      {/* 厂家视角专属入口：厂家工作台（店主视角不显示） */}
      {isManufacturer ? (
        <Card title="厂家工作台" subtitle={`${plan.label} · 数据看板 ${plan.dashboard}`} extraText="进入 ›" onExtra={() => go('/pages/manufacturer/workbench')}>
          <View className="profile__mfr-entry row-between" onClick={() => go('/pages/manufacturer/workbench')}>
            <View className="col flex-1">
              <Text className="f-sm t1">版本配额 · 发布款 · 主动私信 · 子账号 · 加微看板 · 待办</Text>
              <Text className="f-xs t3 profile__mfr-entry-desc">厂家端后台：查看可发布款数上限并直接跳转对应能力</Text>
            </View>
            <Text className="profile__arrow f-sm t3">›</Text>
          </View>
        </Card>
      ) : null}

      {/* 作品 / 收藏 / 喜欢 / 草稿 */}
      <Tabs items={CONTENT_TABS} current={tab} onChange={setTab} scroll className="profile__tabs" />

      {tab === 'drafts' ? (
        <View className="profile__list">
          <ListEmpty
            loading={drafts.isLoading}
            error={drafts.isError ? errMsg(drafts.error, '草稿加载失败') : null}
            empty={!draftList.length}
            emptyText="暂无草稿"
            emptyDesc="发布页点击「存草稿」后会出现在这里"
            onRetry={() => drafts.refetch()}
          />
          {draftList.map((d) => (
            <Card key={d.id} onClick={() => go('/pages/content/publish')}>
              <View className="row-between">
                <Text className="f-md bold t1 ellipsis flex-1">{d.title || '未命名草稿'}</Text>
                <Text className={`f-xs ${d.scheduledAt ? 'brand' : 't3'}`}>{d.scheduledAt ? '定时发布' : '草稿'}</Text>
              </View>
              <Text className="f-xs t3 profile__draft-body ellipsis-2">{d.content || '（无正文）'}</Text>
              <View className="row-between profile__draft-foot">
                <Text className="f-xs t3">更新于 {timeAgo(d.updatedAt)}</Text>
                <Text
                  className="f-xs accent"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeDraft(d);
                  }}
                >
                  删除
                </Text>
              </View>
            </Card>
          ))}
        </View>
      ) : (
        <View className="profile__list">
          <ListEmpty
            loading={content.isLoading}
            error={content.isError ? errMsg(content.error, '内容加载失败') : null}
            empty={!list.length}
            emptyText={tab === 'works' ? '还没有发布过内容' : tab === 'collect' ? '还没有收藏' : '还没有喜欢的内容'}
            emptyDesc={tab === 'works' ? '去发布页记录你的拿货日常' : '在内容或款详情点击 ☆ / ♡ 试试'}
            onRetry={() => content.refetch()}
          />

          {list.map((a) => (
            <ArticleCard
              key={`${tab}-${a.id}`}
              article={a}
              showReason={tab !== 'works'}
              onClick={() => go(`/pages/info/detail?id=${a.id}`)}
            />
          ))}

          {list.length ? (
            <LoadMore
              loading={content.isFetchingNextPage}
              hasMore={!!content.hasNextPage}
              count={list.length}
              onLoadMore={() => content.fetchNextPage()}
            />
          ) : null}
        </View>
      )}

      <View className="profile__logout" onClick={doLogout}>
        <Text className="f-sm t3">退出登录</Text>
      </View>

      <TabBar current="profile" />
    </View>
  );
}
