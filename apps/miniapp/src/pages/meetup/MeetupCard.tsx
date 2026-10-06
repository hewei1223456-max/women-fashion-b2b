import { View, Text, Image } from '@tarojs/components';
import type { Meetup } from '@wfb/shared-types';
import { clsx, timeAgo } from '@wfb/shared-utils';
import Badge from '@/components/Badge';
import { hexToRgba } from '@/components/utils';
import { kindColor, kindLabel, meetupRange, meetupStatus, seatText } from './meetup-utils';
import Countdown from './components/Countdown';
import ProgressBar from './components/ProgressBar';
import './MeetupCard.scss';

interface FactProps {
  icon: string;
  label: string;
  value: string;
  strong?: boolean;
}

/** 线下要素一行：图标 + 名称 + 值（时间/地点/集合点/报名方式/报名条件…） */
function Fact({ icon, label, value, strong }: FactProps) {
  return (
    <View className="meetup-card__fact row">
      <Text className="meetup-card__fact-icon">{icon}</Text>
      <Text className="meetup-card__fact-label">{label}</Text>
      <Text className={clsx('meetup-card__fact-value flex-1', strong && 'is-strong')}>{value || '—'}</Text>
    </View>
  );
}

interface Props {
  meetup: Meetup;
  onClick?: () => void;
  /** 是否展示完整线下要素（详情页留空，广场/首页列表展示全部） */
  showAllFacts?: boolean;
  /** 是否展示报名进度条（列表默认展示） */
  showProgress?: boolean;
  /** 是否展示倒计时角标 */
  showCountdown?: boolean;
  className?: string;
}

/**
 * 组局卡片：参考「闪动」的线下要素口径 ——
 * 活动形态（色标）/ 时间 / 地点 / 集合点 / 已报名（进度条 + 上限）/ 报名方式 / 报名条件 / 费用。
 * 首页横滑条、组局广场、我的组局共用同一张卡。
 */
export default function MeetupCard({ meetup, onClick, showAllFacts = true, showProgress = true, showCountdown = true, className }: Props) {
  const status = meetupStatus(meetup);
  const toneClass = status.tone === 'accent' ? 'tag-accent' : status.tone === 'gray' ? 'tag-gray' : '';
  const color = kindColor(meetup.kind);
  const kindStyle = { backgroundColor: hexToRgba(color, 0.12), color, borderColor: hexToRgba(color, 0.3) };

  return (
    <View className={clsx('meetup-card', className)} onClick={onClick}>
      <View className="meetup-card__head row-between">
        <View className="row">
          <View className="tag meetup-card__kind" style={kindStyle as never}>
            <Text>{kindLabel(meetup.kind)}</Text>
          </View>
          <View className={clsx('tag', toneClass)}>
            <Text>{status.text}</Text>
          </View>
        </View>
        {showCountdown ? <Countdown startAt={meetup.startAt} endAt={meetup.endAt} status={meetup.status} tickMs={30000} /> : null}
      </View>

      <Text className="meetup-card__title bold t1 ellipsis-2">{meetup.title}</Text>
      {meetup.description ? <Text className="meetup-card__desc f-xs t3 ellipsis-2">{meetup.description}</Text> : null}

      <View className="meetup-card__facts">
        <Fact icon="🕐" label="时间" value={meetupRange(meetup.startAt, meetup.endAt)} strong />
        <Fact icon="📍" label="地点" value={[meetup.city, meetup.venue].filter(Boolean).join(' · ')} strong />
        {showAllFacts ? (
          <View>
            <Fact icon="🚩" label="集合点" value={meetup.gatheringPoint} />
            <Fact icon="🙋" label="人数" value={seatText(meetup)} />
            <Fact icon="✍️" label="报名方式" value={meetup.signupMethod} />
            <Fact icon="✅" label="报名条件" value={meetup.signupRequirement} />
            <Fact icon="💰" label="费用" value={meetup.fee || '免费 / AA'} />
          </View>
        ) : (
          <View className="row wrap">
            <View className="tag tag-outline">
              <Text>{seatText(meetup)}</Text>
            </View>
            {meetup.gatheringPoint ? (
              <View className="tag tag-outline">
                <Text className="ellipsis meetup-card__inline">集合：{meetup.gatheringPoint}</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>

      {showProgress ? (
        <ProgressBar joined={meetup.joinedCount ?? 0} capacity={meetup.capacity ?? 0} className="meetup-card__progress" />
      ) : null}

      <View className="meetup-card__chips row wrap">
        {meetup.fee ? (
          <View className="meetup-card__chip">
            <Text className="meetup-card__chip-text">💰 {meetup.fee}</Text>
          </View>
        ) : (
          <View className="meetup-card__chip">
            <Text className="meetup-card__chip-text">💰 免费 / AA</Text>
          </View>
        )}
        {meetup.market ? (
          <View className="meetup-card__chip">
            <Text className="meetup-card__chip-text">🧵 {meetup.market}</Text>
          </View>
        ) : null}
        {meetup.targetAudience ? (
          <View className="meetup-card__chip">
            <Text className="meetup-card__chip-text ellipsis meetup-card__chip-ellipsis">👥 {meetup.targetAudience}</Text>
          </View>
        ) : null}
      </View>

      <View className="meetup-card__foot row-between">
        <View className="row flex-1 meetup-card__author">
          <Image className="meetup-card__avatar" src={meetup.initiator?.avatarUrl} mode="aspectFill" />
          <Text className="meetup-card__name f-xs t2 ellipsis">{meetup.initiator?.nickname ?? '匿名同行'}</Text>
          {meetup.initiator ? <Badge user={meetup.initiator} size="xs" max={2} /> : null}
          <Text className="meetup-card__ago f-xs t3">{timeAgo(meetup.createdAt)}发起</Text>
        </View>
        <Text className={clsx('meetup-card__cta', meetup.joined && 'is-joined')}>{meetup.joined ? '已报名 ›' : '去报名 ›'}</Text>
      </View>
    </View>
  );
}
