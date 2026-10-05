/**
 * 全局常量与枚举字典（前后端共用）
 * 与第九篇《数据库设计》中的 ENUM 取值一一对应，改这里等于改全部端。
 */

export const USER_ROLES = ['shop_owner', 'manufacturer', 'landmark', 'lecturer', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CERT_STATUSES = ['none', 'pending', 'approved', 'rejected'] as const;
export type CertStatus = (typeof CERT_STATUSES)[number];

export const MEMBER_LEVELS = [
  'free',
  'elite',
  'shark',
  'tour',
  'manufacturer_free',
  'manufacturer_basic',
  'manufacturer_pro',
  'manufacturer_enterprise',
] as const;
export type MemberLevel = (typeof MEMBER_LEVELS)[number];

/** 内容可见范围：public 公开 / fans 仅粉丝 / group 仅群成员 / elite|shark|landmark 会员分层 */
export const VISIBILITIES = ['public', 'fans', 'group', 'elite', 'shark', 'landmark'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const AUDIT_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

export const CONTENT_TYPES = [
  'image_text',
  'video',
  'long_article',
  'product_card',
  'sourcing_shot',
  'outfit',
  'groupbuy_recruit',
  'fair_info',
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const ARTICLE_TYPES = ['distillation', 'methodology', 'news', 'course', 'guide', 'ugc'] as const;
export type ArticleType = (typeof ARTICLE_TYPES)[number];

export const INTERACTION_TARGETS = ['article', 'product', 'comment'] as const;
export type TargetType = (typeof INTERACTION_TARGETS)[number];

export const NOTIFICATION_TYPES = [
  'like',
  'comment',
  'reply',
  'mention',
  'follow',
  'message',
  'contact',
  'audit',
  'system',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const GROUPBUY_STATUSES = ['recruiting', 'formed', 'completed', 'cancelled'] as const;
export type GroupBuyStatus = (typeof GROUPBUY_STATUSES)[number];

/** 风格标签字典（全模块统一的推荐基准） */
export const STYLE_TAGS = ['韩系', '法式', '新中式', '轻奢', '欧美', '休闲', '复古', '甜美', '通勤'] as const;
export type StyleTag = (typeof STYLE_TAGS)[number];

/** 女装批发市场字典（拿货地 / 定位） */
export const MARKETS = ['十三行', '南油', '意法', '濮院', '沙河', '白马', '四季青', '虎门'] as const;
export type Market = (typeof MARKETS)[number];

export const PRICE_BANDS = ['0-50', '50-100', '100-200', '200-500', '500-1000', '1000+'] as const;
export type PriceBand = (typeof PRICE_BANDS)[number];

export const PLATFORMS = ['weapp', 'tt', 'alipay', 'h5', 'app'] as const;
export type Platform = (typeof PLATFORMS)[number];

/** 厂家版本权益表（9.3）—— 前后端共用同一份，避免口径不一致 */
export interface PlanQuota {
  level: MemberLevel;
  label: string;
  /** 年费（元） */
  price: number;
  /** 每日主动私信配额，-1 = 无限 */
  dailyMessages: number;
  /** 可发布款数，-1 = 不限 */
  productLimit: number;
  /** 子账号数，-1 = 不限 */
  subAccounts: number;
  /** 数据看板等级 */
  dashboard: 'basic' | 'contact' | 'funnel' | 'full';
  groupSend: boolean;
  orderingFair: boolean;
}

export const MANUFACTURER_PLANS: PlanQuota[] = [
  {
    level: 'manufacturer_free',
    label: '免费版',
    price: 0,
    dailyMessages: 10,
    productLimit: 3,
    subAccounts: 0,
    dashboard: 'basic',
    groupSend: false,
    orderingFair: false,
  },
  {
    level: 'manufacturer_basic',
    label: '基础版',
    price: 3980,
    dailyMessages: 30,
    productLimit: 15,
    subAccounts: 1,
    dashboard: 'contact',
    groupSend: false,
    orderingFair: false,
  },
  {
    level: 'manufacturer_pro',
    label: '高级版',
    price: 9800,
    dailyMessages: 100,
    productLimit: -1,
    subAccounts: 3,
    dashboard: 'funnel',
    groupSend: true,
    orderingFair: true,
  },
  {
    level: 'manufacturer_enterprise',
    label: '企业版',
    price: 29800,
    dailyMessages: -1,
    productLimit: -1,
    subAccounts: -1,
    dashboard: 'full',
    groupSend: true,
    orderingFair: true,
  },
];

/** 店主人会员分层权益 */
export const OWNER_PLANS: PlanQuota[] = [
  {
    level: 'free',
    label: '游客/免费',
    price: 0,
    dailyMessages: 0,
    productLimit: 0,
    subAccounts: 0,
    dashboard: 'basic',
    groupSend: false,
    orderingFair: false,
  },
  {
    level: 'elite',
    label: '精英群',
    price: 1980,
    dailyMessages: 0,
    productLimit: 0,
    subAccounts: 0,
    dashboard: 'basic',
    groupSend: false,
    orderingFair: false,
  },
  {
    level: 'shark',
    label: '鲨鱼群',
    price: 5980,
    dailyMessages: 0,
    productLimit: 0,
    subAccounts: 0,
    dashboard: 'basic',
    groupSend: false,
    orderingFair: false,
  },
  {
    level: 'tour',
    label: '游学卡',
    price: 12800,
    dailyMessages: 0,
    productLimit: 0,
    subAccounts: 0,
    dashboard: 'basic',
    groupSend: false,
    orderingFair: false,
  },
];

/** 查版本权益，未知版本回退免费版 */
export function planOf(level: string): PlanQuota {
  return (
    MANUFACTURER_PLANS.find((p) => p.level === level) ??
    OWNER_PLANS.find((p) => p.level === level) ??
    MANUFACTURER_PLANS[0]
  );
}

/** 功能板块每个工具的免费额度（每日次数，-1 = 不限，0 = 仅会员） */
export const TOOL_FREE_QUOTA: Record<string, number> = {
  rewrite: 3,
  'remove-watermark': 3,
  trending: 3,
  'account-analysis': 1,
  'account-diagnosis': 0,
  'ai-image': 1,
  'remove-bg': 3,
  teleprompter: -1,
  'video-edit': 0,
  'operation-advice': 0,
};

/** 功能板块工具清单（首页聚合用，前端与后端共用） */
export interface ToolMeta {
  key: string;
  name: string;
  desc: string;
  icon: string;
  path: string;
  /** 是否会员专属 */
  memberOnly: boolean;
  freeQuota: number;
}

export const TOOLS: ToolMeta[] = [
  { key: 'rewrite', name: '文案改写', desc: '输入原文，AI 改写为原创带货文案', icon: '✍️', path: '/pages/tools/rewrite', memberOnly: false, freeQuota: 3 },
  { key: 'remove-watermark', name: '去水印', desc: '粘贴抖音/小红书链接，取无水印视频', icon: '💧', path: '/pages/tools/watermark', memberOnly: false, freeQuota: 3 },
  { key: 'trending', name: '爆款选题', desc: '按风格推荐近期爆款选题', icon: '🔥', path: '/pages/tools/trending', memberOnly: false, freeQuota: 3 },
  { key: 'account-analysis', name: '账号分析', desc: '分析内容质量、粉丝画像、爆款率', icon: '📊', path: '/pages/tools/account-analysis', memberOnly: false, freeQuota: 1 },
  { key: 'account-diagnosis', name: '账号诊断', desc: '深度诊断 + 具体优化方案', icon: '🩺', path: '/pages/tools/account-diagnosis', memberOnly: true, freeQuota: 0 },
  { key: 'teleprompter', name: '拍视频提词器', desc: '全屏滚动提词，可调语速字号', icon: '🎬', path: '/pages/tools/teleprompter', memberOnly: false, freeQuota: -1 },
  { key: 'ai-image', name: 'AI 配图', desc: '输入文字生成商品主图/海报', icon: '🖼️', path: '/pages/tools/ai-image', memberOnly: false, freeQuota: 1 },
  { key: 'video-edit', name: '视频剪辑', desc: '模板化剪辑，一键生成短视频', icon: '✂️', path: '/pages/tools/video-edit', memberOnly: true, freeQuota: 0 },
  { key: 'remove-bg', name: '图片去背景', desc: '商品图一键去背景', icon: '🪄', path: '/pages/tools/remove-bg', memberOnly: false, freeQuota: 3 },
  { key: 'operation-advice', name: '运营建议', desc: '输入店铺数据，AI 给优化建议', icon: '💡', path: '/pages/tools/operation-advice', memberOnly: true, freeQuota: 0 },
];

/** 风格 → 视觉主题色（各端统一，用于标签/卡片配色） */
export const STYLE_COLORS: Record<string, string> = {
  韩系: '#8FA9FF',
  法式: '#E9A0B6',
  新中式: '#B98A5A',
  轻奢: '#2B2B33',
  欧美: '#7A6F63',
  休闲: '#7FBF9B',
  复古: '#C08552',
  甜美: '#F6A6C1',
  通勤: '#5B7DB1',
};

/** 资讯板块内容类型中文名 */
export const ARTICLE_TYPE_LABELS: Record<string, string> = {
  distillation: '游学蒸馏',
  methodology: '大店方法论',
  news: '行业早报',
  course: '讲师课程',
  guide: '找厂家攻略',
  ugc: '用户分享',
};

/** 通知类型中文名 */
export const NOTIFICATION_LABELS: Record<string, string> = {
  like: '赞了你的内容',
  comment: '评论了你',
  reply: '回复了你',
  mention: '在内容中提到了你',
  follow: '关注了你',
  message: '给你发了私信',
  contact: '有人加了你的微信',
  audit: '内容审核结果',
  system: '系统通知',
};
