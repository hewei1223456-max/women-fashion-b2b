import { useMemo, useState } from 'react';
import { View, Text, Textarea, Picker } from '@tarojs/components';
import Taro, { usePullDownRefresh, useReachBottom, useRouter } from '@tarojs/taro';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContactLog, Meetup, Product, User, UserBrief } from '@wfb/shared-types';
import { MEETUP_KIND_LABELS, STYLE_TAGS, planOf } from '@wfb/shared-types';
import { timeAgo } from '@wfb/shared-utils';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import TabBar from '@/components/TabBar';
import Card from '@/components/Card';
import Tabs from '@/components/Tabs';
import UserRow from '@/components/UserRow';
import FilterBar from '@/components/FilterBar';
import ListEmpty from '@/components/ListEmpty';
import LoadMore from '@/components/LoadMore';
import Modal from '@/components/Modal';
import EmptyState from '@/components/EmptyState';
import { toast, toastError, toastSuccess } from '@/components/Toast';
import { errMsg } from '@/components/utils';
import './index.scss';

/* =========================================================================
 * 厂家端 · 建联（找店主 + 接需求）
 *
 * 三种操作路径（task-9 C）：
 *   ① 找店主 → 筛画像（风格/城市/客单价档/会员等级）→ 一键发合作意向（走厂家每日配额）
 *   ② 我的需求 → 我发布的合作邀约（组局「一起做货 / 一起去拿货」）+ 发布入口
 *   ③ 收到的意向 → 谁加了我微信（加微记录 + 跟进状态）+ 谁私信我（会话）
 *
 * 数据来源全部为已有接口：
 *   api.auth.demoAccounts（店主画像演示数据，role=shop_owner）
 *   api.contact.send / api.contact.list / api.contact.dashboard（主动私信 + 配额 + 加微记录）
 *   api.message.send / api.message.conversations（私信）
 *   api.meetup.mine（我的合作邀约——后端暂无「需求大厅」，用组局承载）
 *   api.product.my（我的款，发意向时可带款）
 * ========================================================================= */

const TABS = [
  { key: 'find', label: '找店主' },
  { key: 'demand', label: '我的需求' },
  { key: 'inbound', label: '收到的意向' },
];

const FOLLOW_LABELS: Record<string, string> = {
  pending: '待跟进',
  contacted: '已联系',
  converted: '已转化',
  invalid: '无效',
};

const MEETUP_STATUS: Record<string, string> = {
  recruiting: '招募中',
  full: '已满员',
  ended: '已结束',
  cancelled: '已取消',
};

/** User → UserBrief：契约里 UserBrief.badges 必填、User.badges 可选，这里补齐 */
function asBrief(u: User): UserBrief {
  return { ...u, badges: u.badges ?? [] };
}

export default function ManufacturerConnect() {
  const user = useAppStore((s) => s.user);
  const router = useRouter();
  const queryClient = useQueryClient();
  /** 支持 ?tab=find|demand|inbound 深链（首页「待接需求」等入口可直接落到对应 Tab） */
  const [tab, setTab] = useState(String(router.params?.tab ?? 'find') || 'find');
  const isManufacturer = user?.role === 'manufacturer';

  /* 意向发送弹窗 */
  const [target, setTarget] = useState<User | null>(null);
  const [content, setContent] = useState('');
  const [productIndex, setProductIndex] = useState(0);
  const [sending, setSending] = useState(false);

  const owners = useQuery({ queryKey: ['demo-owners'], queryFn: () => api.auth.demoAccounts(), retry: 0, enabled: isManufacturer });
  const myProducts = useQuery({ queryKey: ['my-products'], queryFn: () => api.product.my({ page: 1, pageSize: 20 }), retry: 0, enabled: isManufacturer });
  const dashboard = useQuery({ queryKey: ['mfr-connect-dashboard'], queryFn: () => api.contact.dashboard(), retry: 0, enabled: isManufacturer });
  const meetups = useQuery({ queryKey: ['mfr-meetups'], queryFn: () => api.meetup.mine(), retry: 0, enabled: isManufacturer && tab === 'demand' });
  const conversations = useQuery({ queryKey: ['mfr-connect-conversations'], queryFn: () => api.message.conversations(), retry: 0, enabled: isManufacturer });

  const inbound = useInfiniteQuery({
    queryKey: ['mfr-inbound'],
    initialPageParam: 1,
    enabled: isManufacturer && tab === 'inbound',
    queryFn: ({ pageParam }) => api.contact.list({ page: Number(pageParam), pageSize: 10 }),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  useReachBottom(() => {
    if (tab === 'inbound' && inbound.hasNextPage && !inbound.isFetchingNextPage) inbound.fetchNextPage();
  });
  usePullDownRefresh(() => {
    Promise.all([owners.refetch(), myProducts.refetch(), dashboard.refetch(), conversations.refetch()]).finally(() => Taro.stopPullDownRefresh());
  });

  const ownerList: User[] = useMemo(() => (owners.data ?? []).filter((u) => u.role === 'shop_owner'), [owners.data]);
  const productList: Product[] = useMemo(() => myProducts.data?.list ?? [], [myProducts.data]);
  const products = myProducts.data;
  const meetupList: Meetup[] = useMemo(() => meetups.data?.list ?? [], [meetups.data]);
  const convList = conversations.data ?? [];
  const inboundList: ContactLog[] = useMemo(() => (inbound.data?.pages ?? []).flatMap((p) => p.list), [inbound.data]);
  const stats = (inbound.data?.pages?.[0] as { stats?: Record<string, number> } | undefined)?.stats;
  const quota = dashboard.data?.quota;

  /* -------------------------- 筛选（纯前端，数据源为演示账号） -------------------------- */
  const [filters, setFilters] = useState<Record<string, string | string[] | undefined>>({});
  const style = (filters.style as string) || '';
  const city = (filters.city as string) || '';
  const level = (filters.level as string) || '';

  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    ownerList.forEach((o) => (o.sourcingCities ?? []).forEach((c) => set.add(c)));
    return Array.from(set).map((c) => ({ value: c, label: c }));
  }, [ownerList]);

  const levelOptions = useMemo(() => {
    const set = new Set(ownerList.map((o) => o.memberLevel));
    return Array.from(set).map((lv) => ({ value: lv, label: planOf(lv).label }));
  }, [ownerList]);

  const filteredOwners = useMemo(
    () =>
      ownerList.filter((o) => {
        if (style && !(o.styleTags ?? []).includes(style as never)) return false;
        if (city && !(o.sourcingCities ?? []).includes(city)) return false;
        if (level && o.memberLevel !== level) return false;
        return true;
      }),
    [ownerList, style, city, level],
  );

  /* -------------------------- 发合作意向 -------------------------- */
  const myStyles = (user?.styleTags ?? []).slice(0, 2).join('、') || '女装';
  const openIntent = (owner: User) => {
    setTarget(owner);
    setProductIndex(0);
    setContent(
      `你好！我们是${user?.companyName ?? '源头厂家'}，主营${myStyles}，自有版房、起订 5 件可小批量，支持贴牌。` +
        `${owner.sourcingCities?.[0] ? `${owner.sourcingCities[0]}可发货，` : ''}发你最新款和拿货价，方便的话加个微信？`,
    );
  };

  const sendIntent = async () => {
    if (!target || !content.trim()) return toastError('请输入合作意向内容');
    if (sending) return;
    setSending(true);
    try {
      const res = await api.contact.send({
        shopOwnerId: target.id,
        content: content.trim(),
        productId: productIndex > 0 ? productList[productIndex - 1]?.id : undefined,
      });
      if (res.sent) {
        toastSuccess(`已发送，今日剩余 ${res.remainingQuota} 条`);
        setTarget(null);
        queryClient.invalidateQueries({ queryKey: ['mfr-inbound'] });
        dashboard.refetch();
      } else {
        toastError(res.reason || '发送失败：可能已达今日配额');
      }
    } catch (e) {
      toastError(errMsg(e, '发送失败'));
    } finally {
      setSending(false);
    }
  };

  const sendPrivate = async (owner?: { id?: number } | null) => {
    const receiverId = owner?.id;
    if (!receiverId) return toastError('缺少店主信息，无法发私信');
    try {
      await api.message.send({ receiverId, content: `你好，想和你对接${myStyles}的货源，方便聊聊吗？` });
      toast('已发送私信');
      Taro.navigateTo({ url: '/pages/interaction/message-center' });
    } catch (e) {
      toastError(errMsg(e, '私信发送失败'));
    }
  };

  if (!isManufacturer) {
    return (
      <View className="page-safe">
        <EmptyState icon="🤝" title="建联能力仅厂家端可用" desc="切换到厂家端后即可找店主、发合作意向" actionText="去「我的」切换视角" onAction={() => Taro.navigateTo({ url: '/pages/manufacturer/workbench' })} />
        <TabBar current="connect" />
      </View>
    );
  }

  return (
    <View className="page-safe connect">
      <View className="connect__head">
        <Text className="connect__title bold">建联</Text>
        <Text className="f-xs connect__sub">
          今日主动私信 {quota ? `${quota.used}/${quota.limit === -1 ? '不限' : quota.limit}` : '-'} · 转化率{' '}
          {stats ? `${stats.contactRate}%` : `${((dashboard.data?.contactRate ?? 0) * 100).toFixed(1)}%`}
        </Text>
      </View>

      <Tabs items={TABS} current={tab} onChange={setTab} />

      {/* ------------------------------ ① 找店主 ------------------------------ */}
      {tab === 'find' ? (
        <View>
          <FilterBar
            groups={[
              { key: 'style', label: '风格', options: STYLE_TAGS.map((t) => ({ value: t, label: t })) },
              { key: 'city', label: '城市', options: cityOptions },
              { key: 'level', label: '会员', options: levelOptions },
            ]}
            value={filters}
            onChange={(key, next) => setFilters((prev) => ({ ...prev, [key]: next }))}
          />

          <View className="connect__bar row-between">
            <Text className="f-xs t3">共 {filteredOwners.length} 位店主（演示账号画像）</Text>
            {style || city || level ? (
              <Text className="f-xs brand" onClick={() => setFilters({})}>
                清空筛选
              </Text>
            ) : null}
          </View>

          <ListEmpty
            loading={owners.isLoading}
            error={owners.isError ? errMsg(owners.error, '店主列表加载失败') : null}
            empty={!filteredOwners.length}
            emptyText="没有匹配的店主"
            emptyDesc="放宽筛选条件，或换个风格试试"
            onRetry={() => owners.refetch()}
          />

          {filteredOwners.map((o) => (
            <View key={o.id} className="connect__owner">
              <UserRow
                user={asBrief(o)}
                showFollow={false}
                desc={`${planOf(o.memberLevel).label} · ${(o.styleTags ?? []).join('、') || '风格待完善'}${
                  (o.sourcingCities ?? []).length ? ` · 拿货地 ${o.sourcingCities.join('、')}` : ''
                }`}
                extra={
                  <View className="row">
                    <View className="btn btn-plain btn-sm" onClick={() => sendPrivate(o)}>
                      <Text>私信</Text>
                    </View>
                    <View className="btn btn-primary btn-sm connect__intent-btn" onClick={() => openIntent(o)}>
                      <Text>发意向</Text>
                    </View>
                  </View>
                }
              />
            </View>
          ))}

          <Text className="f-xs t3 connect__note">
            提示：主动私信受版本配额限制（当前 {planOf(user?.memberLevel ?? 'manufacturer_free').label} · 每日{' '}
            {planOf(user?.memberLevel ?? 'manufacturer_free').dailyMessages === -1 ? '不限' : planOf(user?.memberLevel ?? 'manufacturer_free').dailyMessages} 条）。
          </Text>
        </View>
      ) : null}

      {/* ------------------------------ ② 我的需求 ------------------------------ */}
      {tab === 'demand' ? (
        <View>
          <Card title="我的合作邀约" subtitle="后端暂无独立「需求大厅」，用组局承载厂家的合作需求（一起做货 / 一起去拿货）" extraText="发布需求 ›" onExtra={() => Taro.navigateTo({ url: '/pages/meetup/create' })}>
            <Text className="f-xs t3">
              发布「一起做货」类型的组局，店主可报名；也可以在邀约里写明起订量、交期、打样政策。
            </Text>
          </Card>

          <ListEmpty
            loading={meetups.isLoading}
            error={meetups.isError ? errMsg(meetups.error, '我的需求加载失败') : null}
            empty={!meetupList.length}
            emptyText="还没有发布合作邀约"
            emptyDesc="点右上角「发布需求」，选「一起做货」写下你的产能与合作条件"
            onRetry={() => meetups.refetch()}
          />

          {meetupList.map((m) => (
            <Card key={m.id} onClick={() => Taro.navigateTo({ url: `/pages/meetup/detail?id=${m.id}` })}>
              <View className="row-between">
                <View className="row">
                  <View className="tag">
                    <Text>{MEETUP_KIND_LABELS[m.kind] ?? m.kind}</Text>
                  </View>
                  <Text className="f-xs t3 connect__meetup-status">{MEETUP_STATUS[m.status] ?? m.status}</Text>
                </View>
                <Text className="f-xs t3">{m.startAt?.slice(5, 16).replace('T', ' ')}</Text>
              </View>
              <Text className="connect__meetup-title bold t1">{m.title}</Text>
              <Text className="f-xs t3">
                📍{m.city} {m.venue}
              </Text>
              <View className="row-between connect__meetup-foot">
                <Text className="f-xs t3">
                  已报名 {m.joinedCount}
                  {m.capacity ? `/${m.capacity}` : '（不限）'}
                </Text>
                <Text className="f-xs brand">看详情 ›</Text>
              </View>
            </Card>
          ))}

          <Card title="我在供的货" subtitle={`${products?.total ?? productList.length} 个款 · 店主可在货源里搜到`} extraText="款管理 ›" onExtra={() => Taro.navigateTo({ url: '/pages/manufacturer/publish' })}>
            <Text className="f-xs t3">发邀约时选一款作为「一起做货」的对象，店主报名后可直接看款下单。</Text>
          </Card>
        </View>
      ) : null}

      {/* ------------------------------ ③ 收到的意向 ------------------------------ */}
      {tab === 'inbound' ? (
        <View>
          <View className="row connect__stat-row">
            <View className="connect__stat col-center">
              <Text className="connect__stat-value bold">{stats?.total ?? inboundList.length}</Text>
              <Text className="f-xs t3">加微总数</Text>
            </View>
            <View className="connect__stat col-center">
              <Text className="connect__stat-value bold accent">{stats?.pending ?? 0}</Text>
              <Text className="f-xs t3">待跟进</Text>
            </View>
            <View className="connect__stat col-center">
              <Text className="connect__stat-value bold">{stats?.converted ?? 0}</Text>
              <Text className="f-xs t3">已转化</Text>
            </View>
            <View className="connect__stat col-center">
              <Text className="connect__stat-value bold">{stats?.contactRate ?? 0}%</Text>
              <Text className="f-xs t3">转化率</Text>
            </View>
          </View>

          <Card title="谁加了我的微信" subtitle="按加微时间倒序，可直接回私信">
            <ListEmpty
              loading={inbound.isLoading}
              error={inbound.isError ? errMsg(inbound.error, '加微记录加载失败') : null}
              empty={false}
              onRetry={() => inbound.refetch()}
            />
            {inboundList.map((c) => (
              <View key={c.id} className="connect__inbound">
                <UserRow
                  user={
                    c.shopOwner ?? {
                      id: c.shopOwnerId,
                      nickname: `店主 #${c.shopOwnerId}`,
                      avatarUrl: '',
                      role: 'shop_owner',
                      certStatus: 'none',
                      memberLevel: 'free',
                      styleTags: [],
                      badges: [],
                    }
                  }
                  showFollow={false}
                  desc={c.productTitle ? `咨询款：${c.productTitle}` : '加微咨询'}
                  extra={
                    <View className="btn btn-primary btn-sm" onClick={() => sendPrivate(c.shopOwner ?? { id: c.shopOwnerId })}>
                      <Text>回私信</Text>
                    </View>
                  }
                />
                <View className="row-between connect__inbound-foot">
                  <Text className="f-xs t3">
                    {timeAgo(c.contactedAt)}加入 · 来源 {c.source}
                  </Text>
                  <View className={`tag ${c.followUpStatus === 'converted' ? 'tag-success' : c.followUpStatus === 'pending' ? 'tag-accent' : 'tag-gray'}`}>
                    <Text>{FOLLOW_LABELS[c.followUpStatus] ?? c.followUpStatus}</Text>
                  </View>
                </View>
              </View>
            ))}
            {inboundList.length ? (
              <LoadMore loading={inbound.isFetchingNextPage} hasMore={!!inbound.hasNextPage} count={inboundList.length} onLoadMore={() => inbound.fetchNextPage()} />
            ) : null}
          </Card>

          <Card title="谁私信我" subtitle={`${convList.length} 个会话`} extraText="消息中心 ›" onExtra={() => Taro.navigateTo({ url: '/pages/interaction/message-center' })}>
            {!convList.length ? <Text className="f-sm t3">暂无会话，用「找店主」发起的私信会出现在这里</Text> : null}
            {convList.slice(0, 5).map((c) => (
              <View key={c.id} className="connect__conv row-between" onClick={() => Taro.navigateTo({ url: `/pages/interaction/conversation?id=${c.id}` })}>
                <View className="col flex-1">
                  <Text className="f-sm t1 ellipsis">{c.peer?.nickname ?? '店主'}</Text>
                  <Text className="f-xs t3 ellipsis">{c.lastMessage || '开始聊聊合作'}</Text>
                </View>
                {c.unreadCount ? (
                  <View className="connect__conv-badge col-center">
                    <Text className="connect__conv-badge-text">{c.unreadCount > 99 ? '99+' : c.unreadCount}</Text>
                  </View>
                ) : (
                  <Text className="f-xs t3">{c.lastMessageAt ? timeAgo(c.lastMessageAt) : ''}</Text>
                )}
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      <TabBar current="connect" />

      {/* 发合作意向弹窗 */}
      <Modal visible={!!target} title={`给 ${target?.nickname ?? '店主'} 发合作意向`} confirmText={sending ? '发送中…' : '发送意向'} cancelText="取消" onCancel={() => setTarget(null)} onConfirm={sendIntent}>
        <View className="connect__form">
          <Text className="f-xs t3">
            走厂家主动私信通道（计入每日配额，今日剩余 {quota ? (quota.limit === -1 ? '不限' : Math.max(0, quota.limit - quota.used)) : '-'} 条）
          </Text>
          <Text className="field-label">带哪一款（可选）</Text>
          <Picker
            mode="selector"
            range={['不带款', ...productList.map((p) => p.title)]}
            value={productIndex}
            onChange={(e) => setProductIndex(Number(e.detail.value))}
          >
            <View className="field connect__picker row-between">
              <Text className="f-sm t1 ellipsis">{productIndex > 0 ? productList[productIndex - 1]?.title : '不带款'}</Text>
              <Text className="f-xs t3">选择 ›</Text>
            </View>
          </Picker>
          <Text className="field-label">意向内容</Text>
          <Textarea className="textarea connect__textarea" value={content} maxlength={500} onInput={(e) => setContent(e.detail.value)} />
          <Text className="f-xs t3">提示：内容不要留联系方式，店主同意后系统会给出你的微信号。</Text>
        </View>
      </Modal>
    </View>
  );
}
