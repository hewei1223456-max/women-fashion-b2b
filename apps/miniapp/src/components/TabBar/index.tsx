import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useAppStore } from '@/store/app';
import './index.scss';

interface TabItem {
  key: string;
  label: string;
  icon: string;
  path: string;
}

export const TABS: TabItem[] = [
  { key: 'home', label: '首页', icon: '🏠', path: '/pages/index/index' },
  { key: 'source', label: '货源', icon: '🧵', path: '/pages/source/index' },
  { key: 'tools', label: '功能', icon: '🛠️', path: '/pages/tools/index' },
  { key: 'profile', label: '我的', icon: '👤', path: '/pages/profile/index' },
];

interface Props {
  /** 当前高亮 tab 的 key */
  current: string;
}

/**
 * 自定义底部导航：4 个 tab。
 * 不用原生 tabBar 的原因：微信小程序不支持「我的」页动态角标以外的定制，
 * 且我们需要在 H5 上保持完全一致的视觉。
 */
export default function TabBar({ current }: Props) {
  const unread = useAppStore((s) => s.unread.total);

  const go = (item: TabItem) => {
    if (item.key === current) return;
    Taro.redirectTo({ url: item.path });
  };

  return (
    <View className="tabbar">
      {TABS.map((item) => (
        <View key={item.key} className={`tabbar__item ${item.key === current ? 'is-active' : ''}`} onClick={() => go(item)}>
          <View className="tabbar__icon-wrap">
            <Text className="tabbar__icon">{item.icon}</Text>
            {item.key === 'profile' && unread > 0 ? <Text className="tabbar__badge">{unread > 99 ? '99+' : unread}</Text> : null}
          </View>
          <Text className="tabbar__label">{item.label}</Text>
        </View>
      ))}
    </View>
  );
}
