/**
 * 本地演示图片生成（无外部网络依赖）
 *
 * 为什么不在演示数据里直接写 picsum.photos 这类外链：
 *   离线演示、内网评审、CDN 不可达时，所有图片都会渲染成灰色空白，
 *   页面结构没问题但看起来像"坏了"。这里用内联 SVG 生成确定性的渐变占位图，
 *   由 API 的 /uploads 静态目录直接托管，任何环境都能正常显示。
 *
 * 生产环境替换为 OSS 直链即可（seed 里的 img() 换成真实 URL）。
 */

/** 无 # 的十六进制色，用于拼 SVG */
const PALETTES: [string, string, string][] = [
  // [主色, 次色, 文字色]
  ['#eef2ff', '#dbe3fb', '#7b8bc7'],
  ['#fff1ea', '#ffe0d1', '#c98a6b'],
  ['#eefaf3', '#d6f2e3', '#6aa88a'],
  ['#f6f0ff', '#e8dcff', '#9683c4'],
  ['#fff7e6', '#ffedcc', '#c9a15e'],
  ['#eef7ff', '#d8ecff', '#6f9dc4'],
  ['#fdf0f5', '#fbdcea', '#c47b99'],
  ['#f2f6f9', '#e1e9f0', '#8095a8'],
];

export const SVG_RATIOS = {
  square: [600, 600],
  portrait: [600, 800],
  landscape: [800, 600],
  wide: [800, 450],
  avatar: [200, 200],
} as const;

export type SvgRatio = keyof typeof SVG_RATIOS;

/** 把任意字符串转成稳定数字（同一个 seed 永远得到同一张图） */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] as string);
}

/**
 * 生成一张确定性占位图。
 * @param seed 决定配色与图形（同一 seed 结果恒定）
 * @param label 图片中央显示的文案（可空）
 * @param ratio 比例
 */
export function svgPlaceholder(seed: string, label = '', ratio: SvgRatio = 'portrait'): string {
  const [w, h] = SVG_RATIOS[ratio];
  const n = hash(seed);
  const [c1, c2, accent] = PALETTES[n % PALETTES.length];
  const rot = n % 45;
  const cx = w * (0.3 + ((n >> 3) % 40) / 100);
  const cy = h * (0.28 + ((n >> 7) % 40) / 100);
  const r = Math.min(w, h) * (0.18 + ((n >> 11) % 14) / 100);
  const fontSize = Math.max(14, Math.round(Math.min(w, h) * 0.045));
  const lines = label ? wrap(label, 12) : [];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(${rot} 0.5 0.5)">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="${accent}" opacity="0.16"/>
  <circle cx="${(w - cx).toFixed(0)}" cy="${(h - cy * 0.7).toFixed(0)}" r="${(r * 0.62).toFixed(0)}" fill="${accent}" opacity="0.12"/>
  <rect x="0" y="${h - 4}" width="${w}" height="4" fill="${accent}" opacity="0.35"/>
  ${lines
    .map(
      (line, i) =>
        `<text x="${w / 2}" y="${h / 2 + i * (fontSize * 1.35) - ((lines.length - 1) * fontSize * 1.35) / 2}" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif" font-size="${fontSize}" fill="${accent}" text-anchor="middle" font-weight="600">${escapeXml(line)}</text>`,
    )
    .join('\n  ')}
</svg>`;
}

/** 简单按字数折行（中文按字符数） */
function wrap(text: string, perLine: number): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= perLine) return [clean];
  const lines: string[] = [];
  for (let i = 0; i < clean.length && lines.length < 3; i += perLine) {
    lines.push(clean.slice(i, i + perLine));
  }
  return lines;
}
