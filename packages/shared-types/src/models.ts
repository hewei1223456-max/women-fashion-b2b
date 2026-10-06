import type {
  AuditStatus,
  CertStatus,
  ContentType,
  GroupBuyStatus,
  MeetupKind,
  MemberLevel,
  NotificationType,
  ProductCapability,
  StallType,
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
  /**
   * 身份标识（游客 / 认证店主 / 付费店主 / 认证厂家 / 付费厂家 / 地标大店 / 讲师 / 官方）。
   * 由后端 buildBadges() 统一计算后填充，前端只渲染。
   * 与 UserBrief.badges 同源，保证「我的」页与列表页口径一致。
   */
  badges?: UserBadge[];
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
  /** 身份标识（游客 / 认证店主 / 付费店主 / 免费厂家 / 付费厂家 / 大店 / 讲师 / 官方） */
  badges: UserBadge[];
  /** 认证店主 / 厂家的展示名（如「杭州·小满家」） */
  displayName?: string;
  /** 所在城市 */
  city?: string;
  /** 店铺名 */
  shopName?: string;
}

/**
 * 身份标识 —— 列表和详情里都要显式展示，
 * 让用户一眼分清「谁是认证店主、谁付了费、谁只是游客」。
 */
export interface UserBadge {
  /** 稳定的机器标识，前端按它选图标与配色 */
  key:
    | 'guest'
    | 'certified_owner'
    | 'paid_owner'
    | 'certified_manufacturer'
    | 'paid_manufacturer'
    | 'landmark'
    | 'lecturer'
    | 'official';
  label: string;
  /** 视觉等级：gold 付费 / blue 认证 / gray 普通 / orange 官方 */
  tone: 'gold' | 'blue' | 'gray' | 'orange' | 'purple';
}

export const BADGE_TONES: Record<UserBadge['key'], UserBadge['tone']> = {
  guest: 'gray',
  certified_owner: 'blue',
  paid_owner: 'gold',
  certified_manufacturer: 'blue',
  paid_manufacturer: 'gold',
  landmark: 'purple',
  lecturer: 'purple',
  official: 'orange',
};

export const BADGE_LABELS: Record<UserBadge['key'], string> = {
  guest: '游客',
  certified_owner: '认证店主',
  paid_owner: '付费店主',
  certified_manufacturer: '认证厂家',
  paid_manufacturer: '付费厂家',
  landmark: '地标大店',
  lecturer: '内容讲师',
  official: '官方',
};

/**
 * 新用户偏好（登录引导最后一步收集）。
 * 用途：① 冷启动推荐画像 ② 厂家主动私信的匹配依据 ③ 首页内容与货源的初始排序。
 */
export interface BuyerPreference {
  /** 想跟什么样的人学习 */
  learnFrom: LearnTarget[];
  /** 想看什么内容 */
  contentInterests: ContentInterest[];
  /** 想要什么货源 */
  sourcingNeeds: SourcingNeed[];
  /** 想要什么类型的厂家 */
  manufacturerNeeds: ManufacturerNeed[];
}

export const LEARN_TARGETS = ['landmark_shop', 'top_owner', 'lecturer', 'manufacturer', 'peer_owner'] as const;
export type LearnTarget = (typeof LEARN_TARGETS)[number];
export const LEARN_TARGET_LABELS: Record<LearnTarget, string> = {
  landmark_shop: '地标大店老板',
  top_owner: '同城头部店主',
  lecturer: '行业讲师',
  manufacturer: '源头厂家老板',
  peer_owner: '同频新手店主',
};

export const CONTENT_INTERESTS = ['grouping', 'display', 'pricing', 'video', 'live', 'sourcing_guide', 'case_study', 'news'] as const;
export type ContentInterest = (typeof CONTENT_INTERESTS)[number];
export const CONTENT_INTEREST_LABELS: Record<ContentInterest, string> = {
  grouping: '组货逻辑',
  display: '陈列方法',
  pricing: '定价策略',
  video: '拍视频/剪辑',
  live: '直播带货',
  sourcing_guide: '拿货攻略',
  case_study: '踩坑案例',
  news: '行业行情',
};

export const SOURCING_NEEDS = ['spot_goods', 'futures', 'oem', 'dropship', 'group_buy', 'small_batch'] as const;
export type SourcingNeed = (typeof SOURCING_NEEDS)[number];
export const SOURCING_NEED_LABELS: Record<SourcingNeed, string> = {
  spot_goods: '现货现拿',
  futures: '期货预定',
  oem: '贴牌定制',
  dropship: '一件代发',
  group_buy: '拼单拿货',
  small_batch: '小批量试单',
};

export const MANUFACTURER_NEEDS = ['own_pattern_room', 'stall', 'factory', 'showroom', 'fast_return', 'quality_inspect'] as const;
export type ManufacturerNeed = (typeof MANUFACTURER_NEEDS)[number];
export const MANUFACTURER_NEED_LABELS: Record<ManufacturerNeed, string> = {
  own_pattern_room: '有自有版房',
  stall: '有档口可看货',
  factory: '纯工厂直供',
  showroom: '有展厅',
  fast_return: '返单快',
  quality_inspect: '支持验货',
};

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

  /* ==================== 批发交易信息（店主最关心的四件事） ==================== */

  /** ① 拿货价：单件起拿的单价（元）。比 priceMin 更直白，店主第一眼看这个 */
  wholesalePrice: number;
  /** ② 起提量价：阶梯价，拿得越多越便宜。没填阶梯价时后端会由按 moq 计算补一条 */
  tierPrices: TierPrice[];
  /** ③ 是否支持拼单拿货 / 拼单做货 */
  supportsGroupBuy: boolean;
  /** 支持拼单时的最小成团件数 */
  groupBuyMinQty?: number;
  /** 是否支持一件代发（代发价通常高于拿货价） */
  supportsDropship: boolean;
  /** 代发价（支持代发时有值） */
  dropshipPrice?: number;
  /** ④ 档口形态：纯工厂 / 纯展厅 / 有档口 / 工厂+档口 */
  stallType: StallType;
  /** 档口或工厂的具体位置描述，例如「十三行 6 楼 B12」「濮院工厂 3 号车间」 */
  stallAddress?: string;
  /** 实力标签：现货 / 期货 / 自有版房 / 可贴牌 / 支持打样 等 */
  capabilities: ProductCapability[];
  /** 拿货地（产业带），例如 十三行 / 南油 / 意法 / 濮院 */
  market?: string;
  /** 上新时间（店主判断是否当季新款） */
  listedAt?: string;
  /** 面料成分，例如「醋酸混纺 68% + 涤纶 32%」 */
  fabric?: string;
  /** 尺码范围 */
  sizes?: string[];
  /** 颜色数 */
  colorCount?: number;
}

/** 阶梯价：达到 minQty 件时单价为 price */
export interface TierPrice {
  minQty: number;
  price: number;
  /** 展示用说明，例如「20 件起」「100 件起」 */
  label?: string;
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
  /** 组局详情（contentType = meetup 时存在） */
  meetup?: Meetup;
  /** 拿货实评：评分 1-5 与是否值得再拿 */
  rating?: number;
  wouldRebuy?: boolean;
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
  /** 拿货实评：1-5 星（contentType=review 时有值） */
  rating?: number;
  /** 拿货实评：是否愿意再拿 */
  wouldRebuy?: boolean;
  /** 组局：线下要素（contentType=meetup 时有值，见 Meetup 模型） */
  meetup?: Meetup;
  /** 关联款 id（货源 UGC 用） */
  productId?: number;
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

/**
 * 组局（参考「闪动」的活动形态）
 *
 * 与拼单的区别：拼单只解决「凑量压价」，组局解决「一起去拿货 / 一起做货 / 一起交流」，
 * 因此必须带**时间、地点、集合点、报名方式、报名条件**这些线下要素。
 */
export interface Meetup {
  id: number;
  /** 发起人 */
  initiatorId: number;
  /** 组局类型 */
  kind: MeetupKind;
  title: string;
  description: string;
  coverUrl: string;
  /** 活动城市 */
  city: string;
  /** 活动地点（市场/园区/门店） */
  venue: string;
  /** 集合点（细化到具体位置，例如「十三行 6 楼 B12 档口门口」） */
  gatheringPoint: string;
  /** 集合时间 */
  startAt: string;
  /** 结束时间 */
  endAt: string;
  /** 报名方式（留微信号 / 扫码 / 站内报名） */
  signupMethod: string;
  /** 报名条件（例如「认证店主，有实体店」「需自带样品」） */
  signupRequirement: string;
  /** 人数上限，0 表示不限 */
  capacity: number;
  /** 已报名人数 */
  joinedCount: number;
  /** 费用说明 */
  fee?: string;
  /** 关联的款（一起拿货时用） */
  productId?: number;
  /** 关联的拿货市场 */
  market?: string;
  styleTags: StyleTag[];
  /** 参与者画像：期望同行的人 */
  targetAudience?: string;
  status: 'recruiting' | 'full' | 'ended' | 'cancelled';
  createdAt: string;
  initiator: UserBrief;
  /** 当前用户是否已报名 */
  joined?: boolean;
  /** 报名者（列表页只取前几个头像） */
  attendees?: UserBrief[];
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
