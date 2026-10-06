import type { ReactNode } from 'react';
import { View, Text, Image } from '@tarojs/components';
import type { UserBrief } from '@wfb/shared-types';
import { clsx } from '@wfb/shared-utils';
import { CERT_LABELS, ROLE_LABELS } from '../utils';
import Badge from '../Badge';
import './index.scss';

interface Props {
  user: UserBrief;
  /** 是否已关注 */
  followed?: boolean;
  /** 展示关注按钮（自己隐藏） */
  showFollow?: boolean;
  followLoading?: boolean;
  onFollow?: (next: boolean) => void;
  onClick?: () => void;
  /** 头像右侧自定义区域，替代关注按钮 */
  extra?: ReactNode;
  /** 昵称下方的补充说明 */
  desc?: string;
  /** 身份标识最多展示几个 */
  maxBadges?: number;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * 用户行：头像 + 昵称 + **身份标识**（游客/认证店主/付费店主/认证厂家/付费厂家/大店/讲师/官方）+ 关注按钮。
 * 标识文案与配色统一来自 components/Badge（BADGE_LABELS / BADGE_TONES）。
 */
export default function UserRow({
  user,
  followed,
  showFollow = true,
  followLoading,
  onFollow,
  onClick,
  extra,
  desc,
  maxBadges = 2,
  size = 'md',
  className,
}: Props) {
  const avatarSize = size === 'sm' ? 'avatar avatar-sm' : 'avatar';
  /* 认证中 / 未通过：badges 里不体现，这里补一个状态文案 */
  const certPending = user.certStatus === 'pending' || user.certStatus === 'rejected';

  return (
    <View className={clsx('user-row row', className)}>
      <View className="row flex-1" onClick={onClick}>
        <Image className={clsx(avatarSize, 'user-row__avatar')} src={user.avatarUrl} mode="aspectFill" />
        <View className="col flex-1 user-row__main">
          <View className="row user-row__head">
            <Text className="user-row__name bold t1 ellipsis">{user.nickname}</Text>
            <Badge user={user} max={maxBadges} size="sm" />
            {certPending ? (
              <View className={clsx('user-row__cert', user.certStatus === 'rejected' && 'is-rejected')}>
                <Text className="user-row__cert-text">{CERT_LABELS[user.certStatus]}</Text>
              </View>
            ) : null}
          </View>
          <Text className="user-row__meta f-xs t3 ellipsis">
            {desc ?? `${ROLE_LABELS[user.role]}${user.companyName ? ` · ${user.companyName}` : ''}`}
          </Text>
        </View>
      </View>
      {extra ??
        (showFollow ? (
          <View
            className={clsx('btn btn-sm user-row__follow', followed ? 'btn-plain' : 'btn-primary', followLoading && 'btn-disabled')}
            onClick={(e) => {
              e.stopPropagation();
              if (followLoading) return;
              onFollow?.(!followed);
            }}
          >
            <Text>{followed ? '已关注' : '+ 关注'}</Text>
          </View>
        ) : null)}
    </View>
  );
}
