import { View, Text } from '@tarojs/components';
import { clsx } from '@wfb/shared-utils';
import './index.scss';

interface Props {
  text?: string;
  /** 全屏遮罩加载（提交/发布中） */
  fullscreen?: boolean;
  className?: string;
}

/** 加载中：转圈 + 文案，跨端只用 View 实现动画 */
export default function Loading({ text = '加载中...', fullscreen, className }: Props) {
  return (
    <View className={clsx('loading-box', fullscreen && 'loading-box--full', className)}>
      <View className="loading-box__spinner" />
      <Text className="loading-box__text f-sm t3">{text}</Text>
    </View>
  );
}
