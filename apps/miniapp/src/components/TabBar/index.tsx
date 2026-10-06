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
  { key: 'info', label: '资讯', icon: '📖', path: '/pages/index/index' },
  { key: 'source', label: '货源', icon: '🧵', path: '/pages/source/index' },
  { key: 'tools', label: '功能', icon: '🛠️', path: '/pages/tools/index' },
  { key: 'profile', label: '我的', icon: '👤', path: '/pages/profile/index' },
];

/**
 * 厂家视角的第 4 个 tab：切到「工作台」。
 * 用户原话「需要一个单独的厂家端后台，可以在上面切换视角」——
 * 切到厂家端后底部导航第 4 项直接变成工作台，不再是店主端的「我的」。
 */
export const MANUFACTURER_TAB: TabItem = {
  key: 'profile',
  label: '工作台',
  icon: '🏭',
  path: '/pages/manufacturer/workbench',
};

/** 兼容历史的 current="home"（首页改名资讯前的调用方） */
function isActive(item: TabItem, current: string): boolean {
  if (item.key === current) return true;
  return item.key === 'info' && current === 'home';
}

interface Props {
  /** 当前高亮 tab 的 key */
  current: string;
}

/**
 * 自定义底部导航：4 个 tab（资讯 / 货源 / 功能 / 我的）。
 * 不用原生 tabBar 的原因：微信小程序不支持「我的」页动态角标以外的定制，
 * 且我们需要在 H5 上保持完全一致的视觉。
 * 按「资讯 / 货源 / 功能」的信息架构固定前 3 项，第 4 项随视角（店主端 / 厂家端）变化。
 */
export default function TabBar({ current }: Props) {
  const unread = useAppStore((s) => s.unread.total);
  const role = useAppStore((s) => s.user?.role);
  const tabs = role === 'manufacturer' ? [TABS[0], TABS[1], TABS[2], MANUFACTURER_TAB] : TABS;

  const go = (item: TabItem) => {
    if (isActive(item, current)) return;
    Taro.redirectTo({ url: item.path }).catch(() => {
      Taro.showToast({ title: '页面开发中，敬请期待', icon: 'none' });
    });
  };

  return (
    <View className="tabbar">
      {tabs.map((item) => (
        <View
          key={`${item.key}-${item.label}`}
          className={`tabbar__item ${isActive(item, current) ? 'is-active' : ''}`}
          onClick={() => go(item)}
        >
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
