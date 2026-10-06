import type { Meetup, MeetupKind } from '@wfb/shared-types';
import { MEETUP_KINDS, MEETUP_KIND_LABELS } from '@wfb/shared-types';

/* =========================================================================
 * 组局（参考「闪动」）的展示口径 —— 首页横滑条 / 组局广场 / 组局详情共用，
 * 保证三个入口对「时间、地点、集合点、报名方式、报名条件」的文案完全一致。
 * ========================================================================= */

export const KIND_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: '全部' },
  ...MEETUP_KINDS.map((k) => ({ key: k as string, label: MEETUP_KIND_LABELS[k] })),
];

/** 组局城市候选：拿货产业带 + 常见同行城市 */
export const MEETUP_CITIES = ['广州', '杭州', '深圳', '东莞', '上海', '湖州', '北京', '成都', '武汉', '郑州'];

/** 可选拿货地（产业带），与货源模块的 MARKETS 对齐 */
export const MEETUP_MARKETS = ['十三行', '南油', '意法', '濮院', '沙河', '白马', '四季青', '虎门'];

const WEEK_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function kindLabel(kind?: MeetupKind | string): string {
  if (!kind) return '组局';
  return MEETUP_KIND_LABELS[kind as MeetupKind] ?? '组局';
}

/** 「10-08 周三 09:30」；跨年时带年份 */
export function meetupDateTime(iso?: string): string {
  if (!iso) return '时间待定';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '时间待定';
  const now = new Date();
  const year = d.getFullYear() === now.getFullYear() ? '' : `${d.getFullYear()}-`;
  return `${year}${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${WEEK_LABELS[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 时间区间：同一天只写一次日期 */
export function meetupRange(startAt?: string, endAt?: string): string {
  if (!startAt) return '时间待定';
  const s = new Date(startAt);
  const e = endAt ? new Date(endAt) : null;
  if (Number.isNaN(s.getTime())) return '时间待定';
  if (!e || Number.isNaN(e.getTime())) return meetupDateTime(startAt);
  const sameDay = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();
  return `${meetupDateTime(startAt)} → ${sameDay ? `${pad(e.getHours())}:${pad(e.getMinutes())}` : meetupDateTime(endAt)}`;
}

/** 报名进度文案：0 上限 = 不限人数 */
export function seatText(m: Pick<Meetup, 'joinedCount' | 'capacity'>): string {
  const joined = m.joinedCount ?? 0;
  const cap = m.capacity ?? 0;
  if (!cap) return `已报名 ${joined} 人 · 不限人数`;
  return `已报名 ${joined}/${cap} 人`;
}

/** 距离成局还差几人（0 表示已满 / 不限） */
export function remainingSeats(m: Pick<Meetup, 'joinedCount' | 'capacity'>): number {
  const cap = m.capacity ?? 0;
  if (!cap) return 0;
  return Math.max(0, cap - (m.joinedCount ?? 0));
}

export function meetupStatus(m: Pick<Meetup, 'status' | 'capacity' | 'joinedCount' | 'endAt'>): { text: string; tone: 'brand' | 'accent' | 'gray' } {
  const ended = m.endAt ? new Date(m.endAt).getTime() < Date.now() : false;
  if (m.status === 'cancelled') return { text: '已取消', tone: 'gray' };
  if (m.status === 'ended' || ended) return { text: '已结束', tone: 'gray' };
  const cap = m.capacity ?? 0;
  if (m.status === 'full' || (cap > 0 && (m.joinedCount ?? 0) >= cap)) return { text: '已满员', tone: 'accent' };
  return { text: '报名中', tone: 'brand' };
}

/** 互动格式化：组局详情底部与卡片共用 */
export function shortVenue(city?: string, venue?: string): string {
  return [city, venue].filter(Boolean).join(' · ') || '地点待定';
}
