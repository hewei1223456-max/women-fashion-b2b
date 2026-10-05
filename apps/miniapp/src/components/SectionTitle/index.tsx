import { View, Text } from '@tarojs/components';
import { clsx } from '@wfb/shared-utils';
import './index.scss';

interface Props {
  title: string;
  subtitle?: string;
  /** 右侧动作文案，如「查看全部」 */
  extraText?: string;
  onExtra?: () => void;
  className?: string;
}

/** 分区标题：左侧竖色条 + 标题 + 可选右侧动作 */
export default function SectionTitle({ title, subtitle, extraText, onExtra, className }: Props) {
  return (
    <View className={clsx('section-title row-between', className)}>
      <View className="row flex-1">
        <View className="section-title__bar" />
        <Text className="section-title__text bold t1">{title}</Text>
        {subtitle ? <Text className="section-title__sub f-xs t3">{subtitle}</Text> : null}
      </View>
      {extraText ? (
        <Text className="section-title__extra f-sm t3" onClick={onExtra}>
          {extraText}
        </Text>
      ) : null}
    </View>
  );
}
