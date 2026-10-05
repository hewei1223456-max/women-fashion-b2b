import { View, Text } from '@tarojs/components';
import { STYLE_COLORS } from '@wfb/shared-types';
import { clsx } from '@wfb/shared-utils';
import { hexToRgba } from '../utils';
import './index.scss';

type TagType = 'brand' | 'accent' | 'gray' | 'success' | 'danger' | 'outline';

interface Props {
  /** 文本；配合 styleTag 时可省略，默认展示风格名 */
  text?: string;
  /** 风格标签：颜色自动取 STYLE_COLORS */
  styleTag?: string;
  type?: TagType;
  /** 自定义颜色（风格色优先） */
  color?: string;
  size?: 'sm' | 'md';
  /** 实心展示（默认浅底彩字） */
  solid?: boolean;
  onClick?: () => void;
  className?: string;
}

/** 标签：风格标签自动取 STYLE_COLORS 配色，其余走全局 tag 样式 */
export default function Tag({ text, styleTag, type, color, size = 'sm', solid, onClick, className }: Props) {
  const styleColor = styleTag ? STYLE_COLORS[styleTag] : undefined;
  const label = text ?? styleTag ?? '';
  const custom = styleColor || color;

  const style = custom
    ? solid
      ? { backgroundColor: custom, color: '#fff', borderColor: custom }
      : { backgroundColor: hexToRgba(custom, 0.12), color: custom, borderColor: hexToRgba(custom, 0.35) }
    : undefined;

  return (
    <View
      className={clsx('tag', !custom && `tag-${type ?? 'brand'}`, 'tag--styled', size === 'md' && 'tag--md', className)}
      style={style as never}
      onClick={onClick}
    >
      <Text className="tag__text">{label}</Text>
    </View>
  );
}
