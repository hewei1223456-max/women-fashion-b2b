import { View, Text } from '@tarojs/components';
import { clsx } from '@wfb/shared-utils';
import { hexToRgba } from '../utils';
import './index.scss';

interface Props {
  /** 今日已用次数 */
  used: number;
  /** 每日免费额度，-1 = 不限，0 = 仅会员 */
  limit: number;
  /** 工具名，用于文案 */
  label?: string;
  loading?: boolean;
  /** 点击「开通会员」 */
  onUpgrade?: () => void;
  className?: string;
}

/** 免费额度提示：剩余次数 / 不限次数 / 额度用完引导开通会员 */
export default function QuotaHint({ used, limit, label, loading, onUpgrade, className }: Props) {
  if (loading) {
    return (
      <View className={clsx('quota-hint row', className)}>
        <Text className="quota-hint__text f-xs t3">额度查询中...</Text>
      </View>
    );
  }

  if (limit === -1) {
    return (
      <View className={clsx('quota-hint quota-hint--free row-between', className)}>
        <Text className="quota-hint__text f-xs">♾️ {label ? `${label} · ` : ''}不限次数使用</Text>
      </View>
    );
  }

  const remaining = Math.max(0, limit - used);
  const percentUsed = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;

  if (remaining <= 0) {
    return (
      <View className={clsx('quota-hint quota-hint--out', className)}>
        <View className="row-between">
          <Text className="quota-hint__text f-xs">
            {label ? `${label} · ` : ''}
            {limit === 0 ? '该功能为会员专属' : '今日免费额度已用完'}
          </Text>
          {onUpgrade ? (
            <View className="quota-hint__upgrade" onClick={onUpgrade}>
              <Text className="quota-hint__upgrade-text">开通会员</Text>
            </View>
          ) : null}
        </View>
        <Text className="quota-hint__sub f-xs">开通会员可无限使用，解锁全部 10 个功能</Text>
      </View>
    );
  }

  return (
    <View className={clsx('quota-hint', className)}>
      <View className="row-between">
        <Text className="quota-hint__text f-xs">
          {label ? `${label} · ` : ''}今日剩余免费次数 <Text className="quota-hint__strong">{remaining}</Text> / {limit}
        </Text>
        {onUpgrade ? (
          <Text className="quota-hint__link" onClick={onUpgrade}>
            开通会员 →
          </Text>
        ) : null}
      </View>
      <View className="quota-hint__track">
        <View className="quota-hint__bar" style={{ width: `${percentUsed}%`, backgroundColor: hexToRgba('#ff6b35', 0.8) }} />
      </View>
    </View>
  );
}
