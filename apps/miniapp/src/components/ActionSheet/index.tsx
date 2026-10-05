import { View, Text } from '@tarojs/components';
import { clsx } from '@wfb/shared-utils';
import './index.scss';

export interface ActionSheetOption {
  key: string;
  label: string;
  desc?: string;
  /** 危险操作（删除等） */
  danger?: boolean;
}

interface Props {
  visible: boolean;
  title?: string;
  options: ActionSheetOption[];
  cancelText?: string;
  /** 选中某一项后回调（组件自身不关闭，由调用方控制 visible） */
  onSelect: (key: string) => void;
  onClose: () => void;
}

/** 底部动作面板：分享渠道、更多操作等 */
export default function ActionSheet({ visible, title, options, cancelText = '取消', onSelect, onClose }: Props) {
  if (!visible) return null;
  return (
    <View className="action-sheet">
      <View className="action-sheet__mask" onClick={onClose} />
      <View className="action-sheet__panel">
        {title ? <Text className="action-sheet__title f-sm t3">{title}</Text> : null}
        {options.map((opt) => (
          <View key={opt.key} className="action-sheet__item col-center" onClick={() => onSelect(opt.key)}>
            <Text className={clsx('action-sheet__label', opt.danger && 'is-danger')}>{opt.label}</Text>
            {opt.desc ? <Text className="action-sheet__desc f-xs t3">{opt.desc}</Text> : null}
          </View>
        ))}
        <View className="action-sheet__gap" />
        <View className="action-sheet__item col-center action-sheet__cancel" onClick={onClose}>
          <Text className="action-sheet__label">{cancelText}</Text>
        </View>
        <View className="safe-bottom" />
      </View>
    </View>
  );
}
