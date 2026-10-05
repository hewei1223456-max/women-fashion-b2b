import { compactNumber } from '@wfb/shared-utils';
import type { CertStatus, UserRole } from '@wfb/shared-types';

/** #RRGGBB → rgba(r,g,b,a)。小程序对 8 位 hex 支持不一致，统一转 rgba */
export function hexToRgba(hex: string, alpha = 1): string {
  const raw = String(hex || '').replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return `rgba(43, 74, 203, ${alpha})`;
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}

/** 大数缩写：12800 → 1.3万 */
export function count(n?: number): string {
  return compactNumber(Number(n ?? 0));
}

export const CERT_LABELS: Record<CertStatus, string> = {
  none: '未认证',
  pending: '认证中',
  approved: '已认证',
  rejected: '认证未通过',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  shop_owner: '店主',
  manufacturer: '厂家',
  landmark: '地标大店',
  lecturer: '讲师',
  admin: '运营',
};

/** 统一错误文案提取（ApiError / Error / 未知） */
export function errMsg(e: unknown, fallback = '加载失败，请稍后重试'): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m) return m;
  }
  if (typeof e === 'string' && e) return e;
  return fallback;
}

/** 是否额度用尽错误（后端返回 code=429） */
export function isQuotaError(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { code?: number }).code === 429;
}

/** 截止倒计时文案：拼单 / 订货会通用 */
export function deadlineText(iso?: string): string {
  if (!iso) return '时间待定';
  const diff = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(diff)) return '时间待定';
  if (diff <= 0) return '已截止';
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `剩 ${Math.max(1, hours)} 小时`;
  return `剩 ${Math.floor(hours / 24)} 天`;
}

/** 认证标识文案：只有已认证 / 认证中才展示徽标 */
export function certBadge(status?: CertStatus): string {
  if (status === 'approved') return '已认证';
  if (status === 'pending') return '认证中';
  return '';
}

/* ============================ 响应形态归一化 ============================
 * 后端部分接口实际返回 { list: [...] } 包装（与 client.ts 声明的数组略有出入），
 * 这里统一兜底，保证 UI 不会因形态差异崩溃。
 * ========================================================================= */

export interface QuotaEntry {
  /** 新版返回 key，声明里是 tool，两者都兼容 */
  tool?: string;
  key?: string;
  name?: string;
  used?: number;
  limit?: number;
  remaining?: number;
  memberOnly?: boolean;
  locked?: boolean;
}

/** 配额返回兼容：数组 或 { list: QuotaEntry[] } */
export function normalizeQuota(data: unknown): QuotaEntry[] {
  if (Array.isArray(data)) return data as QuotaEntry[];
  const list = (data as { list?: unknown } | null | undefined)?.list;
  return Array.isArray(list) ? (list as QuotaEntry[]) : [];
}

/** 按工具 key 取配额项（兼容 tool / key 字段） */
export function quotaOf(list: QuotaEntry[], toolKey: string): QuotaEntry | undefined {
  return list.find((q) => (q.tool ?? q.key) === toolKey);
}

/** 列表返回兼容：T[] 或 Paged<T> / { list: T[] } */
export function asList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const list = (data as { list?: unknown } | null | undefined)?.list;
  return Array.isArray(list) ? (list as T[]) : [];
}
