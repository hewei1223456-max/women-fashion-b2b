import { View, Text } from '@tarojs/components';
import { clsx } from '@wfb/shared-utils';
import './index.scss';

export interface ChipOption {
  value: string;
  label: string;
}

interface Props {
  options: ChipOption[];
  /** 单选值 */
  value?: string;
  /** 多选值（multiple=true 时生效） */
  values?: string[];
  multiple?: boolean;
  /** 单选：回调新值；多选：回调被点击的项，由调用方 toggle */
  onSelect: (value: string) => void;
  className?: string;
}

/** 可换行的标签选择组：风格 / 语气 / 平台 / 时长等表单枚举统一用它 */
export default function ChipSelect({ options, value, values, multiple, onSelect, className }: Props) {
  const isActive = (v: string) => (multiple ? (values ?? []).includes(v) : value === v);
  return (
    <View className={clsx('chip-select row wrap', className)}>
      {options.map((opt) => (
        <View key={opt.value} className={clsx('chip-select__item', isActive(opt.value) && 'is-active')} onClick={() => onSelect(opt.value)}>
          <Text className="chip-select__text">{opt.label}</Text>
        </View>
      ))}
    </View>
  );
}
