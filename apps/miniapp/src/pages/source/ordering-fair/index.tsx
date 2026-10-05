import { useState } from 'react';
import { View, Text, Image, Input, Picker } from '@tarojs/components';
import Taro, { useReachBottom } from '@tarojs/taro';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderingFair, StyleTag } from '@wfb/shared-types';
import { STYLE_TAGS } from '@wfb/shared-types';
import { api } from '@/services/request';
import ChipSelect from '@/components/ChipSelect';
import ListEmpty from '@/components/ListEmpty';
import LoadMore from '@/components/LoadMore';
import Tag from '@/components/Tag';
import Modal from '@/components/Modal';
import FilterBar from '@/components/FilterBar';
import { hideLoading, showLoading, toastError, toastSuccess } from '@/components/Toast';
import { deadlineText, errMsg } from '@/components/utils';
import './index.scss';

const CITIES = ['杭州', '广州', '深圳', '上海', '成都', '郑州', '武汉'];

function dayOffset(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function OrderingFairSquare() {
  const queryClient = useQueryClient();
  const [city, setCity] = useState('');
  const [signingId, setSigningId] = useState(0);
  const [createVisible, setCreateVisible] = useState(false);
  /** 详情弹窗：点击卡片查看完整信息 + 报名 */
  const [detailId, setDetailId] = useState(0);

  // 发布订货会表单
  const [title, setTitle] = useState('');
  const [venue, setVenue] = useState('');
  const [hostCity, setHostCity] = useState('杭州');
  const [theme, setTheme] = useState('');
  const [signup, setSignup] = useState('');
  const [startAt, setStartAt] = useState(dayOffset(7));
  const [endAt, setEndAt] = useState(dayOffset(9));
  const [styleTag, setStyleTag] = useState<StyleTag>('韩系');

  const list = useInfiniteQuery({
    queryKey: ['fair-list', city],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.fair.list({ city: city || undefined, page: Number(pageParam), pageSize: 10 }),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  const fairs: OrderingFair[] = (list.data?.pages ?? []).flatMap((p) => p.list);

  const fairDetail = useQuery({ queryKey: ['fair-detail', detailId], queryFn: () => api.fair.detail(detailId), enabled: !!detailId });
  const current = fairDetail.data;

  useReachBottom(() => {
    if (list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage();
  });

  const signupFair = async (item: OrderingFair) => {
    setSigningId(item.id);
    try {
      await api.fair.signup(item.id);
      toastSuccess('报名成功');
      queryClient.invalidateQueries({ queryKey: ['fair-list'] });
    } catch (e) {
      toastError(errMsg(e, '报名失败'));
    } finally {
      setSigningId(0);
    }
  };

  const createFair = async () => {
    if (title.trim().length < 4) return toastError('请填写订货会名称');
    if (!venue.trim()) return toastError('请填写举办场地');
    showLoading('发布中...');
    try {
      await api.fair.create({
        title: title.trim(),
        city: hostCity,
        venue: venue.trim(),
        startAt: new Date(`${startAt}T09:00:00`).toISOString(),
        endAt: new Date(`${endAt}T18:00:00`).toISOString(),
        theme: theme.trim(),
        signup: signup.trim(),
        styleTags: [styleTag],
      });
      queryClient.invalidateQueries({ queryKey: ['fair-list'] });
      hideLoading();
      toastSuccess('订货会已发布');
      setCreateVisible(false);
      setTitle('');
      setVenue('');
      setTheme('');
      setSignup('');
    } catch (e) {
      hideLoading();
      toastError(errMsg(e, '发布失败（高级版及以上可发布）'));
    }
  };

  return (
    <View className="page">
      <FilterBar
        groups={[{ key: 'city', label: '城市', options: CITIES.map((c) => ({ value: c, label: c })) }]}
        value={{ city }}
        onChange={(_, next) => setCity((next as string) || '')}
      />

      <View className="fair__head row-between">
        <Text className="f-xs t3">线下订货会 · 报名后线下看款订货</Text>
        <Text className="f-xs brand" onClick={() => setCreateVisible(true)}>
          + 发布订货会
        </Text>
      </View>

      <ListEmpty
        loading={list.isLoading}
        error={list.isError ? errMsg(list.error, '订货会加载失败') : null}
        empty={!fairs.length}
        emptyText={city ? `${city}暂无订货会` : '暂无订货会'}
        emptyDesc="换个城市看看，或发布你自己的订货会"
        onRetry={() => list.refetch()}
      />

      {fairs.map((item) => (
        <View key={item.id} className="fair-card" onClick={() => setDetailId(item.id)}>
          <Image className="fair-card__cover" src={item.coverUrl} mode="aspectFill" />
          <View className="fair-card__body">
            <Text className="fair-card__title bold t1 ellipsis">{item.title}</Text>
            <View className="row wrap fair-card__tags">
              {item.styleTags?.slice(0, 3).map((t) => (
                <Tag key={t} styleTag={t} />
              ))}
              <View className="tag tag-gray">
                <Text>{deadlineText(item.startAt)}</Text>
              </View>
            </View>
            <Text className="fair-card__meta f-xs t3">
              {item.city} · {item.venue}
            </Text>
            <Text className="fair-card__meta f-xs t3">
              {item.startAt?.slice(0, 10)} ~ {item.endAt?.slice(0, 10)}
            </Text>
            {item.theme ? <Text className="fair-card__theme f-xs t2 ellipsis-2">主题：{item.theme}</Text> : null}
            <View className="row-between fair-card__foot">
              <Text className="f-xs t3">
                {item.signupCount} 人已报名 · 主办：{item.host?.nickname ?? '平台'}
              </Text>
              <View
                className={`btn btn-sm ${item.signedUp ? 'btn-plain' : 'btn-accent'} ${signingId === item.id ? 'btn-disabled' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (signingId) return;
                  signupFair(item);
                }}
              >
                <Text>{item.signedUp ? '已报名' : '报名参加'}</Text>
              </View>
            </View>
          </View>
        </View>
      ))}

      {fairs.length ? (
        <LoadMore loading={list.isFetchingNextPage} hasMore={!!list.hasNextPage} count={fairs.length} onLoadMore={() => list.fetchNextPage()} />
      ) : null}

      <Modal
        visible={!!detailId}
        title="订货会详情"
        showCancel={false}
        confirmText="关闭"
        onConfirm={() => setDetailId(0)}
        onCancel={() => setDetailId(0)}
      >
        {fairDetail.isLoading ? <Text className="f-sm t3">加载中...</Text> : null}
        {fairDetail.isError ? <Text className="f-sm t3">{errMsg(fairDetail.error, '详情加载失败')}</Text> : null}
        {current ? (
          <View className="fair__detail">
            <Text className="fair__detail-title bold t1">{current.title}</Text>
            <Text className="fair__detail-line f-sm t2">
              {current.city} · {current.venue}
            </Text>
            <Text className="fair__detail-line f-sm t2">
              {current.startAt?.slice(0, 10)} ~ {current.endAt?.slice(0, 10)}
            </Text>
            <Text className="fair__detail-line f-sm t2">主题：{current.theme || '—'}</Text>
            <Text className="fair__detail-line f-sm t2">报名方式：{current.signup || '现场报名'}</Text>
            <Text className="fair__detail-line f-xs t3">已有 {current.signupCount} 人报名 · 主办：{current.host?.nickname ?? '平台'}</Text>
            <View
              className={`btn btn-accent btn-block fair__detail-btn ${signingId === current.id ? 'btn-disabled' : ''}`}
              onClick={() => signupFair(current)}
            >
              <Text>{current.signedUp ? '已报名（点击取消报名）' : '报名参加'}</Text>
            </View>
          </View>
        ) : null}
      </Modal>

      <Modal
        visible={createVisible}
        title="发布订货会"
        showCancel
        confirmText="发布"
        cancelText="取消"
        onConfirm={createFair}
        onCancel={() => setCreateVisible(false)}
      >
        <View className="fair__form">
          <Text className="field-label">名称 *</Text>
          <Input className="input" value={title} placeholder="例如：2026 春夏新品订货会" onInput={(e) => setTitle(e.detail.value)} />
          <Text className="field-label">城市</Text>
          <ChipSelect options={CITIES.map((c) => ({ value: c, label: c }))} value={hostCity} onSelect={setHostCity} />
          <Text className="field-label">场地 *</Text>
          <Input className="input" value={venue} placeholder="例如：杭州四季青服装城 3F 展厅" onInput={(e) => setVenue(e.detail.value)} />
          <Text className="field-label">开始 / 结束日期</Text>
          <View className="row fair__dates">
            <Picker mode="date" value={startAt} onChange={(e) => setStartAt(String(e.detail.value))}>
              <View className="field flex-1">
                <Text className="f-sm t1">{startAt}</Text>
              </View>
            </Picker>
            <Text className="fair__date-sep f-xs t3">至</Text>
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
