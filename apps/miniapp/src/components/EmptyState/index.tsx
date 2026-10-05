import { View, Text } from '@tarojs/components';
import { clsx } from '@wfb/shared-utils';
import './index.scss';

interface Props {
  /** 图标（emoji，避免引入图片资源） */
  icon?: string;
  title?: string;
  desc?: string;
  /** 主按钮文案；不传则不显示 */
  actionText?: string;
  onAction?: () => void;
  /** 次要按钮文案 */
  secondaryText?: string;
  onSecondary?: () => void;
  className?: string;
}

/** 通用空态 / 兜底态（列表为空、无权限、搜索无结果） */
export default function EmptyState({
  icon = '🗂️',
  title = '暂无数据',
  desc,
  actionText,
  onAction,
  secondaryText,
  onSecondary,
  className,
}: Props) {
  return (
    <View className={clsx('empty-state col-center', className)}>
      <Text className="empty-state__icon">{icon}</Text>
      <Text className="empty-state__title f-md t2">{title}</Text>
      {desc ? <Text className="empty-state__desc f-sm t3">{desc}</Text> : null}
      {actionText || secondaryText ? (
        <View className="empty-state__actions row-center">
          {actionText ? (
            <View className="btn btn-primary btn-sm" onClick={onAction}>
              <Text>{actionText}</Text>
            </View>
          ) : null}
          {secondaryText ? (
            <View className="btn btn-plain btn-sm empty-state__secondary" onClick={onSecondary}>
              <Text>{secondaryText}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
