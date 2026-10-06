import { useMemo, useState } from 'react';
import { View, Text, Image, Textarea } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Meetup } from '@wfb/shared-types';
import { timeAgo } from '@wfb/shared-utils';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import ListEmpty from '@/components/ListEmpty';
import Modal from '@/components/Modal';
import ActionSheet from '@/components/ActionSheet';
import { toast, toastError, toastSuccess } from '@/components/Toast';
import { errMsg, hexToRgba } from '@/components/utils';
import Countdown from '../components/Countdown';
import AgendaTimeline from '../components/AgendaTimeline';
import AttendeeList from '../components/AttendeeList';
import {
  agendaOf,
  joinMeetupWithNote,
  kindColor,
  kindLabel,
  meetupRange,
  meetupShareUrl,
  meetupStatus,
  remainingSeats,
  requirementHint,
  seatText,
} from '../meetup-utils';
import './index.scss';

/* =========================================================================
 * 组局详情（参考「闪动」的活动细节）
 *
 * 一屏内要能回答：什么时候 / 在哪集合 / 还剩几个名额 / 谁组织的 / 当天怎么走 /
 * 谁已经报名了 / 报名要不要写点什么。因此自上而下：
 *   倒计时 → 发起人名片 → 线下要素（含查看位置）→ 活动流程 → 组局说明
 *   → 完整报名名单 → 关联资讯 → 底部（分享 / 收藏 / 报名）
 * ========================================================================= */

interface FactRow {
  icon: string;
  label: string;
  value: string;
  highlight?: boolean;
}

const SHARE_CHANNELS = [
  { key: 'wechat', label: '微信好友' },
  { key: 'moments', label: '朋友圈' },
  { key: 'group', label: '微信群' },
  { key: 'link', label: '复制链接' },
];

const NOTE_PRESETS = ['想跟着学选款', '我能提供工厂/档口资源', '想找同城长期搭子'];

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

  const m = detail.data;
  const articleId = detail.data?.article?.id;

  /* 发起人的其他局：接口暂无 initiatorId 参数，先取一页列表本地过滤（Demo 数据量很小） */
  const others = useQuery({
    queryKey: ['meetup-list', 'by-initiator'],
    queryFn: () => api.meetup.list({ page: 1, pageSize: 50 }),
    enabled: !!m?.initiatorId,
  });
  const otherMeetups = useMemo<Meetup[]>(
    () => (others.data?.list ?? []).filter((item) => item.initiatorId === m?.initiatorId && item.id !== id).slice(0, 3),
    [others.data, m?.initiatorId, id],
  );

  const [noteVisible, setNoteVisible] = useState(false);
  const [note, setNote] = useState('');
  const [shareVisible, setShareVisible] = useState(false);
  const [placeVisible, setPlaceVisible] = useState(false);
  const [collected, setCollected] = useState(false);

  const act = useMutation({
    mutationFn: (payload: { kind: 'join' | 'quit'; note?: string }) =>
      payload.kind === 'join' ? joinMeetupWithNote(id, payload.note) : api.meetup.quit(id),
    onSuccess: (_data: Meetup, payload) => {
      toastSuccess(payload.kind === 'join' ? (payload.note ? '报名成功，留言已带给发起人' : '报名成功') : '已取消报名');
      void queryClient.invalidateQueries({ queryKey: ['meetup-detail', id] });
      void queryClient.invalidateQueries({ queryKey: ['meetup-list'] });
      void queryClient.invalidateQueries({ queryKey: ['meetups-today'] });
    },
    onError: (e: Error, payload) => toastError(errMsg(e, payload.kind === 'join' ? '报名失败' : '取消失败')),
  });

  const agenda = useMemo(() => agendaOf(detail.data), [detail.data]);
  const hint = useMemo(
    () => (m ? requirementHint(m.signupRequirement, user?.certStatus, m.initiatorId === user?.id) : ''),
    [m, user?.certStatus, user?.id],
  );

  if (!id) {
    return (
      <View className="page">
        <View className="empty">缺少组局 id，无法打开</View>
        <View className="btn btn-primary btn-block mt-detail__retry" onClick={() => Taro.navigateTo({ url: '/pages/meetup/list' })}>
          <Text>去组局广场</Text>
        </View>
      </View>
    );
  }

  const status = m ? meetupStatus(m) : null;
  const full = !!m && (m.capacity > 0 ? m.joinedCount >= m.capacity : false) && !m.joined;
  const ended = status?.text === '已结束' || status?.text === '已取消';
  const isSelf = !!m && m.initiatorId === user?.id;

  /* ------------------------------ 报名 ------------------------------ */
  const openJoin = () => {
    if (!m) return;
    if (!user) {
      toast('请先登录后再报名');
      Taro.navigateTo({ url: '/pages/auth/login' });
      return;
    }
    if (m.joined) {
      Taro.showModal({
        title: '取消报名',
        content: '确定取消这次组局报名吗？',
        success: (res) => {
          if (res.confirm) act.mutate({ kind: 'quit' });
        },
      });
      return;
    }
    if (ended) {
      toast('该组局已结束');
      return;
    }
    if (full) {
      toast('名额已满，可联系发起人候补');
      return;
    }
    setNote('');
    setNoteVisible(true);
  };

  const confirmJoin = () => {
    setNoteVisible(false);
    act.mutate({ kind: 'join', note: note.trim() || undefined });
  };

  /* ------------------------------ 分享 / 收藏 / 位置 ------------------------------ */
  const onShare = async (channel: string) => {
    setShareVisible(false);
    if (channel === 'link') {
      try {
        await Taro.setClipboardData({ data: meetupShareUrl(id) });
        toastSuccess('链接已复制，可发给同行');
      } catch {
        toastError('复制失败，请手动复制');
      }
      return;
    }
    /* targetType 目前只支持 article/product/comment；组局若关联了资讯就记在资讯上，否则只做本地反馈 */
    if (articleId) {
      try {
        await api.interaction.share({ targetType: 'article', targetId: articleId, channel: channel as 'wechat' | 'moments' | 'group' | 'link' });
      } catch {
        /* Demo：分享渠道记录失败不打断体验 */
      }
    }
    toastSuccess('已记录转发渠道');
  };

  const toggleCollect = async () => {
    if (!m) return;
    if (!user) {
      toast('请先登录后再收藏');
      Taro.navigateTo({ url: '/pages/auth/login' });
      return;
    }
    if (!articleId) {
      toast('这场局还没有关联资讯，暂不支持收藏');
      return;
    }
    const next = !collected;
    setCollected(next);
    try {
      if (next) await api.interaction.collect({ targetType: 'article', targetId: articleId, folderName: '组局收藏' });
      else await api.interaction.uncollect({ targetType: 'article', targetId: articleId });
      toastSuccess(next ? '已收藏这场局' : '已取消收藏');
    } catch (e) {
      setCollected(!next);
      toastError(errMsg(e, '操作失败'));
    }
  };

  const copyAddress = async () => {
    if (!m) return;
    setPlaceVisible(false);
    try {
      await Taro.setClipboardData({ data: `${m.city} ${m.venue}｜集合点：${m.gatheringPoint}` });
      toastSuccess('地址已复制');
    } catch {
      toastError('复制失败');
    }
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

  const kindStyle = m ? { backgroundColor: hexToRgba(kindColor(m.kind), 0.12), color: kindColor(m.kind), borderColor: hexToRgba(kindColor(m.kind), 0.3) } : undefined;

  return (
    <View className="page mt-detail">
      {detail.isLoading ? <View className="loading">组局加载中…</View> : null}

      {detail.isError ? (
        <View>
          <ListEmpty error={errMsg(detail.error, '组局加载失败，请稍后重试')} empty={false} onRetry={() => detail.refetch()} />
          <View className="mt-detail__error-actions row">
            <View className="btn btn-plain flex-1" onClick={() => Taro.navigateTo({ url: '/pages/meetup/list' })}>
              <Text>返回组局广场</Text>
            </View>
            <View className="btn btn-primary flex-1 mt-detail__error-retry" onClick={() => detail.refetch()}>
              <Text>重新加载</Text>
            </View>
          </View>
        </View>
      ) : null}

      {m ? (
        <View>
          {m.coverUrl ? <Image className="mt-detail__cover" src={m.coverUrl} mode="aspectFill" /> : null}

          {/* 标题 + 状态 + 倒计时 */}
          <Card>
            <View className="row wrap mt-detail__tags">
              <View className="tag mt-detail__kind" style={kindStyle as never}>
                <Text>{kindLabel(m.kind)}</Text>
              </View>
              <View className={`tag ${status?.tone === 'accent' ? 'tag-accent' : status?.tone === 'gray' ? 'tag-gray' : ''}`}>
                <Text>{status?.text}</Text>
              </View>
              {m.joined ? (
                <View className="tag tag-success">
                  <Text>你已报名</Text>
                </View>
              ) : null}
              {isSelf ? (
                <View className="tag tag-outline">
                  <Text>我发起的</Text>
                </View>
              ) : null}
              {m.styleTags?.map((t) => (
                <View key={t} className="tag tag-gray">
                  <Text>#{t}</Text>
                </View>
              ))}
            </View>

            <Text className="mt-detail__title bold">{m.title}</Text>

            <Countdown className="mt-detail__countdown" startAt={m.startAt} endAt={m.endAt} status={m.status} variant="block" tickMs={1000} />
          </Card>

          {/* 发起人名片 + TA 组织的其他局 */}
          <Card title="发起人" subtitle="报名前先看看是谁组织的局">
            <View className="row mt-detail__author">
              <Image className="mt-detail__avatar" src={m.initiator?.avatarUrl} mode="aspectFill" />
              <View className="col flex-1">
                <View className="row mt-detail__author-name-row">
                  <Text className="f-md bold t1">{m.initiator?.nickname ?? '匿名同行'}</Text>
                  {m.initiator ? <Badge user={m.initiator} size="xs" max={3} /> : null}
                </View>
                <Text className="f-xs t3 mt-detail__author-meta">
                  {timeAgo(m.createdAt)}发起 · {m.initiator?.companyName ?? m.initiator?.city ?? '女装同行'}
                </Text>
              </View>
              <View className="mt-detail__seats col-center">
                <Text className="mt-detail__seats-num bold">{m.joinedCount}</Text>
                <Text className="f-xs t3">{m.capacity > 0 ? `/ ${m.capacity} 人` : '人已报名'}</Text>
              </View>
            </View>

            {m.initiator?.bio ? <Text className="mt-detail__author-bio f-xs t2">{m.initiator.bio}</Text> : null}

            {otherMeetups.length ? (
              <View className="mt-detail__others">
                <Text className="mt-detail__others-title f-xs t3">TA 组织的其他局（{otherMeetups.length}）</Text>
                {otherMeetups.map((item) => (
                  <View
                    key={item.id}
                    className="mt-detail__other row-between"
                    onClick={() => Taro.redirectTo({ url: `/pages/meetup/detail?id=${item.id}` })}
                  >
                    <View className="col flex-1">
                      <Text className="f-sm t1 ellipsis">{item.title}</Text>
                      <Text className="f-xs t3 ellipsis mt-detail__other-meta">
                        {meetupRange(item.startAt, item.endAt)} · {[item.city, item.venue].filter(Boolean).join(' ')}
                      </Text>
                    </View>
                    <Text className="f-xs brand">查看 ›</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>

          {/* 线下要素清单 */}
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
            <View className="row mt-detail__place-row">
              <View className="btn btn-plain btn-sm flex-1" onClick={() => setPlaceVisible(true)}>
                <Text>🗺️ 查看位置</Text>
              </View>
              <View className="btn btn-plain btn-sm flex-1 mt-detail__place-copy" onClick={copyAddress}>
                <Text>复制集合点</Text>
              </View>
            </View>
          </Card>

          {/* 活动流程时间线（后端 agenda 未下发时不渲染） */}
          {agenda.length ? (
            <Card title="活动流程" subtitle="当天怎么走，照着时间线集合就行">
              <AgendaTimeline items={agenda} />
            </Card>
          ) : null}

          {m.description ? (
            <Card title="组局说明">
              <Text className="mt-detail__desc">{m.description}</Text>
            </Card>
          ) : null}

          {/* 完整报名名单 */}
          <Card title={`报名名单（${m.joinedCount} 人）`} subtitle={m.capacity > 0 ? `上限 ${m.capacity} 人` : '不限人数'}>
            <AttendeeList
              attendees={m.attendees ?? []}
              joinedCount={m.joinedCount ?? 0}
              capacity={m.capacity ?? 0}
              initiatorId={m.initiatorId}
              notes={m.attendeeNotes}
            />
          </Card>

          {detail.data?.article ? (
            <Card title="关联资讯" onClick={() => Taro.navigateTo({ url: `/pages/info/detail?id=${detail.data?.article?.id}` })}>
              <Text className="f-sm t1 ellipsis">{detail.data.article.title}</Text>
              <Text className="f-xs t3 mt-xs">组局已同步发布到资讯流，点这里查看详情与评论 ›</Text>
            </Card>
          ) : null}

          {ended ? (
            <Card>
              <Text className="f-sm t2">
                {status?.text === '已取消' ? '这场组局已被发起人取消。' : '这场组局已经结束。'}
                可以去组局广场看看新的局，或自己发起一个。
              </Text>
              <View className="btn btn-primary btn-block mt-detail__retry" onClick={() => Taro.navigateTo({ url: '/pages/meetup/list' })}>
                <Text>去看看新的组局</Text>
              </View>
            </Card>
          ) : null}
        </View>
      ) : null}

      {/* 报名留言弹窗 */}
      <Modal
        visible={noteVisible}
        title="报名留言"
        confirmText={act.isPending ? '提交中…' : note.trim() ? '带上留言报名' : '确认报名'}
        cancelText="取消"
        maskClosable={false}
        onCancel={() => setNoteVisible(false)}
        onConfirm={confirmJoin}
      >
        <View className="col mt-detail__note">
          <Text className="f-xs t3">你想在这次局里得到什么 / 你能提供什么？发起人会看到这句话。</Text>
          <View className="row wrap mt-detail__note-presets">
            {NOTE_PRESETS.map((preset) => (
              <View
                key={preset}
                className="mt-detail__note-preset"
                onClick={() => setNote((prev) => (prev.includes(preset) ? prev : prev ? `${prev}；${preset}` : preset))}
              >
                <Text className="mt-detail__note-preset-text f-xs">{preset}</Text>
              </View>
            ))}
          </View>
          <Textarea
            className="textarea mt-detail__note-input"
            value={note}
            maxlength={120}
            placeholder="例如：做韩系通勤，想跟着学选款，能提供档口货源信息"
            onInput={(e) => setNote(e.detail.value)}
          />
          <Text className="f-xs t3 mt-detail__note-count">{note.length}/120</Text>
        </View>
      </Modal>

      {/* 分享渠道 */}
      <ActionSheet visible={shareVisible} title="转发这场组局" options={SHARE_CHANNELS} onSelect={onShare} onClose={() => setShareVisible(false)} />

      {/* 位置：Demo 不接地图 SDK，弹窗展示完整地址 + 一键复制 */}
      <Modal
        visible={placeVisible}
        title="集合位置"
        confirmText="复制地址"
        cancelText="关闭"
        onCancel={() => setPlaceVisible(false)}
        onConfirm={copyAddress}
      >
        <View className="col mt-detail__place">
          <Text className="f-sm t1">📍 {m?.venue || '地点待定'}</Text>
          <Text className="f-xs t2 mt-detail__place-line">城市：{m?.city || '—'}</Text>
          <Text className="f-xs t2 mt-detail__place-line">集合点：{m?.gatheringPoint || '—'}</Text>
          <Text className="f-xs t3 mt-detail__place-line">Demo 环境未接入地图 SDK，点击「复制地址」可发给同行或在导航 App 里搜索。</Text>
        </View>
      </Modal>

      {/* 底部操作条：分享 / 收藏 / 报名 */}
      {m ? (
        <View className="fixed-bottom mt-detail__bar">
          <View className="mt-detail__bar-icon col-center" onClick={() => setShareVisible(true)}>
            <Text className="mt-detail__bar-icon-text">↗️</Text>
            <Text className="f-xs t3">分享</Text>
          </View>
          <View className="mt-detail__bar-icon col-center" onClick={toggleCollect}>
            <Text className="mt-detail__bar-icon-text">{collected ? '⭐' : '☆'}</Text>
            <Text className="f-xs t3">{collected ? '已收藏' : '收藏'}</Text>
          </View>
          <View className="col flex-1 mt-detail__bar-info">
            {hint ? (
              <Text className="mt-detail__bar-warn f-xs ellipsis">⚠️ {hint}</Text>
            ) : (
              <Text className="f-xs t3 ellipsis">报名方式：{m.signupMethod}</Text>
            )}
            <Text className="f-xs t3 ellipsis">
              {m.joined ? '你已报名，可查看名单' : m.capacity > 0 ? `${seatText(m)} · 还剩 ${remainingSeats(m)} 个名额` : seatText(m)}
            </Text>
          </View>
          <View
            className={`btn ${m.joined ? 'btn-plain' : ended || full || isSelf ? 'btn-disabled btn-plain' : 'btn-primary'} mt-detail__join`}
            onClick={openJoin}
          >
            <Text>
              {act.isPending ? '处理中…' : isSelf ? '我发起的局' : m.joined ? '取消报名' : full ? '名额已满' : ended ? '已结束' : '立即报名'}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
