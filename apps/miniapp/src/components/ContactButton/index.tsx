import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { ContactLogResult } from '@wfb/shared-types';
import { clsx } from '@wfb/shared-utils';
import { api } from '@/services/request';
import Modal from '../Modal';
import { toastError, toastSuccess } from '../Toast';
import { errMsg } from '../utils';
import './index.scss';

interface Props {
  manufacturerId: number;
  productId?: number;
  articleId?: number;
  /** 来源标识：product_card / product_detail / source_feed / article_detail … */
  source: string;
  text?: string;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  disabled?: boolean;
  className?: string;
  /** 加微成功回调（用于埋点 / 刷新列表） */
  onLogged?: (result: ContactLogResult) => void;
}

/**
 * 加微按钮：统一走 api.contact.log。
 * 成功后弹窗展示返回的微信号（可复制）+ suggestions 货源→功能联动入口。
 */
export default function ContactButton({ manufacturerId, productId, articleId, source, text = '加微信', size = 'md', block, disabled, className, onLogged }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ContactLogResult | null>(null);
  const [visible, setVisible] = useState(false);

  const run = async () => {
    if (loading || disabled) return;
    setLoading(true);
    try {
      const res = await api.contact.log({ manufacturerId, productId, articleId, source });
      setResult(res);
      setVisible(true);
      onLogged?.(res);
    } catch (err) {
      toastError(errMsg(err, '获取微信号失败，请稍后重试'));
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    if (!result?.wechatId) return;
    Taro.setClipboardData({ data: result.wechatId })
      .then(() => toastSuccess('微信号已复制'))
      .catch(() => toastError('复制失败'));
  };

  const goto = (path: string) => {
    setVisible(false);
    Taro.navigateTo({ url: path });
  };

  return (
    <View className={clsx('contact-btn', className)}>
      <View
        className={clsx('btn btn-primary', size !== 'lg' && 'btn-sm', block && 'btn-block', (loading || disabled) && 'btn-disabled', 'contact-btn__inner')}
        onClick={(e) => {
          e.stopPropagation();
          run();
        }}
      >
        <Text>{loading ? '获取中...' : text}</Text>
      </View>

      <Modal visible={visible} title="厂家微信号" showCancel={false} confirmText="知道了" onConfirm={() => setVisible(false)} onCancel={() => setVisible(false)}>
        <View className="contact-btn__modal">
          <View className="contact-btn__wechat-row row-between">
            <Text className="contact-btn__wechat bold t1">{result?.wechatId ?? '-'}</Text>
            <View className="contact-btn__copy" onClick={copy}>
              <Text className="contact-btn__copy-text">复制</Text>
            </View>
          </View>
          <Text className="contact-btn__tip f-xs t3">长按或点击复制后到微信添加，备注「拿货 + 风格」通过率更高</Text>
          {result?.suggestions?.length ? (
            <View className="contact-btn__suggest">
              <Text className="contact-btn__suggest-title f-xs t2">加微后推荐动作</Text>
              {result.suggestions.map((s) => (
                <View key={s.key} className="contact-btn__suggest-item row-between" onClick={() => goto(s.path)}>
                  <Text className="contact-btn__suggest-label f-sm t1">{s.label}</Text>
                  <Text className="contact-btn__suggest-arrow f-sm t3">→</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}
