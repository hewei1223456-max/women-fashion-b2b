import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Meetup } from '@wfb/shared-types';
import { timeAgo } from '@wfb/shared-utils';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import Card from '@/components/Card';
import ListEmpty from '@/components/ListEmpty';
import { errMsg } from '@/components/utils';
import { kindLabel, meetupRange, meetupStatus, remainingSeats, seatText } from '../meetup-utils';
import './index.scss';

/* =========================================================================
 * 组局详情（参考「闪动」）
 *
 * 线下要素必须完整可见：活动形态 / 时间 / 地点 / 集合点 / 人数上限与已报名 /
 * 报名方式 / 报名条件 / 费用 / 拿货地 / 同行画像 / 发起人 / 已报名的人。
 * ========================================================================= */

interface FactRow {
  icon: string;
  label: string;
  value: string;
  highlight?: boolean;
}

export default function MeetupDetail() {
  const router = useRouter();
  const id = Number(router.params.id ?? 0);
  const queryClient = useQueryClient();
  const user = useAppStore((s) => s.user);

  const detail = useQuery({
    queryKey: ['meetup-detail', id],
    queryFn: () => api.meetup.detail(id),
    enabled: id > 0,
  });

  const act = useMutation({
    mutationFn: (kind: 'join' | 'quit') => (kind === 'join' ? api.meetup.join(id) : api.meetup.quit(id)),
    onSuccess: (_data: Meetup, kind) => {
      Taro.showToast({ title: kind === 'join' ? '报名成功' : '已取消报名', icon: 'success' });
      void queryClient.invalidateQueries({ queryKey: ['meetup-detail', id] });
      void queryClient.invalidateQueries({ queryKey: ['meetup-list'] });
      void queryClient.invalidateQueries({ queryKey: ['meetups-today'] });
    },
    onError: (e: Error, kind) => Taro.showToast({ title: errMsg(e, kind === 'join' ? '报名失败' : '取消失败'), icon: 'none' }),
  });

  const m = detail.data;

  if (!id) {
    return (
      <View className="page">
        <View className="empty">缺少组局 id，无法打开</View>
      </View>
    );
  }

  const status = m ? meetupStatus(m) : null;
  const full = !!m && (m.capacity > 0 ? m.joinedCount >= m.capacity : false) && !m.joined;
  const ended = status?.text === '已结束' || status?.text === '已取消';

  const onJoin = () => {
    if (!m) return;
    if (!user) {
      Taro.showToast({ title: '请先登录后再报名', icon: 'none' });
      Taro.navigateTo({ url: '/pages/auth/login' });
      return;
    }
    if (m.joined) {
      Taro.showModal({
        title: '取消报名',
        content: '确定取消这次组局报名吗？',
        success: (res) => {
          if (res.confirm) act.mutate('quit');
        },
      });
      return;
    }
    if (ended) {
      Taro.showToast({ title: '该组局已结束', icon: 'none' });
      return;
    }
    if (full) {
      Taro.showToast({ title: '名额已满，可联系发起人候补', icon: 'none' });
      return;
    }
    act.mutate('join');
  };

  const facts: FactRow[] = m
    ? [
        { icon: '🏷️', label: '活动形态', value: kindLabel(m.kind), highlight: true },
        { icon: '🕐', label: '活动时间', value: meetupRange(m.startAt, m.endAt), highlight: true },
        { icon: '📍', label: '活动地点', value: [m.city, m.venue].filter(Boolean).join(' · '), highlight: true },
        { icon: '🚩', label: '集合点', value: m.gatheringPoint, highlight: true },
        { icon: '⏰', label: '集合时间', value: m.startAt ? meetupRange(m.startAt, undefined) : '待定', highlight: true },
        { icon: '🙋', label: '人数', value: `${seatText(m)}${remainingSeats(m) ? ` · 还差 ${remainingSeats(m)} 人` : ''}` },
        { icon: '✍️', label: '报名方式', value: m.signupMethod, highlight: true },
        { icon: '✅', label: '报名条件', value: m.signupRequirement, highlight: true },
        { icon: '💰', label: '费用', value: m.fee || '免费 / AA' },
        ...(m.market ? [{ icon: '🧵', label: '拿货地', value: m.market }] : []),
        ...(m.targetAudience ? [{ icon: '👥', label: '期望同行', value: m.targetAudience }] : []),
        { icon: '📌', label: '状态', value: status?.text ?? '报名中' },
      ]
    : [];

  return (
    <View className="page mt-detail">
      {detail.isLoading ? <View className="loading">组局加载中…</View> : null}

      {detail.isError ? (
        <ListEmpty
          error={errMsg(detail.error, '组局加载失败（接口可能尚未上线）')}
          empty={false}
          onRetry={() => detail.refetch()}
        />
      ) : null}

      {m ? (
        <View>
          {m.coverUrl ? <Image className="mt-detail__cover" src={m.coverUrl} mode="aspectFill" /> : null}

          <Card>
            <View className="row wrap mt-detail__tags">
              <View className="tag mt-detail__kind">
                <Text>{kindLabel(m.kind)}</Text>
              </View>
              <View className={`tag ${status?.tone === 'accent' ? 'tag-accent' : status?.tone === 'gray' ? 'tag-gray' : ''}`}>
                <Text>{status?.text}</Text>
              </View>
              {m.styleTags?.map((t) => (
                <View key={t} className="tag tag-gray">
                  <Text>#{t}</Text>
                </View>
              ))}
            </View>

            <Text className="mt-detail__title bold">{m.title}</Text>

            <View className="row mt-detail__author">
              <Image className="mt-detail__avatar" src={m.initiator?.avatarUrl} mode="aspectFill" />
              <View className="col flex-1">
                <Text className="f-sm bold t1">{m.initiator?.nickname ?? '匿名同行'}</Text>
                <Text className="f-xs t3">
                  发起人 · {timeAgo(m.createdAt)}发起 · {m.initiator?.companyName ?? '女装同行'}
                </Text>
              </View>
              <View className="mt-detail__seats col-center">
                <Text className="mt-detail__seats-num bold">{m.joinedCount}</Text>
                <Text className="f-xs t3">{m.capacity > 0 ? `/ ${m.capacity} 人` : '人已报名'}</Text>
              </View>
            </View>
          </Card>

          {/* 线下要素清单（闪动式：时间、地点、集合点、报名方式、报名条件） */}
          <Card title="线下要素" subtitle="报名前请先确认时间、集合点与报名条件">
            <View className="mt-detail__facts">
              {facts.map((f) => (
                <View key={f.label} className="mt-detail__fact row">
                  <Text className="mt-detail__fact-icon">{f.icon}</Text>
                  <Text className="mt-detail__fact-label">{f.label}</Text>
                  <Text className={`mt-detail__fact-value flex-1 ${f.highlight ? 'is-strong' : ''}`}>{f.value}</Text>
                </View>
              ))}
            </View>
          </Card>

          {m.description ? (
            <Card title="组局说明">
              <Text className="mt-detail__desc">{m.description}</Text>
            </Card>
          ) : null}

          {/* 已报名的人 */}
          <Card title={`已报名 ${m.joinedCount} 人`} subtitle={m.capacity > 0 ? `上限 ${m.capacity} 人` : '不限人数'}>
            {m.attendees?.length ? (
              <ScrollView scrollX className="mt-detail__attendees">
                {m.attendees.map((a) => (
                  <View key={a.id} className="mt-detail__attendee col-center">
                    <Image className="mt-detail__attendee-avatar" src={a.avatarUrl} mode="aspectFill" />
                    <Text className="f-xs t3 ellipsis mt-detail__attendee-name">{a.nickname}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text className="f-xs t3">还没有人报名，你可以是第一个。</Text>
            )}
          </Card>

          {detail.data?.article ? (
            <Card title="关联资讯" onClick={() => Taro.navigateTo({ url: `/pages/info/detail?id=${detail.data?.article?.id}` })}>
              <Text className="f-sm t1 ellipsis">{detail.data.article.title}</Text>
              <Text className="f-xs t3 mt-xs">组局已同步发布到资讯流，点这里查看详情与评论 ›</Text>
            </Card>
          ) : null}
        </View>
      ) : null}

      {/* 底部报名条 */}
      {m ? (
        <View className="fixed-bottom mt-detail__bar">
          <View className="col flex-1">
            <Text className="f-xs t3">报名方式：{m.signupMethod}</Text>
            <Text className="f-xs t3 ellipsis">报名条件：{m.signupRequirement}</Text>
          </View>
          <View
            className={`btn ${m.joined ? 'btn-plain' : ended || full ? 'btn-disabled btn-plain' : 'btn-primary'} mt-detail__join`}
            onClick={onJoin}
          >
            <Text>{act.isPending ? '处理中…' : m.joined ? '取消报名' : full ? '名额已满' : ended ? '已结束' : '立即报名'}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
