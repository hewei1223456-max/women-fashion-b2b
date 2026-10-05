import type {
  AdminOverview,
  AdminUserQuery,
  AdminUserRow,
  ArticleDetail,
  ArticleSummary,
  AuditCallbackDto,
  AuditLog,
  AuditQueueQuery,
  CertifyDto,
  CertifyResult,
  CollectDto,
  Comment,
  CommentDto,
  ContentAnalytics,
  Conversation,
  Course,
  CreateFairDto,
  CreateGroupBuyDto,
  CreateSubAccountDto,
  DashboardAnalytics,
  Draft,
  FeedQuery,
  FeedResult,
  FollowDto,
  GenerateImageDto,
  GroupBuy,
  InteractionState,
  LandmarkShop,
  LikeDto,
  LoginDto,
  LoginResult,
  Message,
  Notification,
  NotificationQuery,
  OperationAdviceDto,
  OrderingFair,
  Paged,
  Product,
  ProfileDetail,
  PublishContentDto,
  PublishProductDto,
  PublishResult,
  ReceivePreference,
  RecommendFeedQuery,
  RecommendMeta,
  RemoveBgDto,
  RemoveWatermarkDto,
  ReviewDto,
  RewriteDto,
  SearchQuery,
  SearchResult,
  SendMessageDto,
  ShareDto,
  SourceFeedQuery,
  SubAccount,
  TeleprompterDto,
  Topic,
  ToolResult,
  TrendingDto,
  UnreadCount,
  UpdateProfileDto,
  User,
  UserBrief,
  AccountAnalysisDto,
  ContactLogDto,
  ContactLogResult,
  ContactSendDto,
  ContactSendResult,
} from '@wfb/shared-types';
import type { Requester } from './http';

export interface ApiClient {
  auth: {
    login(dto: LoginDto): Promise<LoginResult>;
    demoAccounts(): Promise<User[]>;
    me(): Promise<User>;
    logout(): Promise<{ ok: boolean }>;
    certify(dto: CertifyDto): Promise<CertifyResult>;
    certStatus(): Promise<CertifyResult>;
  };
  profile: {
    detail(userId: number): Promise<ProfileDetail>;
    update(dto: UpdateProfileDto): Promise<User>;
    content(userId: number, q?: { tab?: string } & Record<string, unknown>): Promise<Paged<ArticleSummary>>;
    collect(userId: number, q?: Record<string, unknown>): Promise<Paged<ArticleSummary>>;
    likes(userId: number, q?: Record<string, unknown>): Promise<Paged<ArticleSummary>>;
    followers(userId: number, q?: Record<string, unknown>): Promise<Paged<UserBrief>>;
    following(userId: number, q?: Record<string, unknown>): Promise<Paged<UserBrief>>;
  };
  info: {
    feed(q?: FeedQuery): Promise<FeedResult<ArticleSummary>>;
    detail(id: number): Promise<ArticleDetail>;
    distillation(q?: { period?: number } & Record<string, unknown>): Promise<Paged<ArticleSummary>>;
    courseList(q?: { category?: string } & Record<string, unknown>): Promise<Paged<Course>>;
    courseDetail(id: number): Promise<Course>;
    search(q: { keyword: string } & Record<string, unknown>): Promise<SearchResult>;
  };
  landmark: {
    list(q?: { city?: string } & Record<string, unknown>): Promise<Paged<LandmarkShop & { user: UserBrief }>>;
    detail(id: number): Promise<LandmarkShop & { user: UserBrief; articles: ArticleSummary[]; followed: boolean }>;
  };
  source: {
    feed(q?: SourceFeedQuery): Promise<FeedResult<Product>>;
    detail(id: number): Promise<Product & { related: Product[]; liked: boolean; collected: boolean; followed: boolean; toolEntries: { key: string; label: string; path: string }[] }>;
    search(q: SearchQuery): Promise<SearchResult>;
    manufacturers(q?: Record<string, unknown>): Promise<Paged<UserBrief & { productCount: number; contactRate: number }>>;
  };
  contact: {
    log(dto: ContactLogDto): Promise<ContactLogResult>;
    dashboard(q?: Record<string, unknown>): Promise<DashboardAnalytics>;
    send(dto: ContactSendDto): Promise<ContactSendResult>;
    list(q?: Record<string, unknown>): Promise<Paged<import('@wfb/shared-types').ContactLog>>;
    preference(): Promise<ReceivePreference>;
    savePreference(dto: Partial<ReceivePreference>): Promise<ReceivePreference>;
  };
  content: {
    publish(dto: PublishContentDto): Promise<PublishResult>;
    update(id: number, dto: Partial<PublishContentDto>): Promise<PublishResult>;
    remove(id: number): Promise<{ ok: boolean; restorableUntil: string }>;
    restore(id: number): Promise<{ ok: boolean }>;
    my(q?: { board?: string; sort?: string } & Record<string, unknown>): Promise<Paged<ArticleSummary>>;
    top(id: number): Promise<{ ok: boolean; topped: boolean }>;
    analytics(id: number): Promise<ContentAnalytics>;
    saveDraft(dto: Partial<PublishContentDto> & { id?: number }): Promise<Draft>;
    drafts(): Promise<Draft[]>;
    deleteDraft(id: number): Promise<{ ok: boolean }>;
  };
  product: {
    publish(dto: PublishProductDto): Promise<PublishResult>;
    my(q?: Record<string, unknown>): Promise<Paged<Product>>;
    update(id: number, dto: Partial<PublishProductDto>): Promise<{ ok: boolean }>;
    remove(id: number): Promise<{ ok: boolean }>;
  };
  interaction: {
    like(dto: LikeDto): Promise<InteractionState>;
    unlike(dto: LikeDto): Promise<InteractionState>;
    comment(dto: CommentDto): Promise<Comment>;
    commentList(targetType: string, targetId: number, q?: Record<string, unknown>): Promise<Paged<Comment>>;
    deleteComment(id: number): Promise<{ ok: boolean }>;
    collect(dto: CollectDto): Promise<InteractionState>;
    uncollect(dto: CollectDto): Promise<InteractionState>;
    share(dto: ShareDto): Promise<{ ok: boolean; shareCount: number }>;
    follow(dto: FollowDto): Promise<InteractionState>;
    unfollow(dto: FollowDto): Promise<InteractionState>;
    likes(targetType: string, targetId: number, q?: Record<string, unknown>): Promise<Paged<UserBrief>>;
  };
  message: {
    conversations(): Promise<Conversation[]>;
    conversation(id: number): Promise<{ conversation: Conversation; messages: Message[] }>;
    send(dto: SendMessageDto): Promise<Message>;
    read(id: number): Promise<{ ok: boolean }>;
    remove(id: number): Promise<{ ok: boolean }>;
  };
  notification: {
    list(q?: NotificationQuery): Promise<Paged<Notification>>;
    read(id: number): Promise<{ ok: boolean }>;
    readAll(): Promise<{ ok: boolean }>;
    unreadCount(): Promise<UnreadCount>;
  };
  groupbuy: {
    create(dto: CreateGroupBuyDto): Promise<GroupBuy>;
    list(q?: Record<string, unknown>): Promise<Paged<GroupBuy>>;
    detail(id: number): Promise<GroupBuy>;
    join(id: number): Promise<GroupBuy>;
    quit(id: number): Promise<GroupBuy>;
    mine(): Promise<GroupBuy[]>;
  };
  fair: {
    list(q?: Record<string, unknown>): Promise<Paged<OrderingFair>>;
    detail(id: number): Promise<OrderingFair>;
    create(dto: CreateFairDto): Promise<OrderingFair>;
    signup(id: number): Promise<OrderingFair>;
  };
  topic: {
    list(q?: Record<string, unknown>): Promise<Paged<Topic>>;
    detail(tag: string): Promise<{ topic: Topic; articles: ArticleSummary[]; products: Product[] }>;
  };
  tools: {
    rewrite(dto: RewriteDto): Promise<ToolResult>;
    removeWatermark(dto: RemoveWatermarkDto): Promise<ToolResult>;
    trending(dto: TrendingDto): Promise<ToolResult>;
    accountAnalysis(dto: AccountAnalysisDto): Promise<ToolResult>;
    accountDiagnosis(dto: AccountAnalysisDto): Promise<ToolResult>;
    generateImage(dto: GenerateImageDto): Promise<ToolResult>;
    removeBg(dto: RemoveBgDto): Promise<ToolResult>;
    operationAdvice(dto: OperationAdviceDto): Promise<ToolResult>;
    teleprompter(dto: TeleprompterDto): Promise<ToolResult>;
    videoEdit(dto: { templateId: string; materialUrls: string[] }): Promise<ToolResult>;
    quota(): Promise<{ tool: string; used: number; limit: number }[]>;
  };
  recommend: {
    feed(q: RecommendFeedQuery): Promise<FeedResult<ArticleSummary | Product>>;
    meta(): Promise<RecommendMeta>;
  };
  search: {
    all(q: SearchQuery): Promise<SearchResult>;
    hotKeywords(): Promise<{ keyword: string; heat: number }[]>;
  };
  subAccount: {
    list(): Promise<SubAccount[]>;
    create(dto: CreateSubAccountDto): Promise<SubAccount>;
    remove(id: number): Promise<{ ok: boolean }>;
  };
  audit: {
    textCheck(text: string, scene?: number): Promise<{ pass: boolean; reason?: string; hitWords?: string[]; source: string }>;
    queue(q?: AuditQueueQuery): Promise<Paged<AuditLog>>;
    review(dto: ReviewDto): Promise<{ ok: boolean }>;
    callback(dto: AuditCallbackDto): Promise<{ ok: boolean; message: string }>;
    verifyCallback(q: Record<string, unknown>): Promise<string>;
  };
  admin: {
    overview(): Promise<AdminOverview>;
    users(q?: AdminUserQuery): Promise<Paged<AdminUserRow>>;
    updateCert(userId: number, action: 'approve' | 'reject', reason?: string): Promise<{ ok: boolean }>;
    reviewContent(id: number, action: 'approve' | 'reject'): Promise<{ ok: boolean }>;
    seed(): Promise<{ ok: boolean; counts: Record<string, number> }>;
  };
  system: {
    health(): Promise<{ status: string; driver: string; uptime: number; version: string; time: string }>;
    stats(): Promise<Record<string, number>>;
  };
}

/** 一站式工厂：所有端共用同一份接口定义 */
export function createApiClient(req: Requester): ApiClient {
  /** 查询参数统一透传：接口签名用强类型 DTO，网络层只关心键值对 */
  const q = (o?: unknown) => (o ?? undefined) as Record<string, unknown> | undefined;
  return {
    auth: {
      login: (dto) => req.post('/api/auth/login', dto),
      demoAccounts: () => req.get('/api/auth/demo-accounts'),
      me: () => req.get('/api/auth/me'),
      logout: () => req.post('/api/auth/logout'),
      certify: (dto) => req.post('/api/auth/certify', dto),
      certStatus: () => req.get('/api/auth/certify/status'),
    },
    profile: {
      detail: (userId) => req.get(`/api/profile/${userId}`),
      update: (dto) => req.put('/api/profile', dto),
      content: (userId, p) => req.get(`/api/profile/${userId}/content`, q(p)),
      collect: (userId, p) => req.get(`/api/profile/${userId}/collect`, q(p)),
      likes: (userId, p) => req.get(`/api/profile/${userId}/likes`, q(p)),
      followers: (userId, p) => req.get(`/api/profile/${userId}/followers`, q(p)),
      following: (userId, p) => req.get(`/api/profile/${userId}/following`, q(p)),
    },
    info: {
      feed: (p) => req.get('/api/info/feed', q(p)),
      detail: (id) => req.get(`/api/info/detail/${id}`),
      distillation: (p) => req.get('/api/info/distillation', q(p)),
      courseList: (p) => req.get('/api/info/course/list', q(p)),
      courseDetail: (id) => req.get(`/api/info/course/${id}`),
      search: (p) => req.get('/api/info/search', q(p)),
    },
    landmark: {
      list: (p) => req.get('/api/landmark/list', q(p)),
      detail: (id) => req.get(`/api/landmark/${id}`),
    },
    source: {
      feed: (p) => req.get('/api/source/feed', q(p)),
      detail: (id) => req.get(`/api/source/detail/${id}`),
      search: (p) => req.get('/api/source/search', q(p)),
      manufacturers: (p) => req.get('/api/source/manufacturers', q(p)),
    },
    contact: {
      log: (dto) => req.post('/api/contact/log', dto),
      dashboard: (p) => req.get('/api/manufacturer/contact/dashboard', q(p)),
      send: (dto) => req.post('/api/manufacturer/contact/send', dto),
      list: (p) => req.get('/api/manufacturer/contact/list', q(p)),
      preference: () => req.get('/api/contact/preference'),
      savePreference: (dto) => req.put('/api/contact/preference', dto),
    },
    content: {
      publish: (dto) => req.post('/api/content/publish', dto),
      update: (id, dto) => req.put(`/api/content/${id}`, dto),
      remove: (id) => req.del(`/api/content/${id}`),
      restore: (id) => req.post(`/api/content/${id}/restore`),
      my: (p) => req.get('/api/content/my', q(p)),
      top: (id) => req.put(`/api/content/${id}/top`),
      analytics: (id) => req.get(`/api/content/${id}/analytics`),
      saveDraft: (dto) => req.post('/api/content/draft', dto),
      drafts: () => req.get('/api/content/draft'),
      deleteDraft: (id) => req.del(`/api/content/draft/${id}`),
    },
    product: {
      publish: (dto) => req.post('/api/manufacturer/product/publish', dto),
      my: (p) => req.get('/api/manufacturer/product/my', q(p)),
      update: (id, dto) => req.put(`/api/manufacturer/product/${id}`, dto),
      remove: (id) => req.del(`/api/manufacturer/product/${id}`),
    },
    interaction: {
      like: (dto) => req.post('/api/interaction/like', dto),
      unlike: (dto) => req.del('/api/interaction/like', dto),
      comment: (dto) => req.post('/api/interaction/comment', dto),
      commentList: (targetType, targetId, p) => req.get(`/api/interaction/comments/${targetType}/${targetId}`, q(p)),
      deleteComment: (id) => req.del(`/api/interaction/comment/${id}`),
      collect: (dto) => req.post('/api/interaction/collect', dto),
      uncollect: (dto) => req.del('/api/interaction/collect', dto),
      share: (dto) => req.post('/api/interaction/share', dto),
      follow: (dto) => req.post('/api/interaction/follow', dto),
      unfollow: (dto) => req.del('/api/interaction/follow', dto),
      likes: (targetType, targetId, p) => req.get(`/api/interaction/likes/${targetType}/${targetId}`, q(p)),
    },
    message: {
      conversations: () => req.get('/api/message/conversations'),
      conversation: (id) => req.get(`/api/message/conversation/${id}`),
      send: (dto) => req.post('/api/message/send', dto),
      read: (id) => req.put(`/api/message/read/${id}`),
      remove: (id) => req.del(`/api/message/conversation/${id}`),
    },
    notification: {
      list: (p) => req.get('/api/notification/list', q(p)),
      read: (id) => req.put(`/api/notification/read/${id}`),
      readAll: () => req.put('/api/notification/read-all'),
      unreadCount: () => req.get('/api/notification/unread-count'),
    },
    groupbuy: {
      create: (dto) => req.post('/api/groupbuy/create', dto),
      list: (p) => req.get('/api/groupbuy/list', q(p)),
      detail: (id) => req.get(`/api/groupbuy/detail/${id}`),
      join: (id) => req.post(`/api/groupbuy/join/${id}`),
      quit: (id) => req.post(`/api/groupbuy/quit/${id}`),
      mine: () => req.get('/api/groupbuy/mine'),
    },
    fair: {
      list: (p) => req.get('/api/ordering-fair/list', q(p)),
      detail: (id) => req.get(`/api/ordering-fair/detail/${id}`),
      create: (dto) => req.post('/api/ordering-fair/create', dto),
      signup: (id) => req.post(`/api/ordering-fair/signup/${id}`),
    },
    topic: {
      list: (p) => req.get('/api/topic/list', q(p)),
      detail: (tag) => req.get(`/api/topic/detail/${encodeURIComponent(tag)}`),
    },
    tools: {
      rewrite: (dto) => req.post('/api/tools/rewrite', dto),
      removeWatermark: (dto) => req.post('/api/tools/remove-watermark', dto),
      trending: (dto) => req.post('/api/tools/trending', dto),
      accountAnalysis: (dto) => req.post('/api/tools/account-analysis', dto),
      accountDiagnosis: (dto) => req.post('/api/tools/account-diagnosis', dto),
      generateImage: (dto) => req.post('/api/tools/generate-image', dto),
      removeBg: (dto) => req.post('/api/tools/remove-bg', dto),
      operationAdvice: (dto) => req.post('/api/tools/operation-advice', dto),
      teleprompter: (dto) => req.post('/api/tools/teleprompter', dto),
      videoEdit: (dto) => req.post('/api/tools/video-edit', dto),
      quota: () => req.get('/api/tools/quota'),
    },
    recommend: {
      feed: (p) => req.get('/api/recommend/feed', q(p)),
      meta: () => req.get('/api/recommend/meta'),
    },
    search: {
      all: (p) => req.get('/api/search', q(p)),
      hotKeywords: () => req.get('/api/search/hot-keywords'),
    },
    subAccount: {
      list: () => req.get('/api/manufacturer/sub-account/list'),
      create: (dto) => req.post('/api/manufacturer/sub-account/create', dto),
      remove: (id) => req.del(`/api/manufacturer/sub-account/${id}`),
    },
    audit: {
      textCheck: (text, scene) => req.post('/api/audit/content', { text, scene }),
      queue: (p) => req.get('/api/audit/queue', q(p)),
      review: (dto) => req.post('/api/audit/review', dto),
      callback: (dto) => req.post('/api/audit/callback', dto),
      verifyCallback: (p) => req.get('/api/audit/callback', q(p)),
    },
    admin: {
      overview: () => req.get('/api/admin/overview'),
      users: (p) => req.get('/api/admin/users', q(p)),
      updateCert: (userId, action, reason) => req.post(`/api/admin/cert/${userId}`, { action, reason }),
      reviewContent: (id, action) => req.post(`/api/admin/content/${id}/review`, { action }),
      seed: () => req.post('/api/admin/seed'),
    },
    system: {
      health: () => req.get('/api/health'),
      stats: () => req.get('/api/system/stats'),
    },
  };
}

export * from './http';
