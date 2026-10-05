/** 轻量状态与格式化工具（后台侧，不引入额外依赖） */

export function clsx(...args: (string | false | null | undefined)[]): string {
  return args.filter(Boolean).join(' ');
}

export function formatDate(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function compact(n: number | undefined): string {
  const v = n ?? 0;
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}亿`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(1)}万`;
  return String(v);
}

export function percent(v: number | undefined, digits = 1): string {
  return `${((v ?? 0) * 100).toFixed(digits)}%`;
}

export const ROLE_LABELS: Record<string, string> = {
  shop_owner: '认证店主',
  manufacturer: '认证厂家',
  landmark: '地标大店',
  lecturer: '内容讲师',
  admin: '平台运营',
};

export const CERT_LABELS: Record<string, string> = {
  none: '未认证',
  pending: '审核中',
  approved: '已认证',
  rejected: '已驳回',
};

export const AUDIT_STATUS_LABELS: Record<string, string> = {
  auto_pass: '自动通过',
  auto_reject: '自动拦截',
  manual_pending: '待人工复审',
  manual_pass: '人工通过',
  manual_reject: '人工驳回',
};

export const BIZ_LABELS: Record<string, string> = {
  article: '资讯内容',
  comment: '评论',
  product: '厂家款',
  image: '图片',
  text: '文本',
};

/** 简易柱状图数据（把数值数组归一化到 0-100 便于 width%） */
export function toBars(values: number[]): number[] {
  const max = Math.max(1, ...values);
  return values.map((v) => Math.round((v / max) * 100));
}
