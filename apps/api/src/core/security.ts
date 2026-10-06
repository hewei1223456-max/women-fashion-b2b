import crypto from 'node:crypto';
import type { User, UserBadge } from '@wfb/shared-types';
import { BADGE_LABELS, BADGE_TONES } from '@wfb/shared-types';

/* =========================================================================
 * 零依赖 JWT（HS256）+ 密码哈希 + 用户脱敏
 * 与 @nestjs/jwt 行为一致：header.payload.signature，7 天过期。
 * ========================================================================= */

const SECRET = process.env.JWT_SECRET || 'wfb-dev-secret-change-me';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf8');
}

/** '7d' / '12h' / '30m' / 纯数字秒 → 毫秒 */
export function parseDuration(v: string): number {
  const m = /^(\d+)([smhd])?$/.exec(v.trim());
  if (!m) return 7 * 86_400_000;
  const n = Number(m[1]);
  switch (m[2]) {
    case 's':
      return n * 1000;
    case 'm':
      return n * 60_000;
    case 'h':
      return n * 3_600_000;
    default:
      return n * 86_400_000;
  }
}

export interface JwtPayload {
  sub: number;
  role: string;
  iat: number;
  exp: number;
}

export function signToken(user: Pick<User, 'id' | 'role'>): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({ sub: user.id, role: user.role, iat: now, exp: now + Math.floor(parseDuration(EXPIRES_IN) / 1000) } satisfies JwtPayload),
  );
  const signature = b64url(crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${signature}`;
}

/** 校验签名与过期时间；失败返回 null（不抛异常，交给守卫决定） */
export function verifyToken(token: string): JwtPayload | null {
  if (!token || token.split('.').length !== 3) return null;
  const [header, payload, signature] = token.split('.');
  const expected = b64url(crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest());
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(payload)) as JwtPayload;
    if (parsed.exp * 1000 < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 密码哈希（scrypt，无第三方依赖） */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(password, salt, 32).toString('hex');
  return calc.length === hash.length && crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash));
}

/* ------------------------------ 用户脱敏 ------------------------------ */

/** 付费店主等级 */
const PAID_OWNER_LEVELS = new Set(['elite', 'shark', 'tour']);
/** 付费厂家等级 */
const PAID_MANUFACTURER_LEVELS = new Set(['manufacturer_basic', 'manufacturer_pro', 'manufacturer_enterprise']);

/**
 * 计算用户身份标识。
 *
 * 用户明确要求「认证店主/付费店主/付费厂家/免费厂家/游客都要有各自的标识」，
 * 所以这里把「认证」与「付费」拆成两个独立维度：
 *   认证 = certStatus === 'approved'，付费 = memberLevel 命中付费等级。
 * 两者可叠加（蓝 + 金），前端按 BADGE_TONES 上色。
 */
export function buildBadges(u: Pick<User, 'role' | 'certStatus' | 'memberLevel'>): UserBadge[] {
  const badges: UserBadge[] = [];
  const push = (key: UserBadge['key']) => {
    badges.push({ key, label: BADGE_LABELS[key], tone: BADGE_TONES[key] });
  };

  if (u.role === 'admin') {
    push('official');
    return badges;
  }
  if (u.role === 'landmark') {
    push('landmark');
    if (u.certStatus === 'approved') push('certified_owner');
    return badges;
  }
  if (u.role === 'lecturer') {
    push('lecturer');
    return badges;
  }

  const certified = u.certStatus === 'approved';
  if (u.role === 'manufacturer') {
    if (certified) push('certified_manufacturer');
    if (PAID_MANUFACTURER_LEVELS.has(u.memberLevel)) push('paid_manufacturer');
    // 免费版厂家：已认证但未付费 → 只显示「认证厂家」；两者都没有才算游客
  } else {
    if (certified) push('certified_owner');
    if (PAID_OWNER_LEVELS.has(u.memberLevel)) push('paid_owner');
  }

  if (badges.length === 0) push('guest');
  return badges;
}

/** 从昵称里尽量抽出展示名与城市（种子数据形如「杭州·小满家（主理人）」） */
export function parseDisplayName(u: Pick<User, 'nickname' | 'role' | 'companyName'>): { displayName?: string; city?: string } {
  const raw = u.nickname.replace(/（.*?）|\(.*?\)/g, '').trim();
  const parts = raw.split(/[·・]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { displayName: raw, city: parts[0] };
  return { displayName: u.companyName ?? raw, city: undefined };
}

/** 对外暴露的用户信息：剔除手机号、openid、营业执照、身份证等敏感字段 */
export function toUserBrief(u: User | undefined | null, extra: Record<string, unknown> = {}) {
  if (!u) {
    return {
      id: 0,
      nickname: '未知用户',
      avatarUrl: '',
      role: 'shop_owner' as const,
      certStatus: 'none' as const,
      memberLevel: 'free' as const,
      styleTags: [],
      badges: buildBadges({ role: 'shop_owner', certStatus: 'none', memberLevel: 'free' }),
      ...extra,
    };
  }
  const { displayName, city } = parseDisplayName(u);
  return {
    id: u.id,
    nickname: u.nickname,
    avatarUrl: u.avatarUrl,
    role: u.role,
    certStatus: u.certStatus,
    memberLevel: u.memberLevel,
    companyName: u.companyName,
    bio: u.bio,
    styleTags: u.styleTags ?? [],
    badges: buildBadges(u),
    displayName,
    city,
    shopName: u.companyName,
    ...extra,
  };
}

/** 完整用户信息仅返回给本人（登录 / /auth/me） */
export function stripPrivate(u: User, isSelf: boolean): User {
  if (isSelf) return u;
  const { phone, wxOpenid, dyOpenid, aliOpenid, certLicenseUrl, certOcrData, ...rest } = u;
  return rest as User;
}

export function deviceIdOf(header: string | undefined): string {
  if (!header) return 'anonymous';
  return crypto.createHash('sha1').update(header).digest('hex').slice(0, 16);
}
