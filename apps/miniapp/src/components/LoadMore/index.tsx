import { View, Text } from '@tarojs/components';
import { clsx } from '@wfb/shared-utils';
import './index.scss';

interface Props {
  loading?: boolean;
  /** 是否还有下一页 */
  hasMore?: boolean;
  error?: string | null;
  /** 已加载条数：为 0 且非 loading 时整块不渲染 */
  count?: number;
  onLoadMore: () => void;
  className?: string;
}

/**
 * 触底加载footer：
 * - 配合 ScrollView 的 onScrollToLower 调用 onLoadMore
 * - 也可点击「加载更多」手动触发（H5/小程序通用）
 */
export default function LoadMore({ loading, hasMore = true, error, count = 1, onLoadMore, className }: Props) {
  if (loading) {
    return (
      <View className={clsx('load-more row-center', className)}>
        <View className="load-more__dot" />
        <Text className="load-more__text f-xs t3">正在加载...</Text>
      </View>
    );
  }
  if (error && count > 0) {
    return (
      <View className={clsx('load-more row-center', className)}>
        <Text className="load-more__text f-xs t3" onClick={onLoadMore}>
          {error}，点击重试
        </Text>
      </View>
    );
  }
  if (!hasMore) {
    if (count <= 0) return null;
    return (
      <View className={clsx('load-more row-center', className)}>
        <View className="load-more__line" />
        <Text className="load-more__text f-xs t3">没有更多了</Text>
        <View className="load-more__line" />
      </View>
    );
  }
  return (
    <View className={clsx('load-more row-center', className)}>
      <Text className="load-more__text f-xs t3" onClick={onLoadMore}>
        上拉或点击加载更多
      </Text>
    </View>
  );
}
