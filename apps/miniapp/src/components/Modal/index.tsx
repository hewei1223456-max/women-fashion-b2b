import type { ReactNode } from 'react';
import { View, Text } from '@tarojs/components';
import { clsx } from '@wfb/shared-utils';
import './index.scss';

interface Props {
  visible: boolean;
  title?: string;
  /** 文本内容（与 children 二选一） */
  content?: string;
  children?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  /** 点击遮罩关闭 */
  maskClosable?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  className?: string;
}

/** 居中弹窗：确认 / 取消，跨端自定义实现（不依赖原生 API） */
export default function Modal({
  visible,
  title,
  content,
  children,
  confirmText = '确定',
  cancelText = '取消',
  showCancel = true,
  maskClosable = true,
  onConfirm,
  onCancel,
  className,
}: Props) {
  if (!visible) return null;

  return (
    <View className="modal">
      <View
        className="modal__mask"
        onClick={() => {
          if (maskClosable) onCancel?.();
        }}
      />
      <View className={clsx('modal__panel', className)}>
        {title ? <Text className="modal__title bold t1">{title}</Text> : null}
        {content ? <Text className="modal__content f-sm t2">{content}</Text> : null}
        {children}
        <View className="modal__actions row">
          {showCancel ? (
            <View className="modal__btn modal__btn--cancel col-center" onClick={onCancel}>
              <Text>{cancelText}</Text>
            </View>
          ) : null}
          <View className="modal__btn modal__btn--confirm col-center" onClick={onConfirm}>
            <Text>{confirmText}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
