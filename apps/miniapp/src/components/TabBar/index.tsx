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
 * 厂家端底部导航 —— **不是店主端换皮**，是另一套信息架构。
 *
 * 用户原话：「厂家版打开跟店主版的界面一模一样，厂家版核心是发布产品、找店主建联、
 * 发布订货会，同时也有行业资讯和经营工具，但核心是前面那些功能。」
 *
 * 所以厂家端：
 *   - 第 1 项是「货源」= 自己款管理的主战场（发布产品），不是浏览别人的货
 *   - 第 2 项「建联」= 找店主、接需求
 *   - 第 3 项「订货会」= 发布与管理场次
 *   - 第 4 项「资讯」= 复用资讯流
 *   - 第 5 项「我的」= 厂家工作台 + 版本配额
 * 店主端的「功能」（经营工具）在厂家端收进工作台里，不占 Tab 位。
 *
 * ⚠️ path 必须写字面量、不能 import pages/manufacturer 下的模块：
 * 那是分包，主包引用分包模块微信会报错。
 */
export const MANUFACTURER_TABS: TabItem[] = [
  { key: 'goods', label: '货源', icon: '📦', path: '/pages/manufacturer/home' },
  { key: 'connect', label: '建联', icon: '🤝', path: '/pages/manufacturer/connect' },
  { key: 'fair', label: '订货会', icon: '🏬', path: '/pages/manufacturer/fair' },
  { key: 'info', label: '资讯', icon: '📖', path: '/pages/index/index' },
  { key: 'profile', label: '我的', icon: '🏭', path: '/pages/manufacturer/workbench' },
];

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
 * 自定义底部导航。
 *
 * 不用原生 tabBar 的原因：微信小程序原生 tabBar 定制能力很弱（只有角标），
 * 而我们需要「按身份出不同导航」+ H5/小程序视觉完全一致。
 * 店主端 4 项、厂家端 5 项，由 store 里的 user.role 决定。
 */
export default function TabBar({ current }: Props) {
  const unread = useAppStore((s) => s.unread.total);
  const role = useAppStore((s) => s.user?.role);
  const isMfr = role === 'manufacturer';
  const tabs = isMfr ? MANUFACTURER_TABS : TABS;

  const go = (item: TabItem) => {
    if (isActive(item, current)) return;
    Taro.redirectTo({ url: item.path }).catch(() => {
      Taro.showToast({ title: '页面开发中，敬请期待', icon: 'none' });
    });
  };

  return (
    <View className={`tabbar ${isMfr ? 'tabbar--mfr' : ''}`}>
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
