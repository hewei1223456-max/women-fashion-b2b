import type {
  Article,
  AuditLog,
  BuyerPreference,
  Comment,
  Conversation,
  Course,
  Draft,
  GroupBuy,
  LandmarkShop,
  Meetup,
  Message,
  Notification,
  OrderingFair,
  Product,
  Share,
  User,
} from '@wfb/shared-types';

/* =========================================================================
 * 数据存储层（DATA_DRIVER 可切换）
 *
 *   memory（默认）：进程内 Map，零依赖启动，用于 Demo / 前端联调
 *   mysql         ：同一套 Repository 代码 + mysql2 驱动，见 docs/DEPLOY.md
 *
 * 设计：所有表以 Map<id, Row> 存放，另建「索引 Map」避免每次全表扫描。
 * 领域模块只依赖这里的仓储函数，不直接碰底层驱动。
 * ========================================================================= */

/** 关系型组织（company / 团队） */
export interface Organization {
  id: number;
  ownerId: number;
  name: string;
  role: string;
  createdAt: string;
}

/** 转发记录 */
export type ShareRow = Share;

/** 新用户偏好画像（登录引导最后一步收集） */
export type BuyerPreferenceRow = BuyerPreference & {
  /** 与 userId 同值：Store 的自增序列助手要求行有 id 字段 */
  id: number;
  userId: number;
  updatedAt: string;
};

/** 订货会报名 */
export interface FairSignup {
  id: number;
  fairId: number;
  userId: number;
  createdAt: string;
}

/** 组局报名记录 */
export interface MeetupSignup {
  id: number;
  meetupId: number;
  userId: number;
  /** 报名留言（例如「我带样品」） */
  note?: string;
  createdAt: string;
}

/** 组局（对外模型 + 内部字段） */
export type MeetupRow = Meetup & {
  /** 发布组局时同步创建的资讯流内容 id */
  articleId?: number;
  deleted?: boolean;
};

/** 拼单成员 */
export interface GroupBuyMember {
  id: number;
  groupBuyId: number;
  userId: number;
  createdAt: string;
}

/** 收藏（含收藏夹分类） */
export interface CollectRow {
  id: number;
  userId: number;
  targetType: 'article' | 'product';
  targetId: number;
  folderName: string;
  createdAt: string;
}

/** 点赞 */
export interface LikeRow {
  id: number;
  userId: number;
  targetType: 'article' | 'product' | 'comment';
  targetId: number;
  createdAt: string;
}

/** 关注 */
export interface FollowRow {
  id: number;
  followerId: number;
  followingId: number;
  createdAt: string;
}

/** 加微记录 */
export interface WechatContactLog {
  id: number;
  shopOwnerId: number;
  manufacturerId: number;
  productId?: number;
  articleId?: number;
  source: string;
  contactedAt: string;
  followUpStatus: 'pending' | 'contacted' | 'converted' | 'invalid';
}

/** 厂家主动私信记录 */
export interface ContactMessageRow {
  id: number;
  manufacturerId: number;
  shopOwnerId: number;
  content: string;
  productId?: number;
  sentAt: string;
  isRead: boolean;
}

/** 店主接收偏好 */
export interface ReceivePreferenceRow {
  id: number;
  shopOwnerId: number;
  stylePreferences: string[];
  priceBandPreferences: string[];
  dailyLimit: number;
  blacklistManufacturerIds: number[];
  createdAt: string;
}

/** 子账号 */
export interface SubAccountRow {
  id: number;
  manufacturerId: number;
  subUserId: number;
  role: 'sales' | 'operation' | 'admin';
  createdAt: string;
}

/** 草稿 */
export type DraftRow = Draft & { deleted?: boolean };

/** 通知 */
export type NotificationRow = Notification;

/** 会话：对外形状用 Conversation，内部额外记录双方 id 与各自未读数 */
export type ConversationRow = Conversation & {
  userAId: number;
  userBId: number;
  unreadA: number;
  unreadB: number;
  /** 最近一条消息摘要（列表页直接用，避免 N+1） */
  lastMessage?: string;
  lastMessageAt?: string;
};

/** 内容（资讯 + 货源 UGC 统一存这张表，用 board 区分板块） */
export type ArticleRow = Article & { board: 'info' | 'source'; restorableUntil?: string };

/** 款 */
export type ProductRow = Product;

/** 审核记录 */
export type AuditLogRow = AuditLog;

/** 行为埋点：推荐引擎与用户画像的输入 */
export interface BehaviorRow {
  id: number;
  userId: number;
  action: 'view' | 'like' | 'collect' | 'comment' | 'share' | 'follow' | 'contact' | 'publish' | 'search' | 'tool';
  targetType: string;
  targetId: number;
  keyword?: string;
  /** 风格快照，便于统计偏好 */
  styleTag?: string;
  createdAt: string;
}

/** 内容浏览去重记录（用于完读率与去重计数） */
export interface ViewRow {
  id: number;
  userId: number;
  targetType: 'article' | 'product';
  targetId: number;
  createdAt: string;
}

export interface Store {
  users: Map<number, User>;
  products: Map<number, ProductRow>;
  articles: Map<number, ArticleRow>;
  landmarks: Map<number, LandmarkShop>;
  courses: Map<number, Course>;
  comments: Map<number, Comment>;
  likes: Map<number, LikeRow>;
  collects: Map<number, CollectRow>;
  follows: Map<number, FollowRow>;
  shares: Map<number, ShareRow>;
  conversations: Map<number, ConversationRow>;
  messages: Map<number, Message>;
  notifications: Map<number, NotificationRow>;
  groupBuys: Map<number, GroupBuy>;
  groupBuyMembers: Map<number, GroupBuyMember>;
  fairs: Map<number, OrderingFair>;
  fairSignups: Map<number, FairSignup>;
  /** 组局（一起去拿货 / 一起做货 / 交流局），参考闪动 */
  meetups: Map<number, MeetupRow>;
  /** 组局报名 */
  meetupSignups: Map<number, MeetupSignup>;
  drafts: Map<number, DraftRow>;
  contactLogs: Map<number, WechatContactLog>;
  contactMessages: Map<number, ContactMessageRow>;
  /** 店主接收偏好（厂家主动私信） */
  preferences: Map<number, ReceivePreferenceRow>;
  /** 新用户偏好画像（登录引导收集，key = userId） */
  buyerPreferences: Map<number, BuyerPreferenceRow>;
  subAccounts: Map<number, SubAccountRow>;
  auditLogs: Map<number, AuditLogRow>;
  behaviors: Map<number, BehaviorRow>;
  views: Map<number, ViewRow>;
  organizations: Map<number, Organization>;
  /** 每张表的自增序列 */
  sequences: Record<string, number>;
  /** 数据源标识，/api/health 展示 */
  driver: 'memory' | 'mysql';
}

export function createStore(driver: 'memory' | 'mysql' = 'memory'): Store {
  return {
    users: new Map(),
    products: new Map(),
    articles: new Map(),
    landmarks: new Map(),
    courses: new Map(),
    comments: new Map(),
    likes: new Map(),
    collects: new Map(),
    follows: new Map(),
    shares: new Map(),
    conversations: new Map(),
    messages: new Map(),
    notifications: new Map(),
    groupBuys: new Map(),
    groupBuyMembers: new Map(),
    fairs: new Map(),
    fairSignups: new Map(),
    meetups: new Map(),
    meetupSignups: new Map(),
    drafts: new Map(),
    contactLogs: new Map(),
    contactMessages: new Map(),
    preferences: new Map(),
    buyerPreferences: new Map(),
    subAccounts: new Map(),
    auditLogs: new Map(),
    behaviors: new Map(),
    views: new Map(),
    organizations: new Map(),
    sequences: {},
    driver,
  };
}

/** 全局自增 ID（与数据库 AUTO_INCREMENT 语义一致） */
export function nextId(store: Store, table: string): number {
  const current = store.sequences[table] ?? 0;
  const next = current + 1;
  store.sequences[table] = next;
  return next;
}

/** 播种后把各表序列对齐到已有最大 ID，避免主键冲突 */
export function syncSequences(store: Store) {
  const map: Record<string, number> = {
    users: maxId(store.users),
    products: maxId(store.products),
    articles: maxId(store.articles),
    landmarks: maxId(store.landmarks),
    courses: maxId(store.courses),
    comments: maxId(store.comments),
    likes: maxId(store.likes),
    collects: maxId(store.collects),
    follows: maxId(store.follows),
    shares: maxId(store.shares),
    conversations: maxId(store.conversations),
    messages: maxId(store.messages),
    notifications: maxId(store.notifications),
    groupBuys: maxId(store.groupBuys),
    groupBuyMembers: maxId(store.groupBuyMembers),
    fairs: maxId(store.fairs),
    fairSignups: maxId(store.fairSignups),
    meetups: maxId(store.meetups),
    meetupSignups: maxId(store.meetupSignups),
    drafts: maxId(store.drafts),
    contactLogs: maxId(store.contactLogs),
    contactMessages: maxId(store.contactMessages),
    preferences: maxId(store.preferences),
    buyerPreferences: maxId(store.buyerPreferences),
    subAccounts: maxId(store.subAccounts),
    auditLogs: maxId(store.auditLogs),
    behaviors: maxId(store.behaviors),
    views: maxId(store.views),
    organizations: maxId(store.organizations),
  };
  store.sequences = map;
}

function maxId<T extends { id: number }>(m: Map<number, T>): number {
  let max = 0;
  for (const k of m.keys()) if (k > max) max = k;
  return max;
}

/* ============================== 常用查询助手 ============================== */

export function all<T>(m: Map<number, T>): T[] {
  return Array.from(m.values());
}

/** 按插入顺序返回（Map 保持插入序），等价于「按 id 升序」 */
export function byId<T extends { id: number }>(m: Map<number, T>, ids: number[]): T[] {
  const out: T[] = [];
  for (const id of ids) {
    const v = m.get(id);
    if (v) out.push(v);
  }
  return out;
}

export function take<T>(rows: T[], page: number, pageSize: number): T[] {
  return rows.slice((page - 1) * pageSize, page * pageSize);
}

export function pageOf<T>(rows: T[], page: number, pageSize: number) {
  return { list: take(rows, page, pageSize), page, pageSize, total: rows.length, hasMore: page * pageSize < rows.length };
}

/** 时间倒序比较器 */
export function byTimeDesc<T extends { createdAt?: string; sentAt?: string; contactedAt?: string }>(a: T, b: T): number {
  const ta = new Date(a.createdAt ?? a.sentAt ?? a.contactedAt ?? 0).getTime();
  const tb = new Date(b.createdAt ?? b.sentAt ?? b.contactedAt ?? 0).getTime();
  return tb - ta;
}
