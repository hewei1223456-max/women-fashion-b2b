import { View, Text } from '@tarojs/components';
import { clsx } from '@wfb/shared-utils';
import { count } from '../utils';
import './index.scss';

interface Props {
  view?: number;
  like?: number;
  comment?: number;
  collect?: number;
  share?: number;
  /** 只展示指定项，默认展示 浏览/点赞/评论/收藏 */
  show?: Array<'view' | 'like' | 'comment' | 'collect' | 'share'>;
  className?: string;
}

const META: Record<string, { icon: string; label: string }> = {
  view: { icon: '👀', label: '浏览' },
  like: { icon: '❤️', label: '点赞' },
  comment: { icon: '💬', label: '评论' },
  collect: { icon: '⭐', label: '收藏' },
  share: { icon: '↗️', label: '转发' },
};

/** 互动数据横排：浏览 / 点赞 / 评论 / 收藏（可选分享） */
export default function StatBar({ view, like, comment, collect, share, show, className }: Props) {
  const keys = show ?? ['view', 'like', 'comment', 'collect'];
  const values: Record<string, number | undefined> = { view, like, comment, collect, share };
  return (
    <View className={clsx('stat-bar row', className)}>
      {keys.map((k) => (
        <View key={k} className="stat-bar__item row">
          <Text className="stat-bar__icon">{META[k].icon}</Text>
          <Text className="stat-bar__value f-xs t3">{count(values[k])}</Text>
        </View>
      ))}
    </View>
  );
}
