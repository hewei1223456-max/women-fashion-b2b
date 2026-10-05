import { ScrollView, View, Text } from '@tarojs/components';
import { clsx } from '@wfb/shared-utils';
import './index.scss';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterGroup {
  key: string;
  /** 组名（如「风格」「价格带」「发货地」），可省略 */
  label?: string;
  options: FilterOption[];
  /** 多选（风格标签场景），默认单选 */
  multiple?: boolean;
}

interface Props {
  groups: FilterGroup[];
  /** 当前选中值：单选存 string，多选存 string[] */
  value: Record<string, string | string[] | undefined>;
  onChange: (key: string, next: string | string[]) => void;
  className?: string;
}

/** 横向滚动筛选栏：每行一组，组内横向滚动，再次点击取消选中 */
export default function FilterBar({ groups, value, onChange, className }: Props) {
  const isActive = (group: FilterGroup, optionValue: string) => {
    const v = value[group.key];
    if (group.multiple) return Array.isArray(v) && v.includes(optionValue);
    return v === optionValue;
  };

  const toggle = (group: FilterGroup, optionValue: string) => {
    const v = value[group.key];
    if (group.multiple) {
      const arr = Array.isArray(v) ? v : [];
      onChange(group.key, arr.includes(optionValue) ? arr.filter((x) => x !== optionValue) : [...arr, optionValue]);
      return;
    }
    onChange(group.key, v === optionValue ? '' : optionValue);
  };

  return (
    <View className={clsx('filter-bar', className)}>
      {groups.map((group) => (
        <View key={group.key} className="filter-bar__group row">
          {group.label ? <Text className="filter-bar__label f-xs t3">{group.label}</Text> : null}
          <ScrollView className="filter-bar__scroll flex-1" scrollX enableFlex>
            <View className="filter-bar__row row">
              {group.options.map((opt) => (
                <View
                  key={`${group.key}-${opt.value}`}
                  className={clsx('filter-bar__chip', isActive(group, opt.value) && 'is-active')}
                  onClick={() => toggle(group, opt.value)}
                >
                  <Text className="filter-bar__chip-text">{opt.label}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      ))}
    </View>
  );
}
