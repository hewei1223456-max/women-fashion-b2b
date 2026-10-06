import { View, Text } from '@tarojs/components';
import type { UserBadge } from '@wfb/shared-types';
import { BADGE_LABELS, BADGE_TONES } from '@wfb/shared-types';
import { clsx } from '@wfb/shared-utils';
import './index.scss';

/**
 * 身份标识（UserBadge）—— 全站统一展示。
 *
 * 设计口径（见 docs/REDESIGN-V2.md 2.2）：
 * - 文案与配色**只**取自 shared-types 的 BADGE_LABELS / BADGE_TONES，组件内不写死任何中文；
 * - 五色：gold 付费 / blue 认证 / gray 游客 / orange 官方 / purple 地标大店·讲师；
 * - 一个用户可能同时有 2 个标识（认证店主 + 付费店主），默认最多展示 2 个。
 *
 * 兜底：后端 `buildBadges()` 是唯一权威，但若某个接口暂时没下发 badges
 * （例如灰度期间仍是旧版本），这里按同样的公开规则从 role / certStatus / memberLevel 推断，
 * 保证列表不会出现「所有人都没有标识」的空窗；后端一旦下发就以它为准。
 */

/** badges 缺失时的推断输入；都拿不到时按游客处理 */
export interface BadgeSource {
  badges?: UserBadge[];
  role?: string;
  certStatus?: string;
  memberLevel?: string;
}

const PAID_OWNER_LEVELS = ['elite', 'shark', 'tour'];
const PAID_MANUFACTURER_LEVELS = ['manufacturer_basic', 'manufacturer_pro', 'manufacturer_enterprise'];

/** 用契约常量构造一个标识（保证 label / tone 与全站一致） */
export function makeBadge(key: UserBadge['key']): UserBadge {
  return { key, label: BADGE_LABELS[key], tone: BADGE_TONES[key] };
}

/** 后端未下发 badges 时的兜底推断（规则与 apps/api 的 buildBadges 保持一致） */
export function fallbackBadges(source?: BadgeSource | null): UserBadge[] {
  if (!source) return [makeBadge('guest')];
  const { role, certStatus, memberLevel } = source;
  const certified = certStatus === 'approved';
  const keys: UserBadge['key'][] = [];

  if (role === 'admin') keys.push('official');
  else if (role === 'landmark') {
    keys.push('landmark');
    if (certified) keys.push('certified_owner');
  } else if (role === 'lecturer') keys.push('lecturer');
  else if (role === 'manufacturer') {
    if (certified) keys.push('certified_manufacturer');
    if (memberLevel && PAID_MANUFACTURER_LEVELS.includes(memberLevel)) keys.push('paid_manufacturer');
  } else {
    if (certified) keys.push('certified_owner');
    if (memberLevel && PAID_OWNER_LEVELS.includes(memberLevel)) keys.push('paid_owner');
  }

  if (!keys.length) keys.push('guest');
  return keys.map(makeBadge);
}

/** 归一化：后端给 key 就够，文案与配色一律回落到契约常量，避免各处文案漂移 */
function normalize(badge: UserBadge): UserBadge {
  const key = badge?.key as UserBadge['key'] | undefined;
  if (!key || !BADGE_LABELS[key]) return makeBadge('guest');
  return makeBadge(key);
}

/** 取标识列表：优先后端 badges，缺失时兜底推断 */
export function badgeListOf(source?: BadgeSource | null): UserBadge[] {
  const list = source?.badges;
  if (Array.isArray(list) && list.length) return list.map(normalize);
  return fallbackBadges(source);
}

interface Props {
  /** 单个标识 */
  badge?: UserBadge;
  /** 多个标识（优先级高于 badge） */
  badges?: UserBadge[];
  /** 直接传用户（读 user.badges，缺失时按 role/certStatus/memberLevel 兜底） */
  user?: BadgeSource | null;
  /** 最多展示几个，默认 2（认证 + 付费） */
  max?: number;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

/**
 * 身份标识组件。三种用法都支持：
 *   <Badge badge={b} />           单个
 *   <Badge user={user} />         读 UserBrief.badges（推荐）
 *   <UserBadges user={user} />    同上，语义化别名
 */
export default function Badge({ badge, badges, user, max = 2, size = 'sm', className }: Props) {
  const list = badge
    ? [normalize(badge)]
    : badges?.length
      ? badges.map(normalize)
      : badgeListOf(user);
  const shown = max > 0 ? list.slice(0, max) : list;

  if (!shown.length) return null;

  return (
    <View className={clsx('badge-row', className)}>
      {shown.map((b, i) => (
        <View key={`${b.key}-${i}`} className={clsx('badge', `badge--${b.tone}`, `badge--${size}`)}>
          <Text className="badge__text">{b.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** 语义化别名：一次渲染用户的全部标识 */
export function UserBadges(props: Omit<Props, 'badge' | 'badges'>) {
  return <Badge {...props} />;
}
