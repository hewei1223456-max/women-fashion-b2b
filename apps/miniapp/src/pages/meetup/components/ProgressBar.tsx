import { View, Text } from '@tarojs/components';
import { clsx } from '@wfb/shared-utils';
import type { Meetup } from '@wfb/shared-types';
import { seatHint } from '../meetup-utils';
import './ProgressBar.scss';

interface Props {
  joined?: number;
  capacity?: number;
  /** 是否展示「已报名 3/8 人 · 还剩 5 个名额」文案 */
  showText?: boolean;
  className?: string;
}

/** 报名进度条：已报名 X/N，满员变橙；不限人数时用弱化的满格条 */
export default function ProgressBar({ joined = 0, capacity = 0, showText = true, className }: Props) {
  const limited = capacity > 0;
  const percent = limited ? Math.min(100, Math.round((joined / capacity) * 100)) : 100;
  const full = limited && joined >= capacity;

  return (
    <View className={clsx('mt-progress', className)}>
      {showText ? (
        <View className="mt-progress__head row-between">
          <Text className="mt-progress__text f-xs t2">
            {limited ? `已报名 ${joined}/${capacity} 人` : `已报名 ${joined} 人`}
          </Text>
          <Text className={clsx('mt-progress__hint f-xs', full ? 'is-full' : 't3')}>
            {seatHint({ joinedCount: joined, capacity })}
          </Text>
        </View>
      ) : null}
      <View className="mt-progress__track">
        <View className={clsx('mt-progress__fill', full && 'is-full', !limited && 'is-unlimited')} style={{ width: `${percent}%` }} />
      </View>
    </View>
  );
}

/** 从 Meetup 直接渲染进度条 */
export function MeetupProgress({ meetup, showText = true, className }: { meetup: Pick<Meetup, 'joinedCount' | 'capacity'>; showText?: boolean; className?: string }) {
  return <ProgressBar joined={meetup.joinedCount ?? 0} capacity={meetup.capacity ?? 0} showText={showText} className={className} />;
}
