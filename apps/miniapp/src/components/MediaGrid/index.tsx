import { View, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { clsx } from '@wfb/shared-utils';
import './index.scss';

interface Props {
  images: string[];
  /** 最多展示 9 张 */
  max?: number;
  className?: string;
  onPreview?: (index: number) => void;
}

/**
 * 1-9 图九宫格：1 张单图放大，2/4 张两列，其余三列。
 * 布局用百分比 + 固定高度，避免小程序端图片抖动。
 */
export default function MediaGrid({ images, max = 9, className, onPreview }: Props) {
  const list = (images ?? []).filter(Boolean).slice(0, max);
  if (!list.length) return null;

  const count = list.length;
  const mode = count === 1 ? 'single' : count === 2 || count === 4 ? 'two' : 'three';

  const handle = (index: number) => {
    if (onPreview) {
      onPreview(index);
      return;
    }
    Taro.previewImage({ current: list[index], urls: list });
  };

  return (
    <View className={clsx('media-grid', `media-grid--${mode}`, className)}>
      {list.map((url, index) => (
        <View key={`${url}-${index}`} className="media-grid__cell" onClick={() => handle(index)}>
          <Image className="media-grid__img" src={url} mode="aspectFill" />
        </View>
      ))}
    </View>
  );
}
