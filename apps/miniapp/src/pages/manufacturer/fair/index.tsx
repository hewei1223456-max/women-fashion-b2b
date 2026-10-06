import { useMemo, useState } from 'react';
import { View, Text, Image, Input, Picker } from '@tarojs/components';
import Taro, { usePullDownRefresh } from '@tarojs/taro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderingFair, StyleTag } from '@wfb/shared-types';
import { STYLE_TAGS, planOf } from '@wfb/shared-types';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import TabBar from '@/components/TabBar';
import Card from '@/components/Card';
import Modal from '@/components/Modal';
import ChipSelect from '@/components/ChipSelect';
import ListEmpty from '@/components/ListEmpty';
import EmptyState from '@/components/EmptyState';
import { hideLoading, showLoading, toastError, toastSuccess } from '@/components/Toast';
import { errMsg } from '@/components/utils';
import './index.scss';

/* =========================================================================
 * 厂家端 · 订货会（发布 + 管理 + 报名名单）
 *
 * 数据：api.fair.list（按 hostId 过滤出「我发布的」）+ api.fair.detail（报名名单）
 *      + api.fair.create（受版本权益 orderingFair 限制，前端先按 planOf 提示）
 * 说明：后端 /api/ordering-fair/mine 已存在但 shared-api 尚未声明，这里用 list 过滤，
 *      避免直接拼 URL；已在交付说明里列为「建议补进 client.ts」的接口。
 * ========================================================================= */

const CITIES = ['杭州', '广州', '深圳', '上海', '成都', '郑州', '武汉'];

/** 后端 detail 额外下发报名名单（契约 OrderingFair 里暂未声明） */
type FairDetailExtra = {
  status?: string;
  signupList?: { id: number; userId: number; nickname: string; avatarUrl: string; createdAt: string }[];
};

const FAIR_STATUS: Record<string, { text: string; cls: string }> = {
  upcoming: { text: '报名中', cls: 'tag-accent' },
  ongoing: { text: '进行中', cls: 'tag-success' },
  ended: { text: '已结束', cls: 'tag-gray' },
};

/**
 * 订货会状态：后端 list 会额外下发 status（契约未声明），
 * 缺失时按起止时间本地推断，保证展示稳定。
 */
function fairStatusOf(f: OrderingFair): string {
  const v = (f as unknown as { status?: string }).status;
  if (typeof v === 'string' && FAIR_STATUS[v]) return v;
  const now = Date.now();
  const start = new Date(f.startAt).getTime();
  const end = new Date(f.endAt).getTime();
  if (Number.isFinite(start) && now < start) return 'upcoming';
  if (Number.isFinite(end) && now > end) return 'ended';
  return 'ongoing';
}

function dayOffset(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function ManufacturerFair() {
  const user = useAppStore((s) => s.user);
  const queryClient = useQueryClient();
  const isManufacturer = user?.role === 'manufacturer';
  const plan = planOf(user?.memberLevel ?? 'manufacturer_free');

  const [createVisible, setCreateVisible] = useState(false);
  const [signupFairId, setSignupFairId] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  /* 发布表单 */
  const [title, setTitle] = useState('');
  const [city, setCity] = useState('杭州');
  const [venue, setVenue] = useState('');
  const [theme, setTheme] = useState('');
  const [signup, setSignup] = useState('加微信报名');
  const [startAt, setStartAt] = useState(dayOffset(7));
  const [endAt, setEndAt] = useState(dayOffset(9));
  const [styleTag, setStyleTag] = useState<StyleTag>('韩系');

  const fairs = useQuery({ queryKey: ['mfr-fairs-page'], queryFn: () => api.fair.list({ page: 1, pageSize: 50 }), retry: 0, enabled: isManufacturer });

  const detail = useQuery({
    queryKey: ['mfr-fair-detail', signupFairId],
    queryFn: () => api.fair.detail(signupFairId),
    retry: 0,
    enabled: !!signupFairId,
  });
  const detailExtra = detail.data as (OrderingFair & FairDetailExtra) | undefined;

  usePullDownRefresh(() => {
    fairs.refetch().finally(() => Taro.stopPullDownRefresh());
  });

  const myFairs = useMemo(() => (fairs.data?.list ?? []).filter((f) => f.hostId === user?.id), [fairs.data, user?.id]);
  const totalSignups = myFairs.reduce((n, f) => n + (f.signupCount ?? 0), 0);

  const createFair = async () => {
    if (title.trim().length < 4) return toastError('请填写订货会名称（至少 4 个字）');
    if (!venue.trim()) return toastError('请填写举办场地');
    if (!plan.orderingFair) return toastError(`${plan.label}不可发布订货会，升级高级版解锁`);
    showLoading('发布中...');
    setSubmitting(true);
    try {
      await api.fair.create({
        title: title.trim(),
        city,
        venue: venue.trim(),
        startAt: new Date(`${startAt}T09:00:00`).toISOString(),
        endAt: new Date(`${endAt}T18:00:00`).toISOString(),
        theme: theme.trim(),
        signup: signup.trim(),
        styleTags: [styleTag],
      });
      queryClient.invalidateQueries({ queryKey: ['mfr-fairs-page'] });
      queryClient.invalidateQueries({ queryKey: ['mfr-home-fairs'] });
      hideLoading();
      toastSuccess('订货会已发布');
      setCreateVisible(false);
      setTitle('');
      setVenue('');
      setTheme('');
    } catch (e) {
      hideLoading();
      toastError(errMsg(e, '发布失败'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isManufacturer) {
    return (
      <View className="page-safe">
        <EmptyState icon="🏬" title="订货会管理仅厂家端可用" desc="切换到厂家端后可发布与管理自己的订货会" actionText="去「我的」切换视角" onAction={() => Taro.navigateTo({ url: '/pages/manufacturer/workbench' })} />
        <TabBar current="fair" />
      </View>
    );
  }

  return (
    <View className="page-safe mfr-fair">
      {/* 权限 + 发布入口 */}
      <View className={`mfr-fair__head ${plan.orderingFair ? 'is-open' : 'is-locked'}`}>
        <View className="row-between">
          <View className="col flex-1">
            <Text className="mfr-fair__head-title bold">{plan.orderingFair ? '订货会权益已解锁' : '订货会为高级版权益'}</Text>
            <Text className="f-xs mfr-fair__head-sub">
              {plan.label} · {plan.orderingFair ? '可发布线下订货会，店主报名后线下看款对接' : '升级「高级版 ¥9800/年」即可发布订货会'}
            </Text>
          </View>
          <View
            className="mfr-fair__head-btn"
            onClick={() => (plan.orderingFair ? setCreateVisible(true) : Taro.navigateTo({ url: '/pages/manufacturer/workbench' }))}
          >
            <Text className="mfr-fair__head-btn-text">{plan.orderingFair ? '＋ 发布订货会' : '看版本权益'}</Text>
          </View>
        </View>
        <View className="row mfr-fair__head-stats">
          <Text className="f-xs mfr-fair__head-stat">已发布 {myFairs.length} 场</Text>
          <Text className="f-xs mfr-fair__head-stat">累计报名 {totalSignups} 人</Text>
          <Text className="f-xs mfr-fair__head-stat">进行中 {myFairs.filter((f) => fairStatusOf(f) !== 'ended').length} 场</Text>
        </View>
      </View>

      <Card title="我发布的订货会" subtitle="点「报名名单」查看已报名的店主">
        <ListEmpty
          loading={fairs.isLoading}
          error={fairs.isError ? errMsg(fairs.error, '订货会加载失败') : null}
          empty={!myFairs.length}
          emptyText="还没有发布过订货会"
          emptyDesc={plan.orderingFair ? '点上方「发布订货会」，把新品和产能一次性推给店主' : '升级高级版后可发布订货会'}
          onRetry={() => fairs.refetch()}
        />

        {myFairs.map((f) => {
          const st = FAIR_STATUS[fairStatusOf(f)] ?? FAIR_STATUS.upcoming;
          return (
            <View key={f.id} className="mfr-fair__card">
              <View className="row">
                {f.coverUrl ? <Image className="mfr-fair__cover" src={f.coverUrl} mode="aspectFill" /> : null}
                <View className="col flex-1">
                  <View className="row-between">
                    <Text className="mfr-fair__title bold t1 ellipsis">{f.title}</Text>
                    <View className={`tag ${st.cls}`}>
                      <Text>{st.text}</Text>
                    </View>
                  </View>
                  <Text className="f-xs t3 mfr-fair__line">
                    📍{f.city} · {f.venue}
                  </Text>
                  <Text className="f-xs t3 mfr-fair__line">
                    {f.startAt?.slice(0, 10)} ~ {f.endAt?.slice(0, 10)}
                  </Text>
                  <Text className="f-xs t3 mfr-fair__line ellipsis">报名方式：{f.signup || '现场报名'}</Text>
                </View>
              </View>

              <View className="row-between mfr-fair__foot">
                <Text className="f-sm accent bold">报名 {f.signupCount ?? 0} 人</Text>
                <View className="row">
                  <View className="btn btn-plain btn-sm" onClick={() => Taro.navigateTo({ url: `/pages/source/ordering-fair` })}>
                    <Text>前台预览</Text>
                  </View>
                  <View className="btn btn-primary btn-sm mfr-fair__signup-btn" onClick={() => setSignupFairId(f.id)}>
                    <Text>报名名单</Text>
                  </View>
                </View>
              </View>
            </View>
          );
        })}
      </Card>

      <Text className="f-xs t3 mfr-fair__note">提示：订货会展示在店主端「订货会专区」（tab「资讯」→ 订货会入口），店主报名后会出现在上面的名单里。</Text>

      <TabBar current="fair" />

      {/* 报名名单 */}
      <Modal
        visible={!!signupFairId}
        title={detail.data?.title ? `报名名单 · ${detail.data.title}` : '报名名单'}
        showCancel={false}
        confirmText="关闭"
        onConfirm={() => setSignupFairId(0)}
        onCancel={() => setSignupFairId(0)}
      >
        <View className="mfr-fair__signup-list">
          {detail.isLoading ? <Text className="f-sm t3">加载中...</Text> : null}
          {detail.isError ? <Text className="f-sm t3">{errMsg(detail.error, '名单加载失败')}</Text> : null}
          {detailExtra && !(detailExtra.signupList ?? []).length ? (
            <Text className="f-sm t3">还没有店主报名，把订货会分享到群里试试</Text>
          ) : null}
          {(detailExtra?.signupList ?? []).map((s) => (
            <View key={s.id} className="mfr-fair__signup-row row">
              <Image className="mfr-fair__signup-avatar" src={s.avatarUrl} mode="aspectFill" />
              <View className="col flex-1">
                <Text className="f-sm t1">{s.nickname}</Text>
                <Text className="f-xs t3">{s.createdAt?.slice(0, 16).replace('T', ' ')} 报名</Text>
              </View>
              <View className="btn btn-plain btn-sm" onClick={() => Taro.navigateTo({ url: '/pages/interaction/message-center' })}>
                <Text>私信</Text>
              </View>
            </View>
          ))}
        </View>
      </Modal>

      {/* 发布订货会 */}
      <Modal
        visible={createVisible}
        title="发布订货会"
        confirmText={submitting ? '发布中…' : '发布'}
        cancelText="取消"
        onConfirm={createFair}
        onCancel={() => setCreateVisible(false)}
      >
        <View className="mfr-fair__form">
          <Text className="field-label">名称 *</Text>
          <Input className="input" value={title} placeholder="例如：2026 春夏新品订货会" onInput={(e) => setTitle(e.detail.value)} />
          <Text className="field-label">城市</Text>
          <ChipSelect options={CITIES.map((c) => ({ value: c, label: c }))} value={city} onSelect={setCity} />
          <Text className="field-label">场地 *</Text>
          <Input className="input" value={venue} placeholder="例如：杭州四季青服装城 3F 展厅" onInput={(e) => setVenue(e.detail.value)} />
          <Text className="field-label">起止日期</Text>
          <View className="row mfr-fair__dates">
            <Picker mode="date" value={startAt} onChange={(e) => setStartAt(String(e.detail.value))}>
              <View className="field flex-1">
                <Text className="f-sm t1">{startAt}</Text>
              </View>
            </Picker>
            <Text className="f-xs t3 mfr-fair__date-sep">至</Text>
            <Picker mode="date" value={endAt} onChange={(e) => setEndAt(String(e.detail.value))}>
              <View className="field flex-1">
                <Text className="f-sm t1">{endAt}</Text>
              </View>
            </Picker>
          </View>
          <Text className="field-label">主题</Text>
          <Input className="input" value={theme} placeholder="例如：法式轻奢专场" onInput={(e) => setTheme(e.detail.value)} />
          <Text className="field-label">报名方式</Text>
          <Input className="input" value={signup} placeholder="留微信号 / 扫码进群" onInput={(e) => setSignup(e.detail.value)} />
          <Text className="field-label">主风格</Text>
          <ChipSelect options={STYLE_TAGS.map((t) => ({ value: t, label: t }))} value={styleTag} onSelect={(v) => setStyleTag(v as StyleTag)} />
        </View>
      </Modal>
    </View>
  );
}
