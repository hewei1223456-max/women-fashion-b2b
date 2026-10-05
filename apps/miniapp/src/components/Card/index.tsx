import type { ReactNode } from 'react';
import { View, Text } from '@tarojs/components';
import { clsx } from '@wfb/shared-utils';
import './index.scss';

interface Props {
  /** 卡片标题 */
  title?: string;
  /** 标题下的说明 */
  subtitle?: string;
  /** 右侧自定义节点（优先级高于 extraText） */
  extra?: ReactNode;
  /** 右侧文字动作 */
  extraText?: string;
  onExtra?: () => void;
  /** 去掉内边距（瀑布流/列表容器用） */
  noPadding?: boolean;
  className?: string;
  onClick?: () => void;
  children?: ReactNode;
}

/** 通用卡片：标题 + 右侧动作 + 内容区 */
export default function Card({ title, subtitle, extra, extraText, onExtra, noPadding, className, onClick, children }: Props) {
  const hasHead = !!(title || subtitle || extra || extraText);
  return (
    <View className={clsx('card', noPadding && 'card--nopad', className)} onClick={onClick}>
      {hasHead ? (
        <View className="card__head row-between">
          <View className="col flex-1">
            {title ? <Text className="card__title bold t1">{title}</Text> : null}
            {subtitle ? <Text className="card__subtitle f-xs t3">{subtitle}</Text> : null}
          </View>
          {extra ? (
            extra
          ) : extraText ? (
            <Text
              className="card__extra f-sm brand"
              onClick={(e) => {
                e.stopPropagation();
                onExtra?.();
              }}
            >
              {extraText}
            </Text>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}
