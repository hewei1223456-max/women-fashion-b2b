import { View, Text } from '@tarojs/components';
import { clsx, formatPrice } from '@wfb/shared-utils';
import './index.scss';

interface Props {
  /** 价格带字符串，如 "120-180" */
  range?: string;
  /** 单个价格数字 */
  price?: number;
  /** 起订量后缀，如 "3件起" */
  suffix?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** 价格标签：统一 ¥ 前缀 + 分级字号 */
export default function PriceTag({ range, price, suffix, size = 'md', className }: Props) {
  const text = range !== undefined ? formatPrice(range) : price !== undefined ? formatPrice(String(price)) : '面议';
  return (
    <View className={clsx('price-tag row', `price-tag--${size}`, className)}>
      <Text className="price-tag__value bold">{text}</Text>
      {suffix ? <Text className="price-tag__suffix f-xs t3">{suffix}</Text> : null}
    </View>
  );
}
