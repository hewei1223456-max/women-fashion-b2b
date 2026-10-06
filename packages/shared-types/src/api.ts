import type {
  Article,
  ArticleSummary,
  AuditLog,
  Comment,
  ContentAnalytics,
  Conversation,
  Course,
  Draft,
  DashboardAnalytics,
  GroupBuy,
  LandmarkShop,
  Message,
  Notification,
  OrderingFair,
  Product,
  Topic,
  User,
  UserBrief,
} from './models';
import type { AuditStatus, ContentType, MeetupKind, MemberLevel, StyleTag, TargetType, UserRole, Visibility } from './domain';

/* =========================================================================
 * 统一响应信封：所有接口返回 { code, message, data }
 * code = 0 表示成功；非 0 时 data 为 null，message 为人类可读原因。
 * ========================================================================= */
export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
}

export interface Paged<T> {
  list: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

/* ------------------------------ 认证 / 用户 ------------------------------ */

export interface LoginDto {
  /** 手机号登录（Demo 阶段主通道） */
  phone?: string;
  /** 验证码，Demo 阶段任意 4-6 位数字均可 */
  code?: string;
  /** 演示账号快速登录：直接传种子用户 id */
  demoUserId?: number;
  /** 小程序登录 */
  platform?: 'weapp' | 'tt' | 'alipay' | 'h5' | 'app';
  loginCode?: string;
  nickname?: string;
}

export interface LoginResult {
  token: string;
  user: User;
  /** 是否为新注册用户（前端据此引导认证 + 选风格标签） */
  isNew: boolean;
}

export interface CertifyDto {
  role: Extract<UserRole, 'shop_owner' | 'manufacturer' | 'landmark' | 'lecturer'>;
  companyName: string;
  licenseUrl: string;
  /** OCR 识别结果（可由前端或后端填充） */
  ocrData?: Record<string, unknown>;
  legalName?: string;
  idCardFrontUrl?: string;
  idCardBackUrl?: string;
  /** 人脸核验流水号 */
  faceVerifyId?: string;
  /** 对公打款验证金额 */
  bankAmount?: number;
  styleTags?: StyleTag[];
  priceBand?: string;
  sourcingCities?: string[];
}

export interface CertifyResult {
  certStatus: AuditStatus | 'none';
  steps: { key: string; label: string; done: boolean; detail?: string }[];
  /** 演示用：当前认证进度 0-100 */
  progress: number;
  /**
   * 营业执照 OCR 识别结果（注册号/法定代表人/公司名称/地址/营业期限/经营范围/主体类型）。
   * 由后端返回，前端直接渲染，**不得在前端造假数据**。
   */
  ocrData?: Record<string, unknown>;
  /** 人脸核验流水号（对接公安/CFCA 后返回真实值） */
  faceVerifyId?: string;
  /** 对公打款金额（0.01-0.1 元） */
  bankAmount?: number;
}

export interface UpdateProfileDto {
  nickname?: string;
  avatarUrl?: string;
  bio?: string;
  styleTags?: StyleTag[];
  priceBand?: string;
  sourcingCities?: string[];
  pushEnabled?: boolean;
}

export interface ProfileDetail {
  user: UserBrief;
  isSelf: boolean;
  followed: boolean;
  followerCount: number;
  followingCount: number;
  likeReceived: number;
  collectCount: number;
  contentCount: number;
  landmark?: LandmarkShop;
  /** 货源视角：厂家款数 + 加微转化率 */
  productCount?: number;
  contactRate?: number;
  /** 该用户是否可被私信 */
  canMessage: boolean;
}

/* ------------------------------ 内容 / 资讯 ------------------------------ */

export interface FeedQuery extends PageQuery {
  tab?: 'recommend' | 'follow' | 'city' | 'style' | 'topic';
  styleTags?: string;
  topic?: string;
  city?: string;
  type?: 'all' | 'article' | 'video' | 'product' | 'sourcing_shot' | 'outfit';
  keyword?: string;
}

export interface FeedResult<T> extends Paged<T> {
  /** 本次推荐使用的策略说明（Demo 用于展示规则引擎生效） */
  strategy: string;
  /** 冷启动状态：前 3 次访问走探索通道 */
  coldStart: boolean;
  visitCount: number;
}

export interface ArticleDetail extends Omit<Article, 'relatedProducts'> {
  author: UserBrief;
  related: ArticleSummary[];
  /** 资讯→货源 联动：内容底部推荐的相关厂家款 */
  relatedProducts: Product[];
  liked: boolean;
  collected: boolean;
  followed: boolean;
  /** 货源→功能 联动：一键生成内容入口 */
  toolEntries?: { key: string; label: string; path: string }[];
}

export interface PublishContentDto {
  contentType: ContentType;
  /** 板块：info = 资讯，source = 货源 */
  board: 'info' | 'source';
  title: string;
  content: string;
  images?: string[];
  videoUrl?: string;
  coverUrl?: string;
  styleTags: StyleTag[];
  topics?: string[];
  visibility?: Visibility;
  /** 货源板块必关联款 */
  productId?: number;
  priceRange?: string;
  moq?: number;
  location?: string;
  /** 游学期数 */
  period?: number;
  /** 定时发布 */
  scheduledAt?: string;
  attachments?: { name: string; url: string }[];
  /** 发布归属：article（资讯/图文） | product（货源款卡片） */
  publishAs?: 'article' | 'product';
}

export interface UpdateContentDto {
  /** 全部字段可选：只传要改的字段（7 天内可编辑，编辑后重新审核） */
  title?: string;
  content?: string;
  images?: string[];
  videoUrl?: string;
  coverUrl?: string;
  styleTags?: StyleTag[];
  topics?: string[];
  visibility?: Visibility;
  productId?: number;
  priceRange?: string;
  moq?: number;
  location?: string;
  period?: number;
  scheduledAt?: string;
  attachments?: { name: string; url: string }[];
}

export interface PublishResult {
  id: number;
  auditStatus: AuditStatus;
  /** 同步文本审核结论 */
  textAudit: { pass: boolean; reason?: string; hitWords?: string[] };
  /** 异步图片/视频审核任务号，5-30 分钟回调 */
  mediaTaskIds: string[];
  /** 是否需要人工复审 */
  manualReview: boolean;
  message: string;
}

/* ------------------------------ 货源 / 厂家 ------------------------------ */

export interface SourceFeedQuery extends PageQuery {
  tab?: 'recommend' | 'follow' | 'city' | 'style' | 'new';
  styleTags?: string;
  priceBand?: string;
  shipFrom?: string;
  keyword?: string;
}

export interface PublishProductDto {
  title: string;
  images: string[];
  videoUrl?: string;
  priceRange: string;
  moq: number;
  styleTag: StyleTag;
  shipFrom: string;
  description: string;

  /* -------- 批发交易字段（不填则后端由价格带推导，保证卡片不出现空值） -------- */
  /** 拿货价（单件起拿） */
  wholesalePrice?: number;
  /** 起提量价（阶梯价） */
  tierPrices?: { minQty: number; price: number; label?: string }[];
  /** 是否支持拼单拿货 / 拼单做货 */
  supportsGroupBuy?: boolean;
  /** 是否支持一件代发 */
  supportsDropship?: boolean;
  /** 档口形态 */
  stallType?: string;
  /** 档口/工厂具体位置 */
  stallAddress?: string;
  /** 实力标签 */
  capabilities?: string[];
  /** 拿货地（产业带） */
  market?: string;
  fabric?: string;
  sizes?: string[];
  colorCount?: number;
}

export interface ContactLogDto {
  manufacturerId: number;
  productId?: number;
  articleId?: number;
  source: string;
}

export interface ContactLogResult {
  /** 演示用：脱敏微信号（正式环境由厂家配置） */
  wechatId: string;
  wechatQrcodeUrl?: string;
  productId?: number;
  /** 加微后推荐的动作（货源→功能 联动） */
  suggestions: { key: string; label: string; path: string }[];
  logged: boolean;
}

export interface ContactSendDto {
  shopOwnerId: number;
  content: string;
  productId?: number;
}

export interface ContactSendResult {
  sent: boolean;
  remainingQuota: number;
  reason?: string;
}

export interface ReceivePreference {
  stylePreferences: StyleTag[];
  priceBandPreferences: string[];
  dailyLimit: number;
  blacklistManufacturerIds: number[];
}

export interface SubAccount {
  id: number;
  manufacturerId: number;
  subUserId: number;
  role: 'sales' | 'operation' | 'admin';
  nickname: string;
  phone?: string;
  createdAt: string;
}

export interface CreateSubAccountDto {
  nickname: string;
  phone: string;
  role: 'sales' | 'operation' | 'admin';
}

/* ------------------------------ 拼单 / 订货会 ------------------------------ */

export interface CreateGroupBuyDto {
  title: string;
  description: string;
  productId?: number;
  targetCount: number;
  styleTag: StyleTag;
  market?: string;
  deadlineAt: string;
}

export interface CreateFairDto {
  title: string;
  city: string;
  venue: string;
  startAt: string;
  endAt: string;
  theme: string;
  signup: string;
  styleTags: StyleTag[];
  coverUrl?: string;
}

/* ------------------------------ 组局（参考闪动） ------------------------------ */

export interface CreateMeetupDto {
  kind: MeetupKind;
  title: string;
  description: string;
  city: string;
  /** 活动地点（市场/园区/门店） */
  venue: string;
  /** 集合点，细化到具体位置，例如「十三行 6 楼 B12 档口门口」 */
  gatheringPoint: string;
  startAt: string;
  endAt: string;
  /** 报名方式（留微信号 / 扫码 / 站内报名） */
  signupMethod: string;
  /** 报名条件，例如「认证店主，有实体店」 */
  signupRequirement: string;
  /** 人数上限，0 = 不限 */
  capacity: number;
  fee?: string;
  productId?: number;
  market?: string;
  styleTags?: StyleTag[];
  /** 期望同行的人（参与者画像） */
  targetAudience?: string;
  /** 是否同时发一条资讯流内容（默认 true，让组局也能被推荐到首页） */
  publishToFeed?: boolean;
  coverUrl?: string;
}

/* ------------------------------ 互动 ------------------------------ */

export interface LikeDto {
  targetType: TargetType;
  targetId: number;
}

export interface CommentDto {
  targetType: TargetType;
  targetId: number;
  content: string;
  images?: string[];
  parentId?: number;
  mentions?: number[];
}

export interface CollectDto {
  targetType: Extract<TargetType, 'article' | 'product'>;
  targetId: number;
  folderName?: string;
}

export interface ShareDto {
  targetType: Extract<TargetType, 'article' | 'product'>;
  targetId: number;
  channel: 'wechat' | 'moments' | 'group' | 'link';
}

export interface FollowDto {
  userId: number;
}

export interface InteractionState {
  liked: boolean;
  collected: boolean;
  followed: boolean;
  likeCount: number;
  collectCount: number;
}

/* ------------------------------ 私信 / 通知 ------------------------------ */

export interface SendMessageDto {
  receiverId: number;
  contentType?: 'text' | 'image' | 'video' | 'product_card';
  content: string;
  productId?: number;
}

export interface NotificationQuery extends PageQuery {
  type?: Notification['type'];
  unreadOnly?: boolean;
}

export interface UnreadCount {
  notification: number;
  message: number;
  /** 底部 tab 角标合计 */
  total: number;
}

/* ------------------------------ 功能板块 ------------------------------ */

/** 单个工具的当日用量 */
export interface ToolQuotaRow {
  key: string;
  /** 中文名（来自 TOOLS 字典） */
  name?: string;
  used: number;
  /** -1 表示不限 */
  limit: number;
  remaining: number;
  /** 0 额度且非会员时锁定 */
  locked?: boolean;
}

export interface ToolQuotaResult {
  /** 统计日期 yyyy-MM-dd */
  date: string;
  userId: number;
  memberLevel: MemberLevel;
  list: ToolQuotaRow[];
  ai: { configured: boolean; provider: string | null; model: string | null; cacheSize: number };
}

export interface ToolResult {
  tool: string;
  /** 是否命中免费额度 */
  quotaUsed: number;
  quotaLimit: number;
  /** 是否走了真实 AI 网关，false = 本地规则降级演示 */
  aiPowered: boolean;
  model?: string;
  /** 结果正文（markdown / 纯文本） */
  text?: string;
  /** 结构化结果 */
  items?: Record<string, unknown>[];
  imageUrl?: string;
  videoUrl?: string;
  attachments?: { name: string; url: string }[];
  /** 结果页的「推荐阅读」——功能→资讯 联动 */
  recommendedArticles?: ArticleSummary[];
  /** 免责/说明 */
  notice?: string;
  elapsedMs: number;
}

export interface RewriteDto {
  text: string;
  style?: StyleTag;
  tone?: '种草' | '专业' | '亲切' | '高级感';
  platform?: 'xiaohongshu' | 'douyin' | 'pengyouquan';
}

export interface RemoveWatermarkDto {
  url: string;
}

export interface TrendingDto {
  style?: StyleTag;
  platform?: 'xiaohongshu' | 'douyin';
}

export interface AccountAnalysisDto {
  accountUrl: string;
  platform: 'xiaohongshu' | 'douyin' | 'shipin';
}

export interface GenerateImageDto {
  prompt: string;
  style?: StyleTag;
  /** 款图 URL，用于「一键生成海报」联动 */
  productImageUrl?: string;
  ratio?: '1:1' | '3:4' | '9:16';
}

export interface RemoveBgDto {
  imageUrl: string;
}

export interface OperationAdviceDto {
  shopName: string;
  monthlyRevenue?: number;
  avgOrderValue?: number;
  styleTags?: StyleTag[];
  followerCount?: number;
  /** 自由补充 */
  note?: string;
}

export interface TeleprompterDto {
  text: string;
}

/* ------------------------------ 推荐 / 搜索 ------------------------------ */

export interface RecommendFeedQuery extends PageQuery {
  board: 'info' | 'source';
  styleTags?: string;
  priceBand?: string;
  shipFrom?: string;
}

export interface RecommendMeta {
  strategy: string;
  coldStart: boolean;
  visitCount: number;
  /** 本次采用的打散规则说明（Demo 可视化） */
  diversity: string;
}

export interface SearchQuery extends PageQuery {
  keyword: string;
  board?: 'all' | 'info' | 'source';
  style?: string;
  priceBand?: string;
  shipFrom?: string;
}

export interface SearchResult {
  products: Product[];
  articles: ArticleSummary[];
  manufacturers: UserBrief[];
  total: number;
  /** 搜索排序权重拆解（Demo 可视化） */
  scoreBreakdown?: { productId: number; base: number; performance: number; feedback: number; overall: number; total: number }[];
}

/* ------------------------------ 审核 ------------------------------ */

export interface AuditCallbackDto {
  /** 微信消息推送加密体 */
  ToUserName?: string;
  FromUserName?: string;
  CreateTime?: number;
  MsgType?: string;
  Event?: string;
  trace_id?: string;
  result?: { suggest: string; label: number };
  [key: string]: unknown;
}

export interface ReviewDto {
  auditLogId: number;
  action: 'pass' | 'reject';
  reason?: string;
}

export interface AuditQueueQuery extends PageQuery {
  reviewStatus?: AuditLog['reviewStatus'];
  bizType?: string;
}

/* ------------------------------ 管理后台 ------------------------------ */

export interface AdminOverview {
  users: { total: number; shopOwner: number; manufacturer: number; landmark: number; newToday: number };
  cert: { pending: number; approved: number; rejected: number };
  content: { total: number; pending: number; publishedToday: number; rejected: number };
  products: { total: number; pending: number; approved: number };
  interactions: { likes: number; comments: number; collects: number; shares: number };
  contacts: { today: number; total: number; rate: number };
  revenue: { mrr: number; manufacturers: number; owners: number; byLevel: { level: MemberLevel; count: number; amount: number }[] };
  /** 核心指标仪表盘（第十三篇） */
  kpi: { key: string; label: string; value: number; target: number; unit: string; pass: boolean }[];
  trend: { date: string; newUsers: number; exposure: number; contacts: number; publishes: number }[];
}

export interface AdminUserQuery extends PageQuery {
  role?: UserRole;
  certStatus?: AuditStatus | 'none';
  keyword?: string;
}

export interface AdminUserRow extends User {
  contentCount: number;
  followerCount: number;
}
