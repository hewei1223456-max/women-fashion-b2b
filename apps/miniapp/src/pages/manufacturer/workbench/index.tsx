import { View, Text, Image } from '@tarojs/components';
import Taro, { usePullDownRefresh } from '@tarojs/taro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { planOf } from '@wfb/shared-types';
import { compactNumber } from '@wfb/shared-utils';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import Card from '@/components/Card';
import ListEmpty from '@/components/ListEmpty';
import TabBar from '@/components/TabBar';
import { toastError, toastSuccess } from '@/components/Toast';
import { errMsg } from '@/components/utils';
import { VIEW_LABELS, viewOfRole, useViewSwitch } from './view-switch';
import './index.scss';

/* =========================================================================
 * 厂家工作台（厂家端后台）
 *
 * 用户原话：「我需要单独再帮我做一个厂家端后台」「厂家后台要演示能发布多少款、上传方式不限」
 * 规格 REDESIGN-V2 第 4 节：
 *   - 版本卡片：当前版本 + 可发布款数（已发布 X / 上限 Y，不限则显示「不限」）
 *   - 快捷入口：发布款 / 我的款 / 主动私信 / 子账号 / 加微看板 / 数据看板
 *   - 待办：待复审内容、未读私信、今日加微
 * ========================================================================= */

interface Entry {
  key: string;
  icon: string;
  name: string;
  desc: string;
  path: string;
}

const ENTRIES: Entry[] = [
  { key: 'publish', icon: '🧵', name: '发布款', desc: '图片 / 视频 / 链接不限', path: '/pages/manufacturer/publish' },
  { key: 'mine', icon: '📦', name: '我的款', desc: '发布页下半部分即我的款', path: '/pages/manufacturer/publish' },
  { key: 'connect', icon: '🤝', name: '建联', desc: '找店主 / 接需求', path: '/pages/manufacturer/connect' },
  { key: 'fair', icon: '🏬', name: '订货会', desc: '发布与管理场次', path: '/pages/manufacturer/fair' },
  { key: 'contact', icon: '📨', name: '主动私信', desc: '按画像触达店主', path: '/pages/manufacturer/contact-list' },
  { key: 'sub', icon: '👥', name: '子账号', desc: '团队协作席位', path: '/pages/manufacturer/sub-account' },
  { key: 'wechat', icon: '📈', name: '加微看板', desc: '曝光 → 加微 → 转化率', path: '/pages/manufacturer/admin' },
  { key: 'tools', icon: '🛠️', name: '经营工具', desc: '文案 / 配图 / 选题', path: '/pages/tools/index' },
];

const DASHBOARD_LABELS: Record<string, string> = {
  basic: '基础数据',
  contact: '加微数据',
  funnel: '转化漏斗',
  full: '全量数据',
};

function go(url: string) {
  Promise.resolve(Taro.navigateTo({ url })).catch(() => {
    Taro.showToast({ title: '页面开发中，敬请期待', icon: 'none' });
  });
}

export default function ManufacturerWorkbench() {
  const user = useAppStore((s) => s.user);
  const logout = useAppStore((s) => s.logout);
  const queryClient = useQueryClient();
  const { current, switching, switchTo } = useViewSwitch();
  const plan = planOf(user?.memberLevel ?? 'manufacturer_free');
  const isManufacturer = viewOfRole(user?.role) === 'manufacturer';

  /* 退出登录：先调后端（失败也允许本地退出，演示环境友好） */
  const doLogout = () => {
    Taro.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.auth.logout();
        } catch {
          /* 后端不可用时仍允许本地退出 */
        }
        logout();
        queryClient.clear();
        toastSuccess('已退出登录');
        Taro.redirectTo({ url: '/pages/auth/login' });
      },
      fail: () => toastError('操作失败，请重试'),
    });
  };

  /* 版本配额：已发布款数来自「我的款」 */
  const products = useQuery({
    queryKey: ['my-products'],
    queryFn: () => api.product.my({ page: 1, pageSize: 50 }),
    retry: 0,
    enabled: isManufacturer,
  });
  /* 待办：待复审内容 / 未读私信 / 今日加微 */
  const myContent = useQuery({
    queryKey: ['mfr-my-content'],
    queryFn: () => api.content.my({ page: 1, pageSize: 50 }),
    retry: 0,
    enabled: isManufacturer,
  });
  const conversations = useQuery({
    queryKey: ['mfr-conversations'],
    queryFn: () => api.message.conversations(),
    retry: 0,
    enabled: isManufacturer,
  });
  const dashboard = useQuery({
    queryKey: ['mfr-dashboard'],
    queryFn: () => api.contact.dashboard(),
    retry: 0,
    enabled: isManufacturer,
  });

  usePullDownRefresh(() => {
    Promise.all([products.refetch(), myContent.refetch(), conversations.refetch(), dashboard.refetch()]).finally(() =>
      Taro.stopPullDownRefresh(),
    );
  });

  const published = products.data?.total ?? products.data?.list?.length ?? 0;
  const limitText = plan.productLimit === -1 ? '不限' : String(plan.productLimit);
  const usedPercent = plan.productLimit === -1 ? 100 : Math.min(100, Math.round((published / Math.max(1, plan.productLimit)) * 100));

  const pendingCount = (myContent.data?.list ?? []).filter((a) => a.auditStatus === 'pending').length;
  const unreadMsgs = (conversations.data ?? []).reduce((n, c) => n + (c.unreadCount ?? 0), 0);
  const todayContacts = dashboard.data?.contacts ?? 0;
  const quota = dashboard.data?.quota ?? null;

  const todos = [
    { key: 'audit', icon: '📝', name: '待复审内容', value: `${pendingCount} 条`, path: '/pages/content/content-manage' },
    { key: 'message', icon: '💬', name: '未读私信', value: `${unreadMsgs} 条`, path: '/pages/interaction/message-center' },
    { key: 'contact', icon: '📱', name: '今日加微', value: `${todayContacts} 人`, path: '/pages/manufacturer/admin' },
  ];

  return (
    <View className="page wb">
      {/* 厂家身份条 + 视角切换 */}
      <View className="wb-head">
        <View className="row">
          <Image className="wb-head__avatar" src={user?.avatarUrl ?? ''} mode="aspectFill" />
          <View className="col flex-1">
            <View className="row">
              <Text className="wb-head__name bold ellipsis">{user?.nickname ?? '未登录'}</Text>
              {isManufacturer ? (
                <View className="tag wb-head__tag">
                  <Text>厂家端</Text>
                </View>
              ) : (
                <View className="tag wb-head__tag">
                  <Text>{VIEW_LABELS[current]}</Text>
                </View>
              )}
            </View>
            <Text className="wb-head__sub f-xs">{user?.companyName ?? '厂家账号'} · {plan.label}</Text>
          </View>
        </View>

        <View className="wb-switch row">
          {(['shop_owner', 'manufacturer'] as const).map((v) => (
            <View
              key={v}
              className={`wb-switch__item ${current === v ? 'is-active' : ''}`}
              onClick={() => {
                if (v === current || switching) return;
                void switchTo(v);
              }}
            >
              <Text className="wb-switch__text">{switching === v ? '切换中…' : VIEW_LABELS[v]}</Text>
            </View>
          ))}
        </View>
        <Text className="wb-head__hint">切换视角用于演示：店主端看货源与内容，厂家端看经营与发布。</Text>
      </View>

      {!isManufacturer ? (
        <Card title="当前不是厂家身份" subtitle="切换到厂家端后即可使用发布款、加微看板等能力">
          <View className="btn btn-primary btn-sm" onClick={() => void switchTo('manufacturer')}>
            <Text>{switching ? '切换中…' : '切到厂家端'}</Text>
          </View>
        </Card>
      ) : null}

      {/* 以下板块只在厂家视角渲染：店主视角下这些接口会 403，没必要发请求 */}
      {isManufacturer ? (
        <View>
      {/* 版本卡片：当前版本 + 已发布 / 上限 */}
      <Card title="我的版本" subtitle={`${plan.label}${plan.price ? ` · 年费 ¥${plan.price}` : ' · 免费'}`} extraText="查看我的款" onExtra={() => go('/pages/manufacturer/publish')}>
        <View className="wb-quota row-between">
          <View className="col">
            <View className="row">
              <Text className="wb-quota__num bold">{published}</Text>
              <Text className="wb-quota__unit">/ {limitText}</Text>
            </View>
            <Text className="f-xs t3">已发布款数 / 可发布上限</Text>
          </View>
          <View className="col wb-quota__right">
            <Text className="f-xs t3">剩余可发布</Text>
            <Text className="wb-quota__left bold">
              {plan.productLimit === -1 ? '不限' : Math.max(0, plan.productLimit - published)}
            </Text>
          </View>
        </View>
        <View className="wb-quota__track">
          <View className="wb-quota__bar" style={{ width: `${usedPercent}%` }} />
        </View>
        <View className="row wrap wb-quota__rights">
          <View className="tag tag-gray">
            <Text>{plan.productLimit === -1 ? '可发布款数不限' : `可发布 ${plan.productLimit} 款`}</Text>
          </View>
          <View className="tag tag-gray">
            <Text>主动私信 {plan.dailyMessages === -1 ? '不限' : `${plan.dailyMessages} 条/日`}</Text>
          </View>
          <View className="tag tag-gray">
            <Text>子账号 {plan.subAccounts === -1 ? '不限' : `${plan.subAccounts} 个`}</Text>
          </View>
          <View className="tag tag-gray">
            <Text>{DASHBOARD_LABELS[plan.dashboard] ?? '基础数据'}</Text>
          </View>
        </View>
        <Text className="f-xs t4 wb-quota__note">上传方式不限：图片、视频、款链接均可，后台按版本配额自动校验。</Text>
      </Card>

      <ListEmpty
        loading={products.isLoading && published === 0}
        error={products.isError ? errMsg(products.error, '我的款加载失败') : null}
        empty={false}
        onRetry={() => products.refetch()}
      />

      {/* 快捷入口 */}
      <Card title="快捷入口" subtitle="厂家端常用能力">
        <View className="row wrap wb-entries">
          {ENTRIES.map((e) => (
            <View key={e.key} className="wb-entry col-center" onClick={() => go(e.path)}>
              <Text className="wb-entry__icon">{e.icon}</Text>
              <Text className="wb-entry__name">{e.name}</Text>
              <Text className="wb-entry__desc ellipsis">{e.desc}</Text>
            </View>
          ))}
        </View>
      </Card>

      {/* 待办 */}
      <Card title="待办" subtitle="每天先处理这三件事">
        {todos.map((t) => (
          <View key={t.key} className="wb-todo row-between" onClick={() => go(t.path)}>
            <View className="row">
              <Text className="wb-todo__icon">{t.icon}</Text>
              <Text className="f-sm t1">{t.name}</Text>
            </View>
            <View className="row">
              <Text className="f-sm accent bold">{t.value}</Text>
              <Text className="wb-todo__arrow">›</Text>
            </View>
          </View>
        ))}
        {quota ? (
          <Text className="f-xs t3 wb-todo__note">
            今日主动私信已用 {quota.used}/{quota.limit === -1 ? '不限' : quota.limit}，配额次日重置。
          </Text>
        ) : null}
      </Card>

      {/* 加微概览（看板数据的一屏摘要，详情进「加微看板」） */}
      <Card title="加微概览" extraText="进加微看板 ›" onExtra={() => go('/pages/manufacturer/admin')}>
        <ListEmpty
          loading={dashboard.isLoading && !dashboard.data}
          error={dashboard.isError ? errMsg(dashboard.error, '看板数据加载失败') : null}
          empty={false}
          onRetry={() => dashboard.refetch()}
        />
        {dashboard.data ? (
          <View className="row wrap wb-kpis">
            <View className="wb-kpi col-center">
              <Text className="wb-kpi__value bold">{compactNumber(dashboard.data.exposure ?? 0)}</Text>
              <Text className="f-xs t3">曝光量</Text>
            </View>
            <View className="wb-kpi col-center">
              <Text className="wb-kpi__value bold accent">{compactNumber(dashboard.data.contacts ?? 0)}</Text>
              <Text className="f-xs t3">加微数</Text>
            </View>
            <View className="wb-kpi col-center">
              <Text className="wb-kpi__value bold">{((dashboard.data.contactRate ?? 0) * 100).toFixed(2)}%</Text>
              <Text className="f-xs t3">加微转化率</Text>
            </View>
          </View>
        ) : null}
      </Card>
        </View>
      ) : null}

      {/* 账号与设置：厂家端「我的」Tab 的收尾区块（资料 / 认证 / 设置 / 退出） */}
      <Card title="账号与设置" subtitle="资料 · 认证 · 通知与隐私">
        <View className="wb-setting row-between" onClick={() => Taro.navigateTo({ url: '/pages/profile/edit' })}>
          <Text className="f-sm t1">✏️ 编辑资料</Text>
          <Text className="wb-setting__arrow">›</Text>
        </View>
        <View className="wb-setting row-between" onClick={() => Taro.navigateTo({ url: '/pages/auth/certify' })}>
          <Text className="f-sm t1">🛡️ 认证与资质</Text>
          <Text className="wb-setting__arrow">›</Text>
        </View>
        <View className="wb-setting row-between" onClick={() => Taro.navigateTo({ url: '/pages/profile/settings' })}>
          <Text className="f-sm t1">⚙️ 设置（通知 / 隐私 / 黑名单）</Text>
          <Text className="wb-setting__arrow">›</Text>
        </View>
        <View className="wb-setting row-between" onClick={() => Taro.navigateTo({ url: '/pages/manufacturer/sub-account' })}>
          <Text className="f-sm t1">👥 子账号与协作</Text>
          <Text className="wb-setting__arrow">›</Text>
        </View>
        {user?.role === 'manufacturer' ? (
          <View className="wb-setting row-between" onClick={() => Taro.navigateTo({ url: '/pages/source/index' })}>
            <Text className="f-sm t1">🔍 去店主端看看（货源大厅）</Text>
            <Text className="wb-setting__arrow">›</Text>
          </View>
        ) : null}
        <View className="wb-setting row-between" onClick={doLogout}>
          <Text className="f-sm wb-setting__danger">退出登录</Text>
          <Text className="wb-setting__arrow">›</Text>
        </View>
      </Card>

      {/* 厂家端底部导航（货源 / 建联 / 订货会 / 资讯 / 我的），本页是「我的」 */}
      <TabBar current="profile" />
    </View>
  );
}
