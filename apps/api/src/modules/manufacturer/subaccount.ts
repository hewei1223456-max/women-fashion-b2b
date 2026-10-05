import type { CreateSubAccountDto, SubAccount, User } from '@wfb/shared-types';
import { planOf } from '@wfb/shared-types';
import type { SubAccountRow, Store } from '../../core/db';
import { all, nextId } from '../../core/db';
import { Errors, type Router } from '../../core/server';

/* =========================================================================
 * 厂家子账号管理（docs/API.md 第 7 节）
 *
 *   GET    /api/manufacturer/sub-account/list    → SubAccount[]
 *   POST   /api/manufacturer/sub-account/create  → SubAccount（受版本 subAccounts 配额限制）
 *   DELETE /api/manufacturer/sub-account/:id     → { ok: true }
 *
 * 配额口径与前端共用 packages/shared-types 的 MANUFACTURER_PLANS（planOf）：
 *   免费版 0 / 基础版 1 / 高级版 3 / 企业版 -1（不限）
 * 超限一律 Errors.forbidden（HTTP 403），前端据此弹出「升级版本」引导。
 * 本文件按任务 write scope 单文件交付：路由 + 业务逻辑同文件，均为纯函数（不碰 ctx）。
 * ========================================================================= */

const SUB_ROLES = ['sales', 'operation', 'admin'] as const;

export function registerSubAccountModule(router: Router, store: Store) {
  router.get('/api/manufacturer/sub-account/list', (ctx) => listSubAccounts(store, ctx.role('manufacturer').id), {
    summary: '子账号列表（配额口径见 MANUFACTURER_PLANS.subAccounts）',
  });

  router.post(
    '/api/manufacturer/sub-account/create',
    (ctx) => {
      const owner = ctx.role('manufacturer');
      const nickname = ctx.str('nickname', { required: true, max: 20 });
      const phone = ctx.str('phone', { required: true, max: 20 });
      const role = ctx.str('role', { required: true });
      if (!/^1\d{10}$/.test(phone)) throw Errors.badRequest('手机号格式不正确');
      if (!(SUB_ROLES as readonly string[]).includes(role)) throw Errors.badRequest(`role 仅支持 ${SUB_ROLES.join(' / ')}`);
      const dto: CreateSubAccountDto = { nickname, phone, role: role as CreateSubAccountDto['role'] };
      return createSubAccount(store, owner, dto);
    },
    { summary: '创建子账号（超出当前版本子账号数返回 403）' },
  );

  router.del(
    '/api/manufacturer/sub-account/:id',
    (ctx) => removeSubAccount(store, ctx.role('manufacturer').id, ctx.num('id', { required: true, min: 1 })),
    { summary: '删除子账号' },
  );
}

/* ------------------------------ 业务逻辑 ------------------------------ */

/** 当前版本还剩几个子账号名额（-1 = 不限） */
export function subAccountQuota(store: Store, manufacturer: User) {
  const plan = planOf(manufacturer.memberLevel);
  const used = all(store.subAccounts).filter((r) => r.manufacturerId === manufacturer.id).length;
  return { plan, used, limit: plan.subAccounts, remaining: plan.subAccounts < 0 ? -1 : Math.max(0, plan.subAccounts - used) };
}

export function listSubAccounts(store: Store, manufacturerId: number): SubAccount[] {
  return all(store.subAccounts)
    .filter((r) => r.manufacturerId === manufacturerId)
    .sort((a, b) => a.id - b.id)
    .map((r) => toSubAccount(store, r));
}

export function createSubAccount(store: Store, owner: User, dto: CreateSubAccountDto): SubAccount {
  const { plan, used, limit } = subAccountQuota(store, owner);
  if (limit >= 0 && used >= limit) {
    throw Errors.forbidden(
      `当前版本「${plan.label}」最多创建 ${limit} 个子账号，升级版本可扩容（子账号是团队协作席位，可用于客服/运营分权）`,
    );
  }

  const existUser = all(store.users).find((u) => u.phone === dto.phone);
  if (existUser && all(store.subAccounts).some((r) => r.subUserId === existUser.id)) {
    throw Errors.conflict('该手机号已绑定为某个厂家的子账号');
  }

  const subUserId = existUser ? existUser.id : createSubUser(store, owner, dto);
  if (existUser) {
    /* 复用已有账号：昵称按厂家的团队展示名更新，主体归属跟随厂家 */
    existUser.nickname = dto.nickname;
    existUser.companyName = existUser.companyName || owner.companyName;
    existUser.updatedAt = new Date().toISOString();
  }

  const id = nextId(store, 'subAccounts');
  const row: SubAccountRow = { id, manufacturerId: owner.id, subUserId, role: dto.role, createdAt: new Date().toISOString() };
  store.subAccounts.set(id, row);
  return toSubAccount(store, row);
}

export function removeSubAccount(store: Store, manufacturerId: number, id: number): { ok: boolean } {
  const row = store.subAccounts.get(id);
  if (!row || row.manufacturerId !== manufacturerId) throw Errors.notFound('子账号不存在');
  /* 只解除绑定，保留用户记录（历史内容 / 私信不孤儿化） */
  store.subAccounts.delete(id);
  return { ok: true };
}

/* ------------------------------ 内部工具 ------------------------------ */

function createSubUser(store: Store, owner: User, dto: CreateSubAccountDto): number {
  const id = nextId(store, 'users');
  const ts = new Date().toISOString();
  store.users.set(id, {
    id,
    phone: dto.phone,
    nickname: dto.nickname,
    avatarUrl: `https://picsum.photos/seed/wfb-sub-${id}/200/200`,
    /* 子账号是团队协作席位，不写个人简介：这样解绑后也不会混进 /api/auth/demo-accounts 的演示身份列表 */
    bio: '',
    role: 'manufacturer',
    certStatus: owner.certStatus === 'approved' ? 'approved' : 'none',
    companyName: owner.companyName,
    styleTags: owner.styleTags ?? [],
    sourcingCities: owner.sourcingCities ?? [],
    memberLevel: owner.memberLevel,
    pushEnabled: false,
    createdAt: ts,
    updatedAt: ts,
  });
  return id;
}

/**
 * SubAccount 契约含 phone：这是厂家自己团队的席位数据（厂家即数据所有者），
 * 不是「把别人的隐私返回给第三方」，因此按契约下发；其余用户信息一律不走这里。
 */
function toSubAccount(store: Store, row: SubAccountRow): SubAccount {
  const u = store.users.get(row.subUserId);
  return {
    id: row.id,
    manufacturerId: row.manufacturerId,
    subUserId: row.subUserId,
    role: row.role,
    nickname: u?.nickname ?? `子账号${row.id}`,
    phone: u?.phone,
    createdAt: row.createdAt,
  };
}
