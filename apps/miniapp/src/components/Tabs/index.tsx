import { ScrollView, View, Text } from '@tarojs/components';
import { clsx } from '@wfb/shared-utils';
import './index.scss';

export interface TabItem {
  key: string;
  label: string;
  /** 角标数字 */
  badge?: number;
}

interface Props {
  items: TabItem[];
  current: string;
  onChange: (key: string) => void;
  /** 超过 4 个时建议开启横向滚动 */
  scroll?: boolean;
  className?: string;
}

/** 横向 Tabs：下划线指示 + 可选角标 */
export default function Tabs({ items, current, onChange, scroll = false, className }: Props) {
  const currentIndex = Math.max(
    0,
    items.findIndex((i) => i.key === current),
  );

  const body = (
    <View className={clsx('tabs__inner row', scroll && 'tabs__inner--scroll')}>
      {items.map((item) => (
        <View
          key={item.key}
          id={`wfb-tab-${item.key}`}
          className={clsx('tabs__item col-center', item.key === current && 'is-active', scroll && 'tabs__item--fixed')}
          onClick={() => onChange(item.key)}
        >
          <View className="tabs__label-wrap row">
            <Text className="tabs__label">{item.label}</Text>
            {item.badge ? <Text className="tabs__badge">{item.badge > 99 ? '99+' : item.badge}</Text> : null}
          </View>
          <View className="tabs__line" />
        </View>
      ))}
    </View>
  );

  if (scroll) {
    return (
      <ScrollView className={clsx('tabs tabs--scroll', className)} scrollX scrollWithAnimation scrollIntoView={`wfb-tab-${items[currentIndex]?.key ?? ''}`} enableFlex>
        {body}
      </ScrollView>
    );
  }
  return <View className={clsx('tabs', className)}>{body}</View>;
}
