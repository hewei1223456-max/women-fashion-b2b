import type { BuyerPreference, CertifyDto, LoginDto } from '@wfb/shared-types';
import {
  CONTENT_INTERESTS,
  LEARN_TARGETS,
  MANUFACTURER_NEEDS,
  SOURCING_NEEDS,
} from '@wfb/shared-types';
import type { Router } from '../../core/server';
import { Errors } from '../../core/server';
import type { Store } from '../../core/db';
import { signToken, stripPrivate } from '../../core/security';
import { registerProfileModule } from '../profile/register';
import { applyCertify, buildCertifyResult, demoAccounts, login } from './service';

/* =========================================================================
 * 认证控制器（docs/API.md 第 2 节）
 *   [公开] GET  /api/auth/demo-accounts
 *   [公开] POST /api/auth/login      支持 demoUserId / phone+code / platform+loginCode
 *          GET  /api/auth/me
 *          POST /api/auth/logout
 *          POST /api/auth/certify
 *          GET  /api/auth/certify/status
 *
 * 个人主页模块随认证模块一起挂载（registerProfileModule，见 docs/API.md 第 3 节），
 * 保证「登录 → 认证 → 个人主页」这条主链路在一个模块内闭环。
 * ========================================================================= */

export function registerAuthModule(router: Router, store: Store) {
  router.get('/api/auth/demo-accounts', () => demoAccounts(store), {
    auth: false,
    summary: '演示账号列表（已脱敏：不含手机号 / openid / 营业执照）',
  });

  router.post(
    '/api/auth/login',
    (ctx) => {
      const rawDemo = ctx.body.demoUserId ?? ctx.query.demoUserId;
      const demoUserId = rawDemo === undefined || rawDemo === null || rawDemo === '' ? undefined : Number(rawDemo);
      if (demoUserId !== undefined && !Number.isFinite(demoUserId)) throw Errors.badRequest('demoUserId 必须是数字');

      const dto: LoginDto = {
        demoUserId,
        phone: ctx.str('phone'),
        code: ctx.str('code'),
        platform: (ctx.str('platform') || undefined) as LoginDto['platform'],
        loginCode: ctx.str('loginCode'),
        nickname: ctx.str('nickname'),
      };
      return login(store, dto);
    },
    { auth: false, summary: '登录（demoUserId / phone+code / platform+loginCode 三通道）' },
  );

  router.get('/api/auth/me', (ctx) => ctx.auth(), { summary: '当前登录用户（本人完整信息）' });

  router.post('/api/auth/logout', () => ({ ok: true, loggedOutAt: new Date().toISOString() }), { summary: '退出登录' });

  router.post(
    '/api/auth/certify',
    (ctx) => {
      const user = ctx.auth();
      /* 字段存在即视为「请求推进该步」（faceVerifyId 允许空串 = 由后端生成 mock 流水号） */
      const present = (k: string) =>
        Object.prototype.hasOwnProperty.call(ctx.body, k) && ctx.body[k] !== undefined && ctx.body[k] !== null;
      const dto: CertifyDto = {
        role: ctx.str('role', { required: true }) as CertifyDto['role'],
        companyName: ctx.str('companyName', { required: true, max: 60 }),
        licenseUrl: ctx.str('licenseUrl', { required: true, max: 500 }),
        legalName: ctx.str('legalName'),
        idCardFrontUrl: ctx.str('idCardFrontUrl'),
        idCardBackUrl: ctx.str('idCardBackUrl'),
        /* 带 faceVerifyId 字段（哪怕空串）= 请求做人脸核验，空串时后端生成 mock 流水号 */
        faceVerifyId: present('faceVerifyId')
          ? ctx.str('faceVerifyId') || `FACE-MOCK-${Date.now().toString(36).toUpperCase()}`
          : undefined,
        bankAmount: present('bankAmount') && ctx.body.bankAmount !== '' ? Number(ctx.body.bankAmount) : undefined,
        styleTags: ctx.arr<string>('styleTags') as CertifyDto['styleTags'],
        priceBand: ctx.str('priceBand'),
        sourcingCities: ctx.arr<string>('sourcingCities'),
      };
      /* 营业执照 URL 必须是可访问的图片地址（Demo 允许 http/https 或 /uploads 本地降级路径） */
      if (!/^(https?:\/\/|\/uploads\/)/.test(dto.licenseUrl)) {
        throw Errors.badRequest('licenseUrl 必须是图片地址（http(s):// 或 /uploads/）');
      }
      return applyCertify(store, user, dto);
    },
    { summary: '提交认证（营业执照 OCR → 法人身份证 → 人脸核验 → 对公打款，四步流转）' },
  );

  router.get('/api/auth/certify/status', (ctx) => buildCertifyResult(ctx.auth()), { summary: '认证进度与步骤' });

  /* ------------------ 偏好画像（登录引导最后一步） ------------------ */
  /** 提交「想跟谁学 / 想看什么内容 / 想要什么货源 / 想要什么厂家」，作为冷启动推荐画像 */
  router.post(
    '/api/auth/preference',
    (ctx) => {
      const user = ctx.auth();
      const pref = {
        learnFrom: ctx.arr<string>('learnFrom').filter((x) => (LEARN_TARGETS as readonly string[]).includes(x)),
        contentInterests: ctx.arr<string>('contentInterests').filter((x) => (CONTENT_INTERESTS as readonly string[]).includes(x)),
        sourcingNeeds: ctx.arr<string>('sourcingNeeds').filter((x) => (SOURCING_NEEDS as readonly string[]).includes(x)),
        manufacturerNeeds: ctx.arr<string>('manufacturerNeeds').filter((x) =>
          (MANUFACTURER_NEEDS as readonly string[]).includes(x),
        ),
      } as BuyerPreference;
      const total =
        pref.learnFrom.length + pref.contentInterests.length + pref.sourcingNeeds.length + pref.manufacturerNeeds.length;
      if (total === 0) throw Errors.badRequest('请至少选择一项偏好');
      store.buyerPreferences.set(user.id, { id: user.id, userId: user.id, ...pref, updatedAt: new Date().toISOString() });
      return { ok: true, preference: pref };
    },
    { summary: '提交新用户偏好画像' },
  );

  router.get(
    '/api/auth/preference',
    (ctx) => ({ preference: store.buyerPreferences.get(ctx.auth().id) ?? null }),
    { summary: '读取当前用户偏好画像' },
  );

  /* ------------------ 视角切换（Demo 专用） ------------------ */
  /**
   * 一键切换演示身份，返回新的 token + user。
   * 用途：用户明确要求「可以直接在上面切换视角」来对比店主端与厂家端。
   * 生产环境应删除此接口（正式的多身份切换需要绑定多个主体并做权限校验）。
   */
  router.post(
    '/api/auth/switch',
    (ctx) => {
      const targetId = ctx.num('demoUserId', { required: true });
      const target = store.users.get(targetId);
      if (!target) throw Errors.notFound('目标账号不存在');
      if (target.role === 'admin' && ctx.auth().role !== 'admin') {
        throw Errors.forbidden('普通用户不能切换到运营账号');
      }
      return {
        token: signToken(target),
        user: stripPrivate(target, true),
        isNew: false,
      };
    },
    { summary: '切换演示身份（返回新 token 与用户信息）' },
  );

  /* 个人主页路由随本模块挂载 */
  registerProfileModule(router, store);
}
