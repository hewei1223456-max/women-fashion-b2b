import type { User } from '@wfb/shared-types';
import { TOOLS, TOOL_FREE_QUOTA } from '@wfb/shared-types';
import { Errors } from '../core/server';
import { dateKey } from './platform';

/* =========================================================================
 * 功能板块免费额度（PRD 第十二篇 / 10.5）
 *
 * 计数维度：用户 + 工具 + 日期（进程内 Map —— Redis 缺失时的降级实现，
 * 与 docs/API.md 第 16 节的降级说明一致）。
 *   -1 = 不限次（提词器）
 *    0 = 会员专属（账号诊断 / 视频剪辑 / 运营建议）：免费用户直接 429
 *   >0 = 每日免费次数，超限 429
 * ========================================================================= */

const usage = new Map<string, number>();

const MEMBER_QUOTA = -1;

function keyOf(date: string, userId: number, tool: string): string {
  return `${date}|${userId}|${tool}`;
}

/** 付费会员（含厂家版本 / 店主人分层 / 平台运营） */
export function isPaidMember(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.memberLevel !== 'free';
}

/** 该工具对该用户的当日额度（-1 不限） */
export function limitFor(tool: string, user: User | null | undefined): number {
  const free = TOOL_FREE_QUOTA[tool];
  if (free === undefined) return 0;
  if (free === 0 && isPaidMember(user)) return MEMBER_QUOTA;
  return free;
}

export function usedOf(tool: string, userId: number, date: string = dateKey()): number {
  return usage.get(keyOf(date, userId, tool)) ?? 0;
}

export interface QuotaState {
  tool: string;
  /** 本次调用后今日已用次数 */
  used: number;
  /** 每日额度，-1 = 不限 */
  limit: number;
}

/**
 * 校验并记账。超限抛 Errors.quota()（code=429）。
 * 会员专属工具对免费用户给出更明确的提示，但仍然复用 429。
 */
export function consumeQuota(tool: string, user: User | null | undefined): QuotaState {
  const uid = user?.id ?? 0;
  const limit = limitFor(tool, user);
  const used = usedOf(tool, uid);
  if (limit === 0) {
    const meta = TOOLS.find((t) => t.key === tool);
    throw Errors.quota(`${meta?.name ?? tool}为会员专属功能，开通会员后可无限使用`);
  }
  if (limit > 0 && used >= limit) {
    throw Errors.quota('今日免费额度已用完，开通会员可无限使用');
  }
  const next = used + 1;
  usage.set(keyOf(dateKey(), uid, tool), next);
  return { tool, used: next, limit };
}

/** 只读额度视图（不记账、不抛错） */
export function quotaView(tool: string, user: User | null | undefined): QuotaState & { remaining: number; locked: boolean } {
  const uid = user?.id ?? 0;
  const limit = limitFor(tool, user);
  const used = usedOf(tool, uid);
  return {
    tool,
    used,
    limit,
    remaining: limit < 0 ? -1 : Math.max(0, limit - used),
    locked: limit === 0,
  };
}

export interface ToolQuotaRow {
  key: string;
  name: string;
  desc: string;
  icon: string;
  path: string;
  memberOnly: boolean;
  used: number;
  limit: number;
  remaining: number;
  locked: boolean;
  /** 结果是否由真实 AI 生成（未配置 Key 时一律 false） */
  aiPowered: boolean;
}

/** GET /api/tools/quota：今日各工具用量列表 */
export function quotaOverview(user: User | null | undefined, aiPowered: boolean) {
  const date = dateKey();
  const list: ToolQuotaRow[] = TOOLS.map((t) => {
    const v = quotaView(t.key, user);
    return {
      key: t.key,
      name: t.name,
      desc: t.desc,
      icon: t.icon,
      path: t.path,
      memberOnly: t.memberOnly,
      used: v.used,
      limit: v.limit,
      remaining: v.remaining,
      locked: v.locked,
      aiPowered,
    };
  });
  return { date, userId: user?.id ?? 0, memberLevel: user?.memberLevel ?? 'free', list };
}

/** 测试/重置用 */
export function resetQuota() {
  usage.clear();
}

/** 当日总用量 */
export function totalUsedToday(userId: number): number {
  const d = dateKey();
  let sum = 0;
  for (const [k, v] of usage) {
    if (k.startsWith(`${d}|${userId}|`)) sum += v;
  }
  return sum;
}
