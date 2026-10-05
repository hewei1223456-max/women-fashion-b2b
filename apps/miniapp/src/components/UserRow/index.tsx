import type { ReactNode } from 'react';
import { View, Text, Image } from '@tarojs/components';
import type { UserBrief } from '@wfb/shared-types';
import { clsx } from '@wfb/shared-utils';
import { certBadge, ROLE_LABELS } from '../utils';
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
  size?: 'sm' | 'md';
  className?: string;
}

/** 用户行：头像 + 昵称 + 认证标识 + 角色 + 关注按钮 */
export default function UserRow({ user, followed, showFollow = true, followLoading, onFollow, onClick, extra, desc, size = 'md', className }: Props) {
  const badge = certBadge(user.certStatus);
  const avatarSize = size === 'sm' ? 'avatar avatar-sm' : 'avatar';

  return (
    <View className={clsx('user-row row', className)}>
      <View className="row flex-1" onClick={onClick}>
        <Image className={clsx(avatarSize, 'user-row__avatar')} src={user.avatarUrl} mode="aspectFill" />
        <View className="col flex-1 user-row__main">
          <View className="row">
            <Text className="user-row__name bold t1 ellipsis">{user.nickname}</Text>
            {badge ? (
              <View className={clsx('user-row__cert', user.certStatus === 'approved' && 'is-approved')}>
                <Text className="user-row__cert-text">{badge}</Text>
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
