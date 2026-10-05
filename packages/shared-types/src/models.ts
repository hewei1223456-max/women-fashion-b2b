import type {
  AuditStatus,
  CertStatus,
  ContentType,
  GroupBuyStatus,
  MemberLevel,
  NotificationType,
  StyleTag,
  TargetType,
  UserRole,
  Visibility,
} from './domain';

/* =========================================================================
 * 实体模型（与第七篇数据库表结构一一对应）
 * 后端内存驱动 / MySQL 驱动都必须返回这些形状，前端只认这些形状。
 * ========================================================================= */

export interface User {
  id: number;
  phone?: string;
  wxOpenid?: string;
  dyOpenid?: string;
  aliOpenid?: string;
  nickname: string;
  avatarUrl: string;
  bio?: string;
  role: UserRole;
  certStatus: CertStatus;
  certLicenseUrl?: string;
  certOcrData?: Record<string, unknown>;
  /** 认证主体名称（公司/店铺） */
  companyName?: string;
  styleTags: StyleTag[];
  priceBand?: string;
  sourcingCities: string[];
  memberLevel: MemberLevel;
  memberExpireAt?: string;
  /** 接收主动私信的偏好 */
  pushEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 对外暴露的用户信息（脱敏，绝不带 phone / openid / 营业执照） */
export interface UserBrief {
  id: number;
  nickname: string;
  avatarUrl: string;
  role: UserRole;
  certStatus: CertStatus;
  memberLevel: MemberLevel;
  companyName?: string;
  bio?: string;
  styleTags: StyleTag[];
  followerCount?: number;
  contentCount?: number;
}

export interface LandmarkShop {
  id: number;
  userId: number;
  shopName: string;
  city: string;
  annualRevenue: string;
  styleDescription: string;
  coverUrl: string;
  articleCount: number;
  followerCount: number;
  /** 已举办游学/活动期数 */
  periods: number;
  createdAt: string;
}

export interface Product {
  id: number;
  manufacturerId: number;
  title: string;
  images: string[];
  videoUrl?: string;
  priceRange: string;
  /** 价格带下界，便于筛选与推荐 */
  priceMin: number;
  moq: number;
  styleTag: StyleTag;
  shipFrom: string;
  description: string;
  status: AuditStatus;
  viewCount: number;
  contactCount: number;
  collectCount: number;
  likeCount: number;
  commentCount: number;
  /** 加微转化率（contact_count / view_count），后端计算后下发 */
  contactRate: number;
  /** 搜索/推荐综合权重分 */
  score?: number;
  createdAt: string;
  manufacturer?: UserBrief;
}

export interface Article {
  id: number;
  authorId: number;
  type: 'distillation' | 'methodology' | 'news' | 'course' | 'guide' | 'ugc';
  contentType: ContentType;
  title: string;
  content: string;
  summary: string;
  coverUrl: string;
  images: string[];
  videoUrl?: string;
  /** 游学期数（distillation 专用） */
  period?: number;
  attachments: { name: string; url: string; size?: string }[];
  relatedProducts: number[];
  visibility: Visibility;
  auditStatus: AuditStatus;
  styleTags: StyleTag[];
  topics: string[];
  location?: string;
  /** 关联款（货源板块 UGC 必填） */
  productId?: number;
  priceRange?: string;
  moq?: number;
  viewCount: number;
  likeCount: number;
  collectCount: number;
  commentCount: number;
  shareCount: number;
  /** 货源内容专属：通过该内容产生加微的次数 */
  contactCount: number;
  cesScore: number;
  /** 个人主页置顶 */
  topped: boolean;
  deleted: boolean;
  createdAt: string;
  updatedAt?: string;
  author?: UserBrief;
}

export interface ArticleSummary {
  id: number;
  title: string;
  summary: string;
  coverUrl: string;
  contentType: ContentType;
  type: Article['type'];
  styleTags: StyleTag[];
  topics: string[];
  images: string[];
  videoUrl?: string;
  viewCount: number;
  likeCount: number;
  collectCount: number;
  commentCount: number;
  cesScore: number;
  visibility: Visibility;
  auditStatus: AuditStatus;
  createdAt: string;
  author: UserBrief;
  /** 推荐理由，用于「为你推荐」气泡 */
  reason?: string;
  liked?: boolean;
  collected?: boolean;
  followed?: boolean;
}

export interface Comment {
  id: number;
  userId: number;
  targetType: TargetType;
  targetId: number;
  parentId?: number;
  content: string;
  images: string[];
  likeCount: number;
  replyCount: number;
  status: 'pending' | 'approved' | 'rejected' | 'deleted';
  createdAt: string;
  user: UserBrief;
  replies?: Comment[];
  liked?: boolean;
}

export interface GroupBuy {
  id: number;
  initiatorId: number;
  productId?: number;
  title: string;
  description: string;
  targetCount: number;
  currentCount: number;
  status: GroupBuyStatus;
  styleTag: StyleTag;
  market?: string;
  deadlineAt: string;
  createdAt: string;
  initiator: UserBrief;
  product?: Product;
  joined?: boolean;
}

export interface OrderingFair {
  id: number;
  hostId: number;
  title: string;
  city: string;
  venue: string;
  startAt: string;
  endAt: string;
  theme: string;
  /** 报名方式：留微信号/扫码 */
  signup: string;
  coverUrl: string;
  styleTags: StyleTag[];
  signupCount: number;
  signedUp?: boolean;
  host: UserBrief;
}

export interface Course {
  id: number;
  lecturerId: number;
  title: string;
  category: string;
  coverUrl: string;
  duration: string;
  price: number;
  free: boolean;
  lessonCount: number;
  studentCount: number;
  intro: string;
  lecturer: UserBrief;
}

export interface Conversation {
  id: number;
  peer: UserBrief;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
}

export interface Message {
  id: number;
  conversationId: number;
  senderId: number;
  receiverId: number;
  contentType: 'text' | 'image' | 'video' | 'product_card';
  content: string;
  /** product_card 时携带款摘要 */
  product?: Product;
  isRead: boolean;
  createdAt: string;
}

export interface Notification {
  id: number;
  userId: number;
  type: NotificationType;
  title: string;
  body: string;
  actor?: UserBrief;
  targetType?: TargetType;
  targetId?: number;
  isRead: boolean;
  createdAt: string;
}

export interface Topic {
  tag: string;
  /** 无 # 的纯文本 */
  name: string;
  contentCount: number;
  viewCount: number;
  heat: number;
  coverUrl?: string;
}

export interface Draft {
  id: number;
  userId: number;
  contentType: ContentType;
  title: string;
  content: string;
  images: string[];
  videoUrl?: string;
  styleTags: StyleTag[];
  topics: string[];
  visibility: Visibility;
  productId?: number;
  location?: string;
  /** 定时发布时间，ISO 字符串 */
  scheduledAt?: string;
  updatedAt: string;
}

export interface ContentAnalytics {
  contentId: number;
  viewCount: number;
  likeCount: number;
  collectCount: number;
  commentCount: number;
  shareCount: number;
  contactCount: number;
  /** 该内容带来的新增关注 */
  followerGain: number;
  trafficSource: { source: string; percent: number }[];
  trend: { date: string; views: number }[];
}

export interface DashboardAnalytics {
  /** 曝光量 */
  exposure: number;
  /** 加微数 */
  contacts: number;
  /** 加微转化率 % */
  contactRate: number;
  /** 互动数据 */
  likes: number;
  comments: number;
  collects: number;
  /** 转化漏斗（高级版以上可见，否则返回 null） */
  funnel: { stage: string; value: number }[] | null;
  /** 趋势 */
  trend: { date: string; exposure: number; contacts: number }[];
  /** 剩余主动私信配额 */
  quota: { used: number; limit: number; resetAt: string };
}

export interface ContactLog {
  id: number;
  shopOwnerId: number;
  manufacturerId: number;
  productId?: number;
  source: string;
  contactedAt: string;
  followUpStatus: 'pending' | 'contacted' | 'converted' | 'invalid';
  shopOwner?: UserBrief;
  productTitle?: string;
}

export interface AuditLog {
  id: number;
  contentType: 'text' | 'image' | 'audio' | 'video';
  contentId?: number;
  contentUrl?: string;
  auditSource: string;
  auditResult: string;
  auditDetail?: Record<string, unknown>;
  /** 人工复审状态 */
  reviewStatus: 'auto_pass' | 'auto_reject' | 'manual_pending' | 'manual_pass' | 'manual_reject';
  bizType: string;
  bizId: number;
  text?: string;
  createdAt: string;
}

/** 转发记录 */
export interface Share {
  id: number;
  userId: number;
  targetType: 'article' | 'product';
  targetId: number;
  channel: 'wechat' | 'moments' | 'group' | 'link';
  createdAt: string;
}

/** 订货会报名 */
export interface FairSignup {
  id: number;
  fairId: number;
  userId: number;
  createdAt: string;
}

/** 拼单成员 */
export interface GroupBuyMember {
  id: number;
  groupBuyId: number;
  userId: number;
  createdAt: string;
}

/** 点赞记录 */
export interface Like {
  id: number;
  userId: number;
  targetType: TargetType;
  targetId: number;
  createdAt: string;
}

/** 收藏记录 */
export interface Collect {
  id: number;
  userId: number;
  targetType: 'article' | 'product';
  targetId: number;
  folderName: string;
  createdAt: string;
}

/** 关注记录 */
export interface Follow {
  id: number;
  followerId: number;
  followingId: number;
  createdAt: string;
}

/** 行为埋点（推荐引擎输入 / 用户画像） */
export interface Behavior {
  id: number;
  userId: number;
  action: 'view' | 'like' | 'collect' | 'comment' | 'share' | 'follow' | 'contact' | 'publish' | 'search' | 'tool';
  targetType: string;
  targetId: number;
  keyword?: string;
  styleTag?: string;
  createdAt: string;
}

/** 厂家主动私信记录 */
export interface ContactMessage {
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
  stylePreferences: StyleTag[];
  priceBandPreferences: string[];
  dailyLimit: number;
  blacklistManufacturerIds: number[];
  createdAt: string;
}
