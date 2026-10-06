import { useMemo } from 'react';
import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro, { usePullDownRefresh } from '@tarojs/taro';
import { useQuery } from '@tanstack/react-query';
import type { ContactLog, Product } from '@wfb/shared-types';
import { planOf } from '@wfb/shared-types';
import { compactNumber, timeAgo } from '@wfb/shared-utils';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import TabBar from '@/components/TabBar';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import Tag from '@/components/Tag';
import ListEmpty from '@/components/ListEmpty';
import EmptyState from '@/components/EmptyState';
import SectionTitle from '@/components/SectionTitle';
import { toastError, toastSuccess } from '@/components/Toast';
import { errMsg, asList } from '@/components/utils';
import { VIEW_LABELS, viewOfRole, useViewSwitch } from '../workbench/view-switch';
import './index.scss';

/* =========================================================================
 * 厂家端 · 货源（= 我要卖货的主战场，不是浏览别人的货）
 *
 * 用户原话：「厂家版核心是厂家发布产品、找店主、建联需求、发布订货会」
 * 区块顺序（自上而下，规格 task-9 B）：
 *   ① 今日经营卡（曝光 / 加微 / 转化率 / 待处理）
 *   ② 我的款（横滑 + 发布新款大按钮）
 *   ③ 待接需求（建联：待跟进加微 + 未读私信）
 *   ④ 待办（待复审 / 未读私信 / 今日加微配额）
 *   ⑤ 我的订货会（已发布场次 + 报名人数）
 * ========================================================================= */

const PRODUCT_STATUS: Record<string, { text: string; tone: string }> = {
  approved: { text: '已通过', tone: 'ok' },
  pending: { text: '审核中', tone: 'wait' },
  rejected: { text: '未通过', tone: 'bad' },
};

const FOLLOW_STATUS: Record<string, string> = {
  pending: '待跟进',
  contacted: '已联系',
  converted: '已转化',
  invalid: '无效',
};

/** 后端看板额外下发的字段（契约里暂未声明，读的时候按可选处理） */
type DashboardExtra = { todayContacts?: number; productCount?: number };

export default function ManufacturerHome() {
  const user = useAppStore((s) => s.user);
  const isManufacturer = viewOfRole(user?.role) === 'manufacturer';
  const { current, switching, switchTo } = useViewSwitch();
  const plan = planOf(user?.memberLevel ?? 'manufacturer_free');

  const dashboard = useQuery({ queryKey: ['mfr-home-dashboard'], queryFn: () => api.contact.dashboard(), retry: 0, enabled: isManufacturer });
  const products = useQuery({ queryKey: ['my-products'], queryFn: () => api.product.my({ page: 1, pageSize: 20 }), retry: 0, enabled: isManufacturer });
  const contacts = useQuery({ queryKey: ['mfr-home-contacts'], queryFn: () => api.contact.list({ page: 1, pageSize: 20 }), retry: 0, enabled: isManufacturer });
  const conversations = useQuery({ queryKey: ['mfr-home-conversations'], queryFn: () => api.message.conversations(), retry: 0, enabled: isManufacturer });
  const myContent = useQuery({ queryKey: ['mfr-home-content'], queryFn: () => api.content.my({ page: 1, pageSize: 50 }), retry: 0, enabled: isManufacturer });
  const fairs = useQuery({ queryKey: ['mfr-home-fairs'], queryFn: () => api.fair.list({ page: 1, pageSize: 50 }), retry: 0, enabled: isManufacturer });

  usePullDownRefresh(() => {
    Promise.all([dashboard.refetch(), products.refetch(), contacts.refetch(), conversations.refetch(), myContent.refetch(), fairs.refetch()]).finally(() =>
      Taro.stopPullDownRefresh(),
    );
  });

  const myProducts: Product[] = useMemo(() => products.data?.list ?? [], [products.data]);
  const myContacts: ContactLog[] = useMemo(() => asList<ContactLog>(contacts.data), [contacts.data]);
  const convList = conversations.data ?? [];

  /* ① 今日经营卡 */
  const extra = dashboard.data as (typeof dashboard.data & DashboardExtra) | undefined;
  const exposure = dashboard.data?.exposure ?? 0;
  const contactsCount = dashboard.data?.contacts ?? 0;
  const contactRate = (dashboard.data?.contactRate ?? 0) * 100;
  const todayContacts = extra?.todayContacts ?? 0;
  const quota = dashboard.data?.quota;

  /* ③④ 待接需求 / 待办 */
  const pendingContacts = myContacts.filter((c) => c.followUpStatus === 'pending');
  const unreadMsgs = convList.reduce((n, c) => n + (c.unreadCount ?? 0), 0);
  const pendingAudit = (myContent.data?.list ?? []).filter((a) => a.auditStatus === 'pending').length;

  /* ⑤ 我的订货会 */
  const myFairs = useMemo(() => (fairs.data?.list ?? []).filter((f) => f.hostId === user?.id), [fairs.data, user?.id]);
  const fairSignups = myFairs.reduce((n, f) => n + (f.signupCount ?? 0), 0);

  const go = (url: string) => Taro.navigateTo({ url });
  const limitText = plan.productLimit === -1 ? '不限' : String(plan.productLimit);

  if (!isManufacturer) {
    return (
      <View className="page-safe">
        <EmptyState
          icon="🏭"
          title="当前不是厂家身份"
          desc="切换到厂家端后即可管理自己的款、找店主建联、发布订货会"
          actionText={switching ? '切换中…' : `切到${VIEW_LABELS.manufacturer}`}
          onAction={() => void switchTo('manufacturer')}
          secondaryText="去店铺端逛逛"
          onSecondary={() => Taro.redirectTo({ url: '/pages/source/index' })}
        />
        <TabBar current="goods" />
      </View>
    );
  }

  return (
    <View className="page-safe mfr-home">
      {/* 身份条 */}
      <View className="mfr-home__head">
        <View className="row">
          <Image className="mfr-home__avatar" src={user?.avatarUrl ?? ''} mode="aspectFill" />
          <View className="col flex-1">
            <View className="row">
              <Text className="mfr-home__name bold ellipsis">{user?.companyName ?? user?.nickname ?? '厂家'}</Text>
              <Badge user={user} max={2} size="sm" />
            </View>
            <Text className="f-xs mfr-home__sub">
              {plan.label} · 可发布款 {limitText} · 当前视角 {VIEW_LABELS[current]}
            </Text>
          </View>
          <View className="mfr-home__switch" onClick={() => void switchTo('shop_owner')}>
            <Text className="f-xs">{switching ? '切换中…' : '切到店主端'}</Text>
          </View>
        </View>
      </View>

      {/* ① 今日经营卡 */}
      <Card title="今日经营" subtitle="曝光 → 加微 → 转化" extraText="完整数据 ›" onExtra={() => go('/pages/manufacturer/admin')}>
        <ListEmpty
          loading={dashboard.isLoading && !dashboard.data}
          error={dashboard.isError ? errMsg(dashboard.error, '经营数据加载失败') : null}
          empty={false}
          onRetry={() => dashboard.refetch()}
        />
        <View className="row wrap mfr-home__kpis">
          <View className="mfr-home__kpi col-center">
            <Text className="mfr-home__kpi-value bold">{compactNumber(exposure)}</Text>
            <Text className="f-xs t3">曝光量</Text>
          </View>
          <View className="mfr-home__kpi col-center">
            <Text className="mfr-home__kpi-value bold accent">{compactNumber(contactsCount)}</Text>
            <Text className="f-xs t3">累计加微</Text>
          </View>
          <View className="mfr-home__kpi col-center">
            <Text className="mfr-home__kpi-value bold">{contactRate.toFixed(2)}%</Text>
            <Text className="f-xs t3">加微转化率</Text>
          </View>
          <View className="mfr-home__kpi col-center">
            <Text className="mfr-home__kpi-value bold">{todayContacts}</Text>
            <Text className="f-xs t3">今日加微</Text>
          </View>
        </View>
        {quota ? (
          <View className="mfr-home__quota">
            <View className="row-between">
              <Text className="f-xs t3">
                今日主动私信已用 {quota.used}/{quota.limit === -1 ? '不限' : quota.limit}
              </Text>
              <Text className="f-xs brand" onClick={() => go('/pages/manufacturer/connect')}>
                去建联 →
              </Text>
            </View>
            <View className="mfr-home__quota-track">
              <View
                className="mfr-home__quota-bar"
                style={{ width: `${quota.limit > 0 ? Math.min(100, Math.round((quota.used / quota.limit) * 100)) : 0}%` }}
              />
            </View>
          </View>
        ) : null}
      </Card>

      {/* ② 我的款 */}
      <Card
        title="我的款"
        subtitle={`已发布 ${products.data?.total ?? myProducts.length} / ${limitText}`}
        extraText="全部款 ›"
        onExtra={() => go('/pages/manufacturer/publish')}
        noPadding
      >
        <View className="mfr-home__publish">
          <View className="mfr-home__publish-btn row-center" onClick={() => go('/pages/manufacturer/publish')}>
            <Text className="mfr-home__publish-text">＋ 发布新款（图片 / 视频 / 链接不限）</Text>
          </View>
        </View>

        <ListEmpty
          loading={products.isLoading && !myProducts.length}
          error={products.isError ? errMsg(products.error, '我的款加载失败') : null}
          empty={!myProducts.length}
          emptyText="还没有发布过款"
          emptyDesc="发布后店主可在货源里搜到，并直接加微拿货"
          onRetry={() => products.refetch()}
        />

        {myProducts.length ? (
          <ScrollView className="mfr-home__scroll" scrollX enableFlex>
            <View className="mfr-home__scroll-row row">
              {myProducts.map((p) => {
                const st = PRODUCT_STATUS[p.status] ?? PRODUCT_STATUS.pending;
                return (
                  <View key={p.id} className="mfr-home__pcard" onClick={() => go('/pages/manufacturer/publish')}>
                    <Image className="mfr-home__pcard-img" src={(p.images ?? [])[0]} mode="aspectFill" />
                    <View className={`mfr-home__pcard-status is-${st.tone}`}>
                      <Text className="mfr-home__pcard-status-text">{st.text}</Text>
                    </View>
                    <Text className="mfr-home__pcard-title f-xs t1 ellipsis-2">{p.title}</Text>
                    <View className="row-between mfr-home__pcard-foot">
                      <Text className="f-xs accent bold">¥{p.priceRange}</Text>
                      <Text className="f-xs t3">加微 {p.contactCount}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        ) : null}
      </Card>

      {/* ③ 待接需求（建联） */}
      <Card title="待接需求" subtitle="店主加微 / 私信都是待接的合作机会" extraText="建联中心 ›" onExtra={() => go('/pages/manufacturer/connect')}>
        {pendingContacts.length === 0 && unreadMsgs === 0 ? (
          <Text className="f-sm t3">暂无待接需求，主动找店主发合作意向效果更好</Text>
        ) : null}

        {pendingContacts.slice(0, 3).map((c) => (
          <View key={c.id} className="mfr-home__need row-between" onClick={() => go('/pages/manufacturer/connect')}>
            <View className="col flex-1">
              <Text className="f-sm t1 ellipsis">
                {c.shopOwner?.nickname ?? `店主 #${c.shopOwnerId}`} 加了你的微信
              </Text>
              <Text className="f-xs t3 ellipsis">
                {c.productTitle ? `咨询款：${c.productTitle}` : '加微咨询'} · {timeAgo(c.contactedAt)}
              </Text>
            </View>
            <View className="tag tag-accent">
              <Text>{FOLLOW_STATUS[c.followUpStatus] ?? c.followUpStatus}</Text>
            </View>
          </View>
        ))}

        {unreadMsgs > 0 ? (
          <View className="mfr-home__need row-between" onClick={() => go('/pages/interaction/message-center')}>
            <View className="col flex-1">
              <Text className="f-sm t1">有 {unreadMsgs} 条未读私信</Text>
              <Text className="f-xs t3">店主咨询款式、起订量、发货时效</Text>
            </View>
            <Text className="f-sm brand">去看 ›</Text>
          </View>
        ) : null}
      </Card>

      {/* ④ 待办 */}
      <Card title="待办" subtitle="每天先处理这三件事">
        <View className="mfr-home__todo row-between" onClick={() => go('/pages/content/content-manage')}>
          <Text className="f-sm t1">📝 待复审内容</Text>
          <View className="row">
            <Text className={`f-sm bold ${pendingAudit ? 'accent' : 't3'}`}>{pendingAudit} 条</Text>
            <Text className="mfr-home__arrow">›</Text>
          </View>
        </View>
        <View className="mfr-home__todo row-between" onClick={() => go('/pages/interaction/message-center')}>
          <Text className="f-sm t1">💬 未读私信</Text>
          <View className="row">
            <Text className={`f-sm bold ${unreadMsgs ? 'accent' : 't3'}`}>{unreadMsgs} 条</Text>
            <Text className="mfr-home__arrow">›</Text>
          </View>
        </View>
        <View className="mfr-home__todo row-between" onClick={() => go('/pages/manufacturer/contact-list')}>
          <Text className="f-sm t1">📱 今日加微配额</Text>
          <View className="row">
            <Text className="f-sm bold accent">
              {quota ? `${quota.used}/${quota.limit === -1 ? '不限' : quota.limit}` : '-'}
            </Text>
            <Text className="mfr-home__arrow">›</Text>
          </View>
        </View>
      </Card>

      {/* ⑤ 我的订货会 */}
      <Card
        title="我的订货会"
        subtitle={myFairs.length ? `已发布 ${myFairs.length} 场 · 累计报名 ${fairSignups} 人` : '还没发布过订货会'}
        extraText="订货会管理 ›"
        onExtra={() => go('/pages/manufacturer/fair')}
      >
        <ListEmpty
          loading={fairs.isLoading && !fairs.data}
          error={fairs.isError ? errMsg(fairs.error, '订货会加载失败') : null}
          empty={!myFairs.length}
          emptyText="还没有发布订货会"
          emptyDesc={plan.orderingFair ? '高级版权益已解锁，去发布一场线下订货会' : '升级高级版可发布订货会'}
          onRetry={() => fairs.refetch()}
        />
        {myFairs.slice(0, 2).map((f) => (
          <View key={f.id} className="mfr-home__fair row-between" onClick={() => go('/pages/manufacturer/fair')}>
            <View className="col flex-1">
              <Text className="f-sm t1 ellipsis">{f.title}</Text>
              <Text className="f-xs t3">
                {f.city} · {f.startAt?.slice(0, 10)} 起 · 报名 {f.signupCount ?? 0} 人
              </Text>
            </View>
            <Text className="f-sm brand">管理 ›</Text>
          </View>
        ))}
        {myFairs.length ? (
          <View className="mfr-home__fair-new" onClick={() => go('/pages/manufacturer/fair')}>
            <Text className="f-sm brand">＋ 再发布一场</Text>
          </View>
        ) : null}
      </Card>

      {/* 经营工具入口（工具不占 Tab，放在货源页尾） */}
      <Card title="经营工具" subtitle="先把款做成内容，再拿数据调优">
        <View className="row wrap mfr-home__tools">
          {[
            { key: 'rewrite', icon: '✍️', name: '文案改写', path: '/pages/tools/rewrite' },
            { key: 'ai-image', icon: '🖼️', name: 'AI 配图', path: '/pages/tools/ai-image' },
            { key: 'remove-bg', icon: '🪄', name: '图片去背景', path: '/pages/tools/remove-bg' },
            { key: 'trending', icon: '🔥', name: '爆款选题', path: '/pages/tools/trending' },
          ].map((t) => (
            <View key={t.key} className="mfr-home__tool col-center" onClick={() => go(t.path)}>
              <Text className="mfr-home__tool-icon">{t.icon}</Text>
              <Text className="f-xs t2">{t.name}</Text>
            </View>
          ))}
        </View>
      </Card>

      <SectionTitle title="厂家端导航" subtitle="货源 / 建联 / 订货会 / 资讯 / 我的" />
      <TabBar current="goods" />
    </View>
  );
}
