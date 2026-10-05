import type { ReceivePreference } from '@wfb/shared-types';
import type { Store } from '../../core/db';
import { pageOf } from '../../core/db';
import type { Router } from '../../core/server';
import { Errors } from '../../core/server';
import { dateKey, round } from '../../gateway/platform';
import {
  buildDashboard,
  contactListRows,
  contactMessagesUsedToday,
  ensurePreference,
  logContact,
  preferenceOf,
  sendContactMessage,
} from './service';

/* =========================================================================
 * 加微与厂家看板（docs/API.md 第 7 节）
 * ========================================================================= */

export function registerContactModule(router: Router, store: Store) {
  /* ------------------------------ 店主：加微 ------------------------------ */
  router.post(
    '/api/contact/log',
    (ctx) => {
      const owner = ctx.auth();
      const manufacturerId = ctx.num('manufacturerId', { required: true });
      const productId = ctx.num('productId');
      const articleId = ctx.num('articleId');
      const source = ctx.str('source', { fallback: 'unknown', max: 40 });
      const result = logContact(store, owner, { manufacturerId, productId, articleId, source });
      return {
        ...result,
        // 演示可视化：今天的加微次数与厂家配额
        todayContactCount: [...store.contactLogs.values()].filter(
          (l) => l.shopOwnerId === owner.id && l.contactedAt.slice(0, 10) === new Date().toISOString().slice(0, 10),
        ).length,
      };
    },
    { summary: '记录加微并返回微信号与后续动作建议' },
  );

  /* ------------------------------ 店主：接收偏好 ------------------------------ */
  router.get(
    '/api/contact/preference',
    (ctx) => {
      const user = ctx.auth();
      const p = preferenceOf(store, user.id);
      const pref: ReceivePreference = {
        stylePreferences: p.stylePreferences as never,
        priceBandPreferences: p.priceBandPreferences,
        dailyLimit: p.dailyLimit,
        blacklistManufacturerIds: p.blacklistManufacturerIds,
      };
      return { ...pref, todayReceived: [...store.contactMessages.values()].filter((m) => m.shopOwnerId === user.id && m.sentAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length };
    },
    { summary: '我的接收偏好' },
  );

  router.put(
    '/api/contact/preference',
    (ctx) => {
      const user = ctx.auth();
      const row = ensurePreference(store, user.id);
      if (ctx.body.stylePreferences !== undefined) row.stylePreferences = ctx.arr<string>('stylePreferences');
      if (ctx.body.priceBandPreferences !== undefined) row.priceBandPreferences = ctx.arr<string>('priceBandPreferences');
      if (ctx.body.dailyLimit !== undefined) row.dailyLimit = ctx.num('dailyLimit', { min: 0, max: 100, fallback: row.dailyLimit });
      if (ctx.body.blacklistManufacturerIds !== undefined) {
        row.blacklistManufacturerIds = ctx
          .arr<string>('blacklistManufacturerIds')
          .map((x) => Number(x))
          .filter((n) => Number.isFinite(n));
      }
      return {
        stylePreferences: row.stylePreferences as never,
        priceBandPreferences: row.priceBandPreferences,
        dailyLimit: row.dailyLimit,
        blacklistManufacturerIds: row.blacklistManufacturerIds,
      } satisfies ReceivePreference;
    },
    { summary: '保存接收偏好' },
  );

  /* ------------------------------ 厂家：数据看板 ------------------------------ */
  router.get(
    '/api/manufacturer/contact/dashboard',
    (ctx) => {
      const mf = ctx.role('manufacturer');
      const data = buildDashboard(store, mf);
      return {
        ...data,
        // 附加展示字段（不违反契约，前端可选用）
        todayContacts: [...store.contactLogs.values()].filter((l) => l.manufacturerId === mf.id && l.contactedAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length,
        productCount: [...store.products.values()].filter((p) => p.manufacturerId === mf.id).length,
        plan: mf.memberLevel,
      };
    },
    { summary: '厂家加微数据看板' },
  );

  /* ------------------------------ 厂家：主动私信 ------------------------------ */
  router.post(
    '/api/manufacturer/contact/send',
    (ctx) => {
      const mf = ctx.role('manufacturer');
      const shopOwnerId = ctx.num('shopOwnerId', { required: true });
      const content = ctx.str('content', { required: true, max: 500 });
      const productId = ctx.num('productId');
      return sendContactMessage(store, mf, { shopOwnerId, content, productId });
    },
    { summary: '厂家主动私信（超配额返回 sent:false）' },
  );

  router.get(
    '/api/manufacturer/contact/list',
    (ctx) => {
      const mf = ctx.role('manufacturer');
      const { page, pageSize } = ctx.pagination(10);
      const status = ctx.str('followUpStatus');
      const keyword = ctx.str('keyword');
      const rows = contactListRows(store, mf.id, status, keyword);
      return {
        ...pageOf(rows, page, pageSize),
        stats: {
          total: rows.length,
          pending: rows.filter((r) => r.followUpStatus === 'pending').length,
          contacted: rows.filter((r) => r.followUpStatus === 'contacted').length,
          converted: rows.filter((r) => r.followUpStatus === 'converted').length,
          invalid: rows.filter((r) => r.followUpStatus === 'invalid').length,
          contactRate: round(rows.length ? (rows.filter((r) => r.followUpStatus === 'converted').length / rows.length) * 100 : 0, 1),
        },
      };
    },
    { summary: '加微记录列表' },
  );

  router.put(
    '/api/manufacturer/contact/list/:id',
    (ctx) => {
      const mf = ctx.role('manufacturer');
      const id = ctx.num('id', { required: true });
      const row = store.contactLogs.get(id);
      if (!row) throw Errors.notFound('加微记录不存在');
      if (row.manufacturerId !== mf.id && mf.role !== 'admin') throw Errors.forbidden('只能修改自己的加微记录');
      const status = ctx.str('followUpStatus', { fallback: ctx.str('status') });
      const allowed = ['pending', 'contacted', 'converted', 'invalid'];
      if (!allowed.includes(status)) throw Errors.badRequest(`followUpStatus 必须是 ${allowed.join('/')}`);
      row.followUpStatus = status as typeof row.followUpStatus;
      return { ...row, shopOwner: undefined };
    },
    { summary: '更新加微跟进状态' },
  );

  /* ------------------------------ 厂家：配额概览（看板用） ------------------------------ */
  router.get(
    '/api/manufacturer/contact/quota',
    (ctx) => {
      const mf = ctx.role('manufacturer');
      const dash = buildDashboard(store, mf);
      return { date: dateKey(), ...dash.quota, usedToday: contactMessagesUsedToday(store, mf.id) };
    },
    { summary: '主动私信配额' },
  );
}
