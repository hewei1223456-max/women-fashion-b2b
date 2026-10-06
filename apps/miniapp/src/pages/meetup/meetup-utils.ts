import type { Meetup, MeetupKind } from '@wfb/shared-types';
import { MEETUP_KINDS, MEETUP_KIND_LABELS } from '@wfb/shared-types';
import { api } from '@/services/request';

/* =========================================================================
 * 组局（参考「闪动」）的展示口径 —— 首页横滑条 / 组局广场 / 组局详情共用，
 * 保证三个入口对「时间、地点、集合点、报名方式、报名条件」的文案完全一致。
 * ========================================================================= */

export const KIND_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: '全部' },
  ...MEETUP_KINDS.map((k) => ({ key: k as string, label: MEETUP_KIND_LABELS[k] })),
];

/** 活动形态色标：一起去拿货(蓝) / 一起做货(橙) / 一起学习(绿) / 同业交流(紫) */
export const KIND_COLORS: Record<MeetupKind, string> = {
  sourcing: '#2b4acb',
  production: '#ff6b35',
  study: '#12b76a',
  exchange: '#7a4dd8',
};

export function kindColor(kind?: MeetupKind | string): string {
  return KIND_COLORS[kind as MeetupKind] ?? '#2b4acb';
}

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

/* =========================================================================
 * 倒计时（闪动式：距开局 X 天 X 小时 / 进行中 / 已结束）
 * ========================================================================= */

export type MeetupPhase = 'upcoming' | 'ongoing' | 'ended' | 'cancelled';

/** 倒计时只需要时间与状态；字段可能为空的场景（列表卡/详情未加载）也兼容 */
export interface MeetupTimeLike {
  startAt?: string;
  endAt?: string;
  status?: Meetup['status'];
}

/** 活动所处阶段：已取消 > 已结束 > 进行中 > 未开始 */
export function meetupPhase(m: MeetupTimeLike, now = Date.now()): MeetupPhase {
  if (m.status === 'cancelled') return 'cancelled';
  const s = new Date(m.startAt ?? '').getTime();
  const e = new Date(m.endAt ?? '').getTime();
  if (Number.isFinite(e) && now > e) return 'ended';
  if (Number.isFinite(s) && now >= s) return 'ongoing';
  return 'upcoming';
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** 毫秒差 → 天/时/分/秒 */
export function countdownParts(ms: number): CountdownParts {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** 「2 天 3 小时」/「3 小时 20 分」/「20 分 30 秒」 */
export function durationText(ms: number): string {
  const { days, hours, minutes, seconds } = countdownParts(ms);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  if (minutes > 0) return `${minutes} 分 ${seconds} 秒`;
  return `${seconds} 秒`;
}

export interface CountdownInfo {
  phase: MeetupPhase;
  /** 单行文案：距开局 2 天 3 小时 / 进行中 · 还剩 1 小时 20 分 / 已结束 */
  text: string;
  /** 倒计时目标（未开始=startAt，进行中=endAt），用于四宫格展示 */
  targetAt?: string;
}

export function countdownInfo(m: MeetupTimeLike, now = Date.now()): CountdownInfo {
  const phase = meetupPhase(m, now);
  if (phase === 'cancelled') return { phase, text: '已取消' };
  if (phase === 'ended') return { phase, text: '已结束' };
  if (phase === 'ongoing') {
    const end = new Date(m.endAt ?? '').getTime();
    if (!Number.isFinite(end)) return { phase, text: '进行中' };
    return { phase, text: `进行中 · 还剩 ${durationText(end - now)}`, targetAt: m.endAt };
  }
  const start = new Date(m.startAt ?? '').getTime();
  if (!Number.isFinite(start)) return { phase, text: '时间待定' };
  return { phase, text: `距开局 ${durationText(start - now)}`, targetAt: m.startAt };
}

/* =========================================================================
 * 列表筛选：时间范围 / 费用类型
 * ========================================================================= */

export const TIME_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: '时间不限' },
  { key: 'upcoming', label: '未开始' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
];

export const FEE_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: '费用不限' },
  { key: 'free', label: '免费' },
  { key: 'aa', label: 'AA 制' },
  { key: 'paid', label: '收费' },
];

export type FeeType = 'free' | 'aa' | 'paid';

/** 费用归类：空 / 含「免费」= 免费；含 AA / 均摊 / 分摊 = AA；其余 = 收费 */
export function feeTypeOf(fee?: string): FeeType {
  const f = String(fee ?? '').trim();
  if (!f || /免费|不用钱|自理/.test(f)) return 'free';
  if (/AA|aa|Aa|均摊|分摊|平摊/.test(f)) return 'aa';
  return 'paid';
}

function startOfWeek(d: Date): number {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (copy.getDay() + 6) % 7; // 周一为一周起点
  copy.setDate(copy.getDate() - day);
  return copy.getTime();
}

/** 时间范围筛选：已结束的活动不算「本周 / 本月」（仍在进行中的算） */
export function inTimeRange(m: Pick<Meetup, 'startAt' | 'endAt'>, range: string, now = Date.now()): boolean {
  if (!range || range === 'all') return true;
  const s = new Date(m.startAt ?? '').getTime();
  if (!Number.isFinite(s)) return false;
  const e = new Date(m.endAt ?? m.startAt ?? '').getTime();
  if (range === 'upcoming') return s >= now;
  if (Number.isFinite(e) && e < now) return false;
  const today = new Date(now);
  if (range === 'week') {
    const weekStart = startOfWeek(today);
    const weekEnd = weekStart + 7 * 86_400_000;
    return s >= weekStart && s < weekEnd;
  }
  if (range === 'month') {
    return new Date(s).getFullYear() === today.getFullYear() && new Date(s).getMonth() === today.getMonth();
  }
  return true;
}

export function inFeeRange(m: Pick<Meetup, 'fee'>, feeType: string): boolean {
  if (!feeType || feeType === 'all') return true;
  return feeTypeOf(m.fee) === feeType;
}

/* =========================================================================
 * 活动流程（agenda）/ 报名留言：后端可能尚未下发，一律宽松读取
 * ========================================================================= */

export interface AgendaItem {
  time: string;
  title: string;
  desc?: string;
}

/** 读取活动流程；后端未下发 / 字段为空时返回 []（调用方不渲染该区块） */
export function agendaOf(m: unknown): AgendaItem[] {
  const raw = (m ?? {}) as Record<string, unknown>;
  const list = Array.isArray(raw.agenda) ? raw.agenda : [];
  return list
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return {
        time: String(row.time ?? row.at ?? '').trim(),
        title: String(row.title ?? row.name ?? '').trim(),
        desc: typeof row.desc === 'string' && row.desc.trim() ? row.desc.trim() : undefined,
      };
    })
    .filter((item) => item.time || item.title);
}

/** 报名留言（attendeeNotes 优先，其次读报名者对象上的 note 字段；发起人的占位留言不展示） */
export function attendeeNoteOf(attendee: unknown, notes?: { userId: number; note: string }[]): string {
  const raw = (attendee ?? {}) as Record<string, unknown>;
  const id = Number(raw.id);
  const fromNotes = Number.isFinite(id) ? notes?.find((n) => n.userId === id)?.note : '';
  const note = String(fromNotes || (typeof raw.note === 'string' ? raw.note : '')).trim();
  if (!note || note === '发起人') return '';
  return note;
}

/** 报名时间（后端下发时展示） */
export function attendeeJoinedAtOf(attendee: unknown): string {
  const raw = (attendee ?? {}) as Record<string, unknown>;
  const at = typeof raw.joinedAt === 'string' ? raw.joinedAt : typeof raw.createdAt === 'string' ? raw.createdAt : '';
  return at;
}

/** 剩余名额文案：不限 / 还剩 N 个名额 / 名额已满 */
export function seatHint(m: Pick<Meetup, 'joinedCount' | 'capacity'>): string {
  const cap = m.capacity ?? 0;
  const joined = m.joinedCount ?? 0;
  if (!cap) return '不限人数';
  const left = Math.max(0, cap - joined);
  return left > 0 ? `还剩 ${left} 个名额` : '名额已满';
}

/** 报名条件匹配提示（不阻断报名，只提示）：条件是「认证店主」而当前用户未认证时给出提醒 */
export function requirementHint(requirement?: string, certStatus?: string, isSelf = false): string {
  if (isSelf) return '';
  const req = String(requirement ?? '');
  if (!req) return '';
  if (/认证/.test(req) && certStatus !== 'approved') {
    return '报名条件要求「已认证」，你当前还未通过认证 —— 仍可报名，但发起人可能优先通过已认证同行。';
  }
  if (/实体店|门店|档口/.test(req) && certStatus === 'none') {
    return '报名条件提到实体店 / 门店，请在报名留言里说明你的店铺情况，方便发起人确认。';
  }
  return '';
}

/** 组局分享链接（Demo 域名，用于复制链接） */
export function meetupShareUrl(id: number): string {
  return `https://wfb.demo/meetup/${id}`;
}

/**
 * 报名（带留言）。
 * 后端 `POST /api/meetup/join/:id` 已支持 note（写入 meetupSignups.note，
 * 组织者能在报名名单里看到），客户端签名 `api.meetup.join(id, note?)` 同步就绪。
 */
export function joinMeetupWithNote(id: number, note?: string): Promise<Meetup> {
  const text = String(note ?? '').trim();
  return api.meetup.join(id, text || undefined);
}
