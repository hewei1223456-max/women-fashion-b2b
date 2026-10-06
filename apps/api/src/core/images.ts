import { svgPlaceholder, type SvgRatio } from './placeholder';

/**
 * 演示图片地址生成（无外部 CDN 依赖）
 *
 * 由 API 的 `/uploads/demo/img.svg` 路由按 seed 确定性生成渐变占位图，
 * 离线 / 内网 / CDN 不可达时界面依然完整（不会出现一片灰色空白）。
 *
 * 从 core/seed.ts 抽出来，因为组局、加微等模块也需要生成演示图，
 * 放在 seed 里会造成「业务模块 import 播种脚本」的反向依赖。
 */
export function img(seed: string, w = 600, h = 800, label = ''): string {
  const ratio: SvgRatio = w === h ? 'square' : w > h ? (w / h >= 1.6 ? 'wide' : 'landscape') : 'portrait';
  const q = new URLSearchParams({ seed, ratio, w: String(w), h: String(h) });
  if (label) q.set('label', label);
  return `/uploads/demo/img.svg?${q.toString()}`;
}

/** 头像（正方形小图） */
export function avatar(seed: string): string {
  return img(seed, 200, 200);
}

export { svgPlaceholder };
export type { SvgRatio };
