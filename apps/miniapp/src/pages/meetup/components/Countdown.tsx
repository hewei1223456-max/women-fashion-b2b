import { View, Text } from '@tarojs/components';
import type { Meetup } from '@wfb/shared-types';
import { clsx } from '@wfb/shared-utils';
import { countdownInfo, countdownParts, meetupDateTime } from '../meetup-utils';
import { useNow } from './useNow';
import './Countdown.scss';

interface Props {
  startAt?: string;
  endAt?: string;
  status?: Meetup['status'];
  /** inline：列表卡单行角标；block：详情页四宫格 */
  variant?: 'inline' | 'block';
  /** 列表卡 30s 一次足够，详情页用 1s */
  tickMs?: number;
  className?: string;
}

/**
 * 组局倒计时（闪动式细节）：
 *   未开始 → 「距开局 2 天 3 小时」（四宫格逐秒）
 *   进行中 → 「进行中 · 还剩 1 小时 20 分」
 *   已结束 → 「已结束」，已取消 → 「已取消」
 */
export default function Countdown({ startAt, endAt, status, variant = 'inline', tickMs = 1000, className }: Props) {
  const now = useNow(true, tickMs);
  const info = countdownInfo({ startAt, endAt, status: status ?? 'recruiting' }, now);
  const running = info.phase === 'upcoming' || info.phase === 'ongoing';
  const targetMs = info.targetAt ? new Date(info.targetAt).getTime() - now : 0;
  const parts = countdownParts(targetMs);

  if (variant === 'inline') {
    return (
      <View className={clsx('mt-count', `mt-count--${info.phase}`, className)}>
        <Text className="mt-count__inline">⏳ {info.text}</Text>
      </View>
    );
  }

  return (
    <View className={clsx('mt-count-block', `mt-count-block--${info.phase}`, className)}>
      <View className="mt-count-block__head row-between">
        <Text className="mt-count-block__label">
          {info.phase === 'upcoming' ? '距离开局' : info.phase === 'ongoing' ? '距离结束' : '活动状态'}
        </Text>
        <View className={clsx('mt-count-block__phase', `is-${info.phase}`)}>
          <Text className="mt-count-block__phase-text">{info.phase === 'upcoming' ? '报名中' : info.phase === 'ongoing' ? '进行中' : info.text}</Text>
        </View>
      </View>

      {running ? (
        <View className="mt-count-block__cells row">
          {[
            { value: parts.days, label: '天' },
            { value: parts.hours, label: '时' },
            { value: parts.minutes, label: '分' },
            { value: parts.seconds, label: '秒' },
          ].map((c) => (
            <View key={c.label} className="mt-count-block__cell col-center">
              <Text className="mt-count-block__num bold">{String(c.value).padStart(2, '0')}</Text>
              <Text className="mt-count-block__unit">{c.label}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className="mt-count-block__done">{info.text}</Text>
      )}

      <Text className="mt-count-block__time f-xs t3">
        集合 {meetupDateTime(startAt)}
        {endAt ? ` · 结束 ${meetupDateTime(endAt)}` : ''}
      </Text>
    </View>
  );
}
