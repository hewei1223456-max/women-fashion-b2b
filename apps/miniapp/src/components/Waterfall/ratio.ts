/**
 * 演示图宽高解析 —— 瀑布流防抖动的关键。
 *
 * 后端封面地址形如：
 *   /uploads/demo/img.svg?seed=p-3-1&ratio=portrait&w=600&h=800&label=...
 * 宽高信息就在 `w`/`h`（精确）或 `ratio`（预设）里，**不需要等图片 onLoad** 就能算出占位高度，
 * 否则图片加载完成时卡片会被撑开，整列内容跳动（CLS）。
 *
 * 注意：小程序端不一定有 URLSearchParams，这里手写解析，跨端一致。
 */

export interface ImageSize {
  width: number;
  height: number;
}

/** 与 apps/api/src/core/placeholder.ts 的 SVG_RATIOS 保持一致 */
const RATIO_PRESETS: Record<string, ImageSize> = {
  square: { width: 600, height: 600 },
  portrait: { width: 600, height: 800 },
  landscape: { width: 800, height: 600 },
  wide: { width: 800, height: 450 },
  avatar: { width: 200, height: 200 },
};

/** 常见的「宽 → 高」比例兜底（按 ratio 关键字，不依赖具体像素） */
const RATIO_FALLBACK: Record<string, number> = {
  square: 1,
  portrait: 4 / 3,
  landscape: 3 / 4,
  wide: 9 / 16,
  avatar: 1,
};

function parseQuery(url: string): Record<string, string> {
  const qIndex = url.indexOf('?');
  if (qIndex < 0) return {};
  const out: Record<string, string> = {};
  url
    .slice(qIndex + 1)
    .split('#')[0]
    .split('&')
    .forEach((pair) => {
      if (!pair) return;
      const eq = pair.indexOf('=');
      const key = eq < 0 ? pair : pair.slice(0, eq);
      const value = eq < 0 ? '' : pair.slice(eq + 1);
      try {
        out[decodeURIComponent(key)] = decodeURIComponent(value);
      } catch {
        out[key] = value;
      }
    });
  return out;
}

/** 从图片 URL 解析真实宽高；解析不到返回 null */
export function parseImageSize(url?: string): ImageSize | null {
  if (!url || typeof url !== 'string') return null;
  const params = parseQuery(url);
  const width = Number(params.w);
  const height = Number(params.h);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 && width <= 8000 && height <= 8000) {
    return { width, height };
  }
  const preset = params.ratio ? RATIO_PRESETS[params.ratio] : undefined;
  return preset ?? null;
}

/**
 * 封面占位比例 height / width（用于 padding-top 百分比）。
 * 解析不到时回落到默认值，保证不同数据源下都不会出现 0 高度。
 */
export function coverRatioOf(url?: string, fallback = 0.75): number {
  const size = parseImageSize(url);
  if (size) {
    const ratio = size.height / size.width;
    if (Number.isFinite(ratio) && ratio >= 0.25 && ratio <= 3) return Math.round(ratio * 1000) / 1000;
  }
  const params = url ? parseQuery(url) : {};
  const preset = params.ratio ? RATIO_FALLBACK[params.ratio] : undefined;
  return preset ?? fallback;
}

/** padding-top 百分比字符串，直接丢给 inline style（百分比跨端都支持，不需要 rpx/rem 换算） */
export function coverPaddingOf(url?: string, fallback = 0.75): string {
  return `${Math.round(coverRatioOf(url, fallback) * 10000) / 100}%`;
}
