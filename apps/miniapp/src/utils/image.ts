/**
 * 图片兜底工具（跨端通用）
 *
 * 为什么需要：
 *   演示数据里的图片走外部 CDN（picsum 等）。在离线环境、内网、或 CDN 被墙时，
 *   `<Image>` 会渲染成一片灰色空白 —— 页面结构没问题，但看起来像"坏了"。
 *   这里统一在 onError 时替换为本地 placeholder，保证任何网络条件下界面都是完整的。
 *
 * 用法：
 *   const [src, onError] = useImageFallback(url, 'product');
 *   <Image src={src} onError={onError} mode="aspectFill" />
 */

import { useCallback, useState } from 'react';

/** 本地兜底图（构建时由 Taro 处理为可用的资源路径） */
import genericPlaceholder from '@/static/placeholder.svg';
import productPlaceholder from '@/static/placeholder-product.svg';

export type FallbackKind = 'generic' | 'product';

export function placeholderOf(kind: FallbackKind = 'generic'): string {
  return kind === 'product' ? productPlaceholder : genericPlaceholder;
}

/** 判断是否已经是本地兜底图，避免无限 onError 循环 */
export function isPlaceholder(src?: string): boolean {
  if (!src) return true;
  return src.includes('placeholder');
}

/**
 * 图片加载失败自动兜底。
 * 返回 [当前 src, onError 处理函数]。
 */
export function useImageFallback(original?: string, kind: FallbackKind = 'generic') {
  const [src, setSrc] = useState<string>(original || placeholderOf(kind));

  const onError = useCallback(() => {
    setSrc((prev) => (isPlaceholder(prev) ? prev : placeholderOf(kind)));
  }, [kind]);

  return [src, onError] as const;
}

/** 非组件场景：给一组 URL 做兜底清洗 */
export function withFallback(url: string | undefined, kind: FallbackKind = 'generic'): string {
  return url && url.trim() ? url : placeholderOf(kind);
}
