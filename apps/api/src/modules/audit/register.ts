import type { Store } from '../../core/db';
import type { Router } from '../../core/server';
import { Errors } from '../../core/server';
import { applyCallback, auditText, listAuditQueue, parseCallback, reviewAuditLog, verifyWechatSignature } from './service';

/* =========================================================================
 * 内容安全审核模块控制器（docs/API.md 第 14 节）
 *   POST /api/audit/content   [公开] 同步文本审核
 *   GET  /api/audit/queue           人工复审队列
 *   POST /api/audit/review          复审结论（回写被审内容 auditStatus）
 *   POST /api/audit/callback  [公开] 微信 mediaCheckAsync / msgSecCheck V2 回调
 *   GET  /api/audit/callback  [公开] 微信服务器 URL 校验（回显 echostr）
 * ========================================================================= */

const AUDIT_ACTIONS = ['pass', 'reject'] as const;
const REVIEW_STATUSES = ['auto_pass', 'auto_reject', 'manual_pending', 'manual_pass', 'manual_reject'] as const;

export function registerAuditModule(router: Router, store: Store) {
  router.post(
    '/api/audit/content',
    (ctx) => {
      const text = ctx.str('text', { required: true, max: 20000 });
      const scene = ctx.str('scene', { fallback: 'default' });
      const bizType = ctx.str('bizType') || scene;
      const bizId = ctx.num('bizId', { fallback: 0 });
      // 契约：{ pass, reason, hitWords, source }；其余为 Demo 联调所需的附加字段
      return auditText(store, {
        text,
        scene,
        bizType,
        bizId,
        contentId: bizId || undefined,
        contentUrl: ctx.str('contentUrl') || undefined,
        mediaTaskId: ctx.str('mediaTaskId') || undefined,
        userId: ctx.user?.id,
      });
    },
    { auth: false, summary: '同步文本审核（敏感词库 + 正则模式 + mock 供应商）' },
  );

  router.get(
    '/api/audit/queue',
    (ctx) => {
      const { page, pageSize } = ctx.pagination(10, 50);
      const reviewStatus = ctx.str('reviewStatus');
      if (reviewStatus && !(REVIEW_STATUSES as readonly string[]).includes(reviewStatus)) {
        throw Errors.badRequest(`reviewStatus 只能是 ${REVIEW_STATUSES.join(' / ')}`);
      }
      return listAuditQueue(store, {
        reviewStatus: reviewStatus || undefined,
        bizType: ctx.str('bizType') || undefined,
        page,
        pageSize,
      });
    },
    { summary: '人工复审队列（reviewStatus / bizType 过滤）' },
  );

  router.post(
    '/api/audit/review',
    (ctx) => {
      const auditLogId = ctx.num('auditLogId', { required: true, min: 1 });
      const action = ctx.str('action', { required: true });
      if (!(AUDIT_ACTIONS as readonly string[]).includes(action)) throw Errors.badRequest('action 只能是 pass / reject');
      const reason = ctx.str('reason', { max: 200 });
      return reviewAuditLog(store, {
        auditLogId,
        action: action as (typeof AUDIT_ACTIONS)[number],
        reason: reason || undefined,
        reviewerId: ctx.user?.id,
      });
    },
    { summary: '复审结论（pass / reject，回写被审内容 auditStatus 并发通知）' },
  );

  router.post(
    '/api/audit/callback',
    (ctx) => {
      const query: Record<string, string> = {};
      for (const [k, v] of Object.entries(ctx.query)) query[k] = String(v);
      const parsed = parseCallback(ctx.body ?? {}, query);
      const outcome = applyCallback(store, parsed);
      // 微信侧只关心 HTTP 200；业务结果放在信封里，便于 Demo 观察解析与回写过程
      return {
        ...outcome,
        parsed: {
          encrypted: parsed.encrypted,
          format: parsed.format,
          signatureVerified: parsed.signatureVerified,
          event: parsed.event ?? null,
          msgType: parsed.msgType ?? null,
          traceId: parsed.traceId ?? null,
          suggest: parsed.suggest ?? null,
          label: parsed.label ?? null,
          errcode: parsed.errcode ?? null,
        },
      };
    },
    { auth: false, summary: '微信内容安全回调（支持明文 JSON/XML 与 AES 加密体）' },
  );

  router.get(
    '/api/audit/callback',
    (ctx) => {
      const echostr = ctx.str('echostr');
      if (!echostr) throw Errors.badRequest('缺少 echostr');
      const signature = ctx.str('signature');
      const timestamp = ctx.str('timestamp');
      const nonce = ctx.str('nonce');
      if (signature && timestamp && nonce && !verifyWechatSignature(signature, timestamp, nonce)) {
        throw Errors.forbidden('微信签名校验失败');
      }
      // 微信要求原样回显 echostr（纯文本），不能包信封，否则 URL 校验不通过
      ctx.raw(200, echostr);
      return null;
    },
    { auth: false, summary: '微信服务器 URL 校验（原样回显 echostr）' },
  );
}
