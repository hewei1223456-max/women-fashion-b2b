import { View, Text } from '@tarojs/components';
import { clsx } from '@wfb/shared-utils';
import type { AgendaItem } from '../meetup-utils';
import './AgendaTimeline.scss';

interface Props {
  items: AgendaItem[];
  className?: string;
}

/**
 * 活动流程时间线（闪动式「行程安排」）：
 *   07:00 集合签到 → 07:30 进市场扫款 → 10:00 复盘选款 → 11:00 结束
 * 后端 agenda 缺失时由调用方决定不渲染本组件（这里也兜底：空数组返回 null）。
 */
export default function AgendaTimeline({ items, className }: Props) {
  if (!items.length) return null;

  return (
    <View className={clsx('mt-agenda', className)}>
      {items.map((item, idx) => (
        <View key={`${item.time}-${item.title}-${idx}`} className="mt-agenda__row row">
          <View className="mt-agenda__time col">
            <Text className="mt-agenda__time-text">{item.time || '—'}</Text>
          </View>

          <View className="mt-agenda__rail col-center">
            <View className={clsx('mt-agenda__dot', idx === 0 && 'is-first', idx === items.length - 1 && 'is-last')} />
            {idx < items.length - 1 ? <View className="mt-agenda__line" /> : null}
          </View>

          <View className="mt-agenda__body col flex-1">
            <Text className="mt-agenda__title">{item.title || '待定环节'}</Text>
            {item.desc ? <Text className="mt-agenda__desc f-xs t3">{item.desc}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}
