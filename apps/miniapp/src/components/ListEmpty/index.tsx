import { View, Text } from '@tarojs/components';
import { clsx } from '@wfb/shared-utils';
import Loading from '../Loading';
import './index.scss';

interface Props {
  /** 请求中 */
  loading?: boolean;
  /** 错误信息，非空即展示错误态 + 重试 */
  error?: string | null;
  /** 列表为空（非 loading / error 时生效） */
  empty?: boolean;
  emptyIcon?: string;
  emptyText?: string;
  emptyDesc?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * 列表三态兜底：loading / error / empty 一次搞定。
 * 用法：<ListEmpty loading={isLoading} error={err} empty={!list.length} onRetry={refetch} />
 */
export default function ListEmpty({ loading, error, empty = true, emptyIcon = '📭', emptyText = '暂无内容', emptyDesc, onRetry, className }: Props) {
  if (loading) return <Loading className={className} />;
  if (error) {
    return (
      <View className={clsx('list-empty col-center', className)}>
        <Text className="list-empty__icon">⚠️</Text>
        <Text className="list-empty__text f-sm t2">{error}</Text>
        <View className="btn btn-ghost btn-sm list-empty__retry" onClick={onRetry}>
          <Text>重新加载</Text>
        </View>
      </View>
    );
  }
  if (!empty) return null;
  return (
    <View className={clsx('list-empty col-center', className)}>
      <Text className="list-empty__icon">{emptyIcon}</Text>
      <Text className="list-empty__text f-sm t3">{emptyText}</Text>
      {emptyDesc ? <Text className="list-empty__desc f-xs t3">{emptyDesc}</Text> : null}
    </View>
  );
}
