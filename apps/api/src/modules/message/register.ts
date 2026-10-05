import type { SendMessageDto } from '@wfb/shared-types';
import type { Router } from '../../core/server';
import type { Store } from '../../core/db';
import { getConversation, listConversations, markRead, removeConversation, sendMessage } from './service';

/* =========================================================================
 * 私信模块（docs/API.md 第 10 节上半）
 * ========================================================================= */

function sendDtoOf(ctx: import('../../core/server').Ctx): SendMessageDto {
  return {
    receiverId: ctx.num('receiverId', { required: true }),
    contentType: (ctx.str('contentType', { fallback: 'text' }) || 'text') as SendMessageDto['contentType'],
    content: ctx.str('content', { max: 2000 }),
    productId: ctx.num('productId') || undefined,
  };
}

export function registerMessageModule(router: Router, store: Store) {
  router.get('/api/message/conversations', (ctx) => listConversations(store, ctx.auth().id), {
    summary: '会话列表（带 peer 与未读数）',
  });

  router.get(
    '/api/message/conversation/:id',
    (ctx) => {
      const { page, pageSize } = ctx.pagination(30);
      const paged = ctx.query.page !== undefined || ctx.query.pageSize !== undefined;
      return getConversation(store, ctx.auth().id, ctx.num('id', { required: true }), { page, pageSize, paged });
    },
    { summary: '会话详情 + 消息' },
  );

  router.post('/api/message/send', (ctx) => sendMessage(store, ctx.auth(), sendDtoOf(ctx)), {
    summary: '发消息（text/image/video/product_card）',
  });

  router.put('/api/message/read/:id', (ctx) => markRead(store, ctx.auth().id, ctx.num('id', { required: true })), {
    summary: '标记会话已读',
  });

  router.del('/api/message/conversation/:id', (ctx) => removeConversation(store, ctx.auth().id, ctx.num('id', { required: true })), {
    summary: '删除会话（仅对自己隐藏）',
  });
}
