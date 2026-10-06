import { useState } from 'react';
import { View, Text, Input, Textarea, Picker, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateMeetupDto, Meetup, MeetupKind } from '@wfb/shared-types';
import { MEETUP_KINDS, MEETUP_KIND_LABELS } from '@wfb/shared-types';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import Card from '@/components/Card';
import { errMsg } from '@/components/utils';
import { MEETUP_CITIES, MEETUP_MARKETS } from '../meetup-utils';
import './index.scss';

/* =========================================================================
 * 发起组局（参考「闪动」的发布口径）
 *
 * 必填线下要素：活动形态 / 标题 / 城市 / 活动地点 / 集合点 /
 *              开始与结束时间 / 报名方式 / 报名条件 / 人数上限（0=不限）
 * 可选：费用 / 拿货地 / 期望同行的人 / 说明
 * 发布后默认同步发一条资讯流内容（contentType=meetup），让组局能被首页推荐到。
 * ========================================================================= */

const DAY = 86_400_000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timeStr(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const SIGNUP_METHOD_PRESETS = ['站内报名，通过后拉群', '加微信报名（评论区留微信号）', '现场集合点直接签到'];
const SIGNUP_REQUIREMENT_PRESETS = ['认证店主，有实体店', '不限身份，同行即可', '需自带样品/新款', '限同城，能准时到集合点'];

export default function MeetupCreate() {
  const queryClient = useQueryClient();
  const user = useAppStore((s) => s.user);

  const start = new Date(Date.now() + DAY);
  start.setHours(9, 30, 0, 0);
  const end = new Date(Date.now() + DAY);
  end.setHours(18, 0, 0, 0);

  const [kind, setKind] = useState<MeetupKind>('sourcing');
  const [title, setTitle] = useState('');
  const [city, setCity] = useState(user?.sourcingCities?.[0] ?? '广州');
  const [venue, setVenue] = useState('');
  const [gatheringPoint, setGatheringPoint] = useState('');
  const [startDate, setStartDate] = useState(dateStr(start));
  const [startTime, setStartTime] = useState(timeStr(start));
  const [endDate, setEndDate] = useState(dateStr(end));
  const [endTime, setEndTime] = useState(timeStr(end));
  const [signupMethod, setSignupMethod] = useState(SIGNUP_METHOD_PRESETS[0]);
  const [signupRequirement, setSignupRequirement] = useState(SIGNUP_REQUIREMENT_PRESETS[0]);
  const [capacity, setCapacity] = useState('8');
  const [fee, setFee] = useState('');
  const [market, setMarket] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [description, setDescription] = useState('');
  const [publishToFeed, setPublishToFeed] = useState(true);

  const create = useMutation({
    mutationFn: (dto: CreateMeetupDto) => api.meetup.create(dto),
    onSuccess: (data: Meetup) => {
      Taro.showToast({ title: '组局已发布', icon: 'success' });
      void queryClient.invalidateQueries({ queryKey: ['meetup-list'] });
      void queryClient.invalidateQueries({ queryKey: ['meetups-today'] });
      void queryClient.invalidateQueries({ queryKey: ['info-feed'] });
      Taro.redirectTo({ url: `/pages/meetup/detail?id=${data.id}` }).catch(() => {
        Taro.navigateTo({ url: '/pages/meetup/list' });
      });
    },
    onError: (e: Error) => Taro.showToast({ title: errMsg(e, '发布失败，请稍后重试'), icon: 'none' }),
  });

  const submit = () => {
    if (!user) {
      Taro.showToast({ title: '请先登录后再发起组局', icon: 'none' });
      Taro.navigateTo({ url: '/pages/auth/login' });
      return;
    }
    if (!title.trim()) return Taro.showToast({ title: '请填写组局标题', icon: 'none' });
    if (!city.trim()) return Taro.showToast({ title: '请选择活动城市', icon: 'none' });
    if (!venue.trim()) return Taro.showToast({ title: '请填写活动地点', icon: 'none' });
    if (!gatheringPoint.trim()) return Taro.showToast({ title: '请填写集合点（细化到档口/门口）', icon: 'none' });
    if (!signupMethod.trim()) return Taro.showToast({ title: '请填写报名方式', icon: 'none' });
    if (!signupRequirement.trim()) return Taro.showToast({ title: '请填写报名条件', icon: 'none' });

    const startAt = new Date(`${startDate}T${startTime}:00`);
    const endAt = new Date(`${endDate}T${endTime}:00`);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return Taro.showToast({ title: '时间格式不正确', icon: 'none' });
    }
    if (endAt.getTime() <= startAt.getTime()) {
      return Taro.showToast({ title: '结束时间需晚于开始时间', icon: 'none' });
    }

    const cap = Number(capacity || 0);
    create.mutate({
      kind,
      title: title.trim(),
      description: description.trim(),
      city: city.trim(),
      venue: venue.trim(),
      gatheringPoint: gatheringPoint.trim(),
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      signupMethod: signupMethod.trim(),
      signupRequirement: signupRequirement.trim(),
      capacity: Number.isNaN(cap) || cap < 0 ? 0 : cap,
      fee: fee.trim() || undefined,
      market: market || undefined,
      targetAudience: targetAudience.trim() || undefined,
      publishToFeed,
    });
    return undefined;
  };

  return (
    <View className="page mt-create">
      <Card title="活动形态" subtitle="决定这场局解决什么问题">
        <View className="row wrap mt-create__chips">
          {MEETUP_KINDS.map((k) => (
            <View key={k} className={`mt-create__chip ${k === kind ? 'is-active' : ''}`} onClick={() => setKind(k)}>
              <Text className="mt-create__chip-text">{MEETUP_KIND_LABELS[k]}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card title="基本信息">
        <View className="field">
          <Text className="field-label">标题（必填）</Text>
          <Input className="input" value={title} placeholder="例如：十三行一起拿货，早市扫款" maxlength={40} onInput={(e) => setTitle(e.detail.value)} />
        </View>

        <View className="field">
          <Text className="field-label">活动城市（必填）</Text>
          <Picker mode="selector" range={MEETUP_CITIES} value={Math.max(0, MEETUP_CITIES.indexOf(city))} onChange={(e) => setCity(MEETUP_CITIES[Number(e.detail.value)] ?? city)}>
            <View className="mt-create__pick row-between">
              <Text className="f-md t1">{city || '请选择城市'}</Text>
              <Text className="f-sm t3">›</Text>
            </View>
          </Picker>
        </View>

        <View className="field">
          <Text className="field-label">活动地点（市场 / 园区 / 门店，必填）</Text>
          <Input className="input" value={venue} placeholder="例如：十三行新中国大厦 6 楼" maxlength={60} onInput={(e) => setVenue(e.detail.value)} />
        </View>

        <View className="field">
          <Text className="field-label">集合点（细化到具体位置，必填）</Text>
          <Input
            className="input"
            value={gatheringPoint}
            placeholder="例如：十三行 6 楼 B12 档口门口"
            maxlength={60}
            onInput={(e) => setGatheringPoint(e.detail.value)}
          />
        </View>
      </Card>

      <Card title="时间" subtitle="集合时间 = 开始时间，结束时间用于同行者安排行程">
        <View className="field">
          <Text className="field-label">开始（集合）时间</Text>
          <View className="row">
            <Picker mode="date" value={startDate} onChange={(e) => setStartDate(String(e.detail.value))}>
              <View className="mt-create__pick mt-create__pick--half row-between">
                <Text className="f-md t1">{startDate}</Text>
              </View>
            </Picker>
            <Picker mode="time" value={startTime} onChange={(e) => setStartTime(String(e.detail.value))}>
              <View className="mt-create__pick mt-create__pick--half row-between">
                <Text className="f-md t1">{startTime}</Text>
              </View>
            </Picker>
          </View>
        </View>
        <View className="field">
          <Text className="field-label">结束时间</Text>
          <View className="row">
            <Picker mode="date" value={endDate} start={startDate} onChange={(e) => setEndDate(String(e.detail.value))}>
              <View className="mt-create__pick mt-create__pick--half row-between">
                <Text className="f-md t1">{endDate}</Text>
              </View>
            </Picker>
            <Picker mode="time" value={endTime} onChange={(e) => setEndTime(String(e.detail.value))}>
              <View className="mt-create__pick mt-create__pick--half row-between">
                <Text className="f-md t1">{endTime}</Text>
              </View>
            </Picker>
          </View>
        </View>
      </Card>

      <Card title="报名设置" subtitle="报名方式与报名条件会直接展示给同行者">
        <View className="field">
          <Text className="field-label">报名方式（必填）</Text>
          <ScrollView scrollX className="mt-create__presets">
            <View className="row">
              {SIGNUP_METHOD_PRESETS.map((p) => (
                <View key={p} className={`mt-create__preset ${p === signupMethod ? 'is-active' : ''}`} onClick={() => setSignupMethod(p)}>
                  <Text className="mt-create__preset-text">{p}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
          <Input className="input" value={signupMethod} placeholder="也可以自己写报名方式" maxlength={60} onInput={(e) => setSignupMethod(e.detail.value)} />
        </View>

        <View className="field">
          <Text className="field-label">报名条件（必填）</Text>
          <ScrollView scrollX className="mt-create__presets">
            <View className="row">
              {SIGNUP_REQUIREMENT_PRESETS.map((p) => (
                <View key={p} className={`mt-create__preset ${p === signupRequirement ? 'is-active' : ''}`} onClick={() => setSignupRequirement(p)}>
                  <Text className="mt-create__preset-text">{p}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
          <Input
            className="input"
            value={signupRequirement}
            placeholder="也可以自己写报名条件"
            maxlength={60}
            onInput={(e) => setSignupRequirement(e.detail.value)}
          />
        </View>

        <View className="field">
          <Text className="field-label">人数上限（0 或不填 = 不限）</Text>
          <Input className="input" type="number" value={capacity} placeholder="例如 8" onInput={(e) => setCapacity(e.detail.value)} />
        </View>

        <View className="field">
          <Text className="field-label">费用说明（可选）</Text>
          <Input className="input" value={fee} placeholder="例如：AA 制，交通自理" maxlength={40} onInput={(e) => setFee(e.detail.value)} />
        </View>
      </Card>

      <Card title="补充信息（可选）">
        <View className="field">
          <Text className="field-label">拿货地 / 产业带</Text>
          <Picker mode="selector" range={['不指定', ...MEETUP_MARKETS]} value={market ? MEETUP_MARKETS.indexOf(market) + 1 : 0} onChange={(e) => {
            const idx = Number(e.detail.value);
            setMarket(idx === 0 ? '' : (MEETUP_MARKETS[idx - 1] ?? ''));
          }}>
            <View className="mt-create__pick row-between">
              <Text className="f-md t1">{market || '不指定'}</Text>
              <Text className="f-sm t3">›</Text>
            </View>
          </Picker>
        </View>

        <View className="field">
          <Text className="field-label">期望同行的人</Text>
          <Input
            className="input"
            value={targetAudience}
            placeholder="例如：做韩系通勤的店主，3-5 家"
            maxlength={40}
            onInput={(e) => setTargetAudience(e.detail.value)}
          />
        </View>

        <View className="field">
          <Text className="field-label">组局说明</Text>
          <Textarea
            className="textarea"
            value={description}
            placeholder="行程安排、逛哪些档口、怎么分摊费用…"
            maxlength={500}
            onInput={(e) => setDescription(e.detail.value)}
          />
        </View>

        <View className="mt-create__switch row-between" onClick={() => setPublishToFeed(!publishToFeed)}>
          <View className="col flex-1">
            <Text className="f-sm t1">同时发一条资讯流</Text>
            <Text className="f-xs t3">发布后组局会出现在资讯首页「组局」Tab，可被同行报名</Text>
          </View>
          <View className={`mt-create__toggle ${publishToFeed ? 'is-on' : ''}`}>
            <Text className="mt-create__toggle-text">{publishToFeed ? '已开启' : '已关闭'}</Text>
          </View>
        </View>
      </Card>

      <View className={`btn btn-primary btn-block mt-create__submit ${create.isPending ? 'btn-disabled' : ''}`} onClick={submit}>
        <Text>{create.isPending ? '发布中…' : '发布组局'}</Text>
      </View>
      <Text className="f-xs t3 mt-create__tip">发布即表示同意平台内容规范，组局为线下自发活动，请自行核实行程与安全。</Text>
    </View>
  );
}
