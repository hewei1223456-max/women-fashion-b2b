import type { Conversation, Message, Product, SendMessageDto, User } from '@wfb/shared-types';
import { precheckText } from '@wfb/shared-utils';
import type { ConversationRow, Store } from '../../core/db';
import { all, nextId } from '../../core/db';
import { Errors } from '../../core/server';
import { toUserBrief } from '../../core/security';
import { nowIso, pushNotification, recordBehavior } from '../notification/service';
import { findFollow } from '../interaction/query';

/* =========================================================================
 * 私信（会话 + 消息）
 *
 * ConversationRow 是「双人会话」：userAId/userBId 固定按 id 升序，
 * unreadA/unreadB 分别是两人的未读数（对外按查看者换算成 Conversation.unreadCount）。
 * 不使用共享契约的字段（每方删除标记）用本地扩展类型承载，不污染 Store 定义。
 * ========================================================================= */

export type ConversationExt = ConversationRow & {
  deletedA?: boolean;
  deletedB?: boolean;
  createdAt?: string;
};

const MESSAGE_TYPES: SendMessageDto['contentType'][] = ['text', 'image', 'video', 'product_card'];
const MAX_MESSAGE_LEN = 2000;

export function isParticipant(row: ConversationRow, userId: number): boolean {
  return row.userAId === userId || row.userBId === userId;
}

export function unreadOf(row: ConversationRow, userId: number): number {
  if (row.userAId === userId) return row.unreadA ?? 0;
  if (row.userBId === userId) return row.unreadB ?? 0;
  return 0;
}

export function isDeletedFor(row: ConversationRow, userId: number): boolean {
  const ext = row as ConversationExt;
  return row.userAId === userId ? !!ext.deletedA : !!ext.deletedB;
}

export function toConversationDto(store: Store, row: ConversationRow, viewerId: number): Conversation {
  const peerId = row.userAId === viewerId ? row.userBId : row.userAId;
  return {
    id: row.id,
    peer: toUserBrief(store.users.get(peerId), { followed: !!findFollow(store, viewerId, peerId) }),
    lastMessage: row.lastMessage,
    lastMessageAt: row.lastMessageAt,
    unreadCount: unreadOf(row, viewerId),
  };
}

/** 会话列表：按最近消息倒序，带 peer 与未读数 */
export function listConversations(store: Store, userId: number): Conversation[] {
  const rows = all(store.conversations)
    .filter((c) => isParticipant(c, userId) && !isDeletedFor(c, userId))
    .sort((a, b) => {
      const ta = new Date(b.lastMessageAt ?? (b as ConversationExt).createdAt ?? 0).getTime();
      const tb = new Date(a.lastMessageAt ?? (a as ConversationExt).createdAt ?? 0).getTime();
      return ta - tb;
    });
  return rows.map((c) => toConversationDto(store, c, userId));
}

/** 会话详情 + 消息。默认返回全部（时间正序）；显式传 page/pageSize 时按「最新一页」返回 */
export function getConversation(
  store: Store,
  userId: number,
  id: number,
  q: { page: number; pageSize: number; paged: boolean },
) {
  const row = store.conversations.get(Number(id));
  if (!row || !isParticipant(row, userId) || isDeletedFor(row, userId)) throw Errors.notFound('会话不存在');
  const messages = all(store.messages)
    .filter((m) => m.conversationId === row.id)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const total = messages.length;
  let list = messages;
  let hasMore = false;
  if (q.paged) {
    const end = Math.max(0, total - (q.page - 1) * q.pageSize);
    const start = Math.max(0, end - q.pageSize);
    list = messages.slice(start, end);
    hasMore = start > 0;
  }
  return { conversation: toConversationDto(store, row, userId), messages: list, page: q.page, pageSize: q.pageSize, total, hasMore };
}

function findOrCreateConversation(store: Store, a: number, b: number): ConversationExt {
  for (const row of store.conversations.values()) {
    const ext = row as ConversationExt;
    if ((ext.userAId === a && ext.userBId === b) || (ext.userAId === b && ext.userBId === a)) return ext;
  }
  const [userAId, userBId] = [a, b].sort((x, y) => x - y);
  const id = nextId(store, 'conversations');
  const row: ConversationExt = {
    id,
    userAId,
    userBId,
    unreadA: 0,
    unreadB: 0,
    unreadCount: 0,
    peer: undefined as never,
    createdAt: nowIso(),
  };
  store.conversations.set(id, row);
  return row;
}

export function sendMessage(store: Store, user: User, dto: SendMessageDto): Message {
  const receiverId = Number(dto.receiverId);
  if (!receiverId) throw Errors.badRequest('缺少参数 receiverId');
  const receiver = store.users.get(receiverId);
  if (!receiver) throw Errors.notFound('接收者不存在');
  if (receiver.id === user.id) throw Errors.badRequest('不能给自己发私信');

  const contentType = (String(dto.contentType ?? 'text').trim() || 'text') as SendMessageDto['contentType'];
  if (!MESSAGE_TYPES.includes(contentType)) throw Errors.badRequest(`contentType 必须是 ${MESSAGE_TYPES.join(' / ')}`);

  let product: Product | undefined;
  let productId = dto.productId ? Number(dto.productId) : undefined;
  if (contentType === 'product_card' || productId) {
    if (!productId) throw Errors.badRequest('product_card 消息必须带 productId');
    const row = store.products.get(productId);
    if (!row) throw Errors.notFound('关联的款不存在');
    product = { ...row, manufacturer: toUserBrief(store.users.get(row.manufacturerId)) };
  }
  let content = String(dto.content ?? '').trim();
  if (!content && product) content = `分享一款：${product.title}`;
  if (!content) throw Errors.badRequest('消息内容不能为空');
  if (content.length > MAX_MESSAGE_LEN) throw Errors.badRequest(`消息内容不能超过 ${MAX_MESSAGE_LEN} 字`);
  const check = precheckText(content);
  if (!check.pass) throw Errors.badRequest(`消息含敏感词：${check.hitWords.join('、')}`);

  const conversation = findOrCreateConversation(store, user.id, receiver.id);
  const id = nextId(store, 'messages');
  const message: Message = {
    id,
    conversationId: conversation.id,
    senderId: user.id,
    receiverId: receiver.id,
    contentType,
    content,
    product,
    isRead: false,
    createdAt: nowIso(),
  };
  store.messages.set(id, message);

  // 会话状态：接收方未读 +1，最近消息摘要更新；被任意一方删除过的会话因新消息重新出现
  if (conversation.userAId === receiver.id) conversation.unreadA = (conversation.unreadA ?? 0) + 1;
  else conversation.unreadB = (conversation.unreadB ?? 0) + 1;
  conversation.lastMessage = contentType === 'product_card' ? `[款卡片] ${content}` : content;
  conversation.lastMessageAt = message.createdAt;
  conversation.unreadCount = Math.max(conversation.unreadA ?? 0, conversation.unreadB ?? 0);
  conversation.deletedA = false;
  conversation.deletedB = false;

  pushNotification(store, {
    userId: receiver.id,
    type: 'message',
    actorId: user.id,
    title: '收到新私信',
    body: `${user.nickname}：${conversation.lastMessage?.slice(0, 40)}`,
    targetId: conversation.id,
  });
  recordBehavior(store, { userId: user.id, action: 'contact', targetType: 'user', targetId: receiver.id, styleTag: receiver.styleTags?.[0] });
  return message;
}

/** 标记已读：:id 既支持会话 id（整会话已读），也支持单条消息 id */
export function markRead(store: Store, userId: number, id: number): { ok: boolean; conversationId: number; marked: number } {
  let row = store.conversations.get(Number(id));
  if (!row || !isParticipant(row, userId)) {
    const msg = store.messages.get(Number(id));
    row = msg ? store.conversations.get(msg.conversationId) : undefined;
  }
  if (!row || !isParticipant(row, userId)) throw Errors.notFound('会话不存在');
  let marked = 0;
  for (const m of store.messages.values()) {
    if (m.conversationId === row.id && m.receiverId === userId && !m.isRead) {
      m.isRead = true;
      marked++;
    }
  }
  if (row.userAId === userId) row.unreadA = 0;
  else row.unreadB = 0;
  row.unreadCount = Math.max(row.unreadA ?? 0, row.unreadB ?? 0);
  return { ok: true, conversationId: row.id, marked };
}

/** 删除会话：仅对当前用户隐藏，对方不受影响；新消息到来时会话重新出现 */
export function removeConversation(store: Store, userId: number, id: number): { ok: boolean } {
  const row = store.conversations.get(Number(id)) as ConversationExt | undefined;
  if (!row || !isParticipant(row, userId)) throw Errors.notFound('会话不存在');
  if (row.userAId === userId) row.deletedA = true;
  else row.deletedB = true;
  return { ok: true };
}

/** 我的私信未读数（会话计数器口径，与通知未读数合计成 tab 角标） */
export function unreadMessageCount(store: Store, userId: number): number {
  let total = 0;
  for (const row of store.conversations.values()) {
    if (!isParticipant(row, userId) || isDeletedFor(row, userId)) continue;
    total += unreadOf(row, userId);
  }
  return total;
}
