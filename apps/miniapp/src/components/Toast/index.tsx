import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { clsx } from '@wfb/shared-utils';
import './index.scss';

type ToastIcon = 'success' | 'error' | 'loading' | 'none';

interface Props {
  visible: boolean;
  text: string;
  icon?: ToastIcon;
  /** 轻提示样式（无遮罩） */
  inline?: boolean;
  className?: string;
}

/** 页面内受控 Toast（需要跟随业务状态时使用） */
export default function Toast({ visible, text, icon = 'none', inline, className }: Props) {
  if (!visible || !text) return null;
  const icons: Record<ToastIcon, string> = { success: '✅', error: '⚠️', loading: '⏳', none: '' };
  return (
    <View className={clsx('toast-wrap', inline && 'toast-wrap--inline')}>
      {!inline ? <View className="toast-wrap__mask" /> : null}
      <View className="toast-box col-center">
        {icons[icon] ? <Text className="toast-box__icon">{icons[icon]}</Text> : null}
        <Text className="toast-box__text f-sm">{text}</Text>
      </View>
    </View>
  );
}

/* ------------------------- 命令式封装（跨端统一） ------------------------- */

export function toast(text: string, icon: ToastIcon = 'none', duration = 1800) {
  Taro.showToast({ title: text, icon: icon === 'none' ? 'none' : icon, duration });
}

export function toastSuccess(text = '操作成功') {
  Taro.showToast({ title: text, icon: 'success', duration: 1500 });
}

export function toastError(text = '操作失败') {
  Taro.showToast({ title: text, icon: 'none', duration: 2000 });
}

export function showLoading(text = '处理中...') {
  Taro.showLoading({ title: text, mask: true });
}

export function hideLoading() {
  Taro.hideLoading();
}
