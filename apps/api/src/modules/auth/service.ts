import type { CertifyDto, CertifyResult, LoginDto, LoginResult, StyleTag, User } from '@wfb/shared-types';
import { STYLE_TAGS } from '@wfb/shared-types';
import type { Store } from '../../core/db';
import { nextId } from '../../core/db';
import { signToken, stripPrivate } from '../../core/security';
import { Errors } from '../../core/server';

/* =========================================================================
 * 认证模块业务逻辑（不碰 ctx，全部纯函数 + Store 读写）
 *
 * 覆盖：演示账号 / 三通道登录 / 当前用户 / 退出 / 四步认证流转
 * 认证四步：营业执照 OCR → 法人身份证 → 人脸核验 → 对公打款
 *   - 进度随提交字段推进（每完成一步 +25）
 *   - OCR 用本地规则从 companyName + licenseUrl 生成可复现的 mock 结果（无外部依赖）
 *   - 四步齐全 → certStatus = pending（等管理后台审批），密钥类字段全部落在 certOcrData
 * ========================================================================= */

const nowIso = () => new Date().toISOString();

/** 平台 → openid 字段映射（小程序登录通道） */
const OPENID_FIELD: Record<string, 'wxOpenid' | 'dyOpenid' | 'aliOpenid'> = {
  weapp: 'wxOpenid',
  tt: 'dyOpenid',
  alipay: 'aliOpenid',
  h5: 'wxOpenid',
  app: 'wxOpenid',
};

/** 认证四步：key 对外、field 对应 certOcrData 里的存档 */
export const CERT_STEPS = [
  { key: 'license_ocr', field: 'license', label: '营业执照 OCR 识别' },
  { key: 'legal_id', field: 'legalId', label: '法人身份证核验' },
  { key: 'face_verify', field: 'face', label: '人脸活体核验' },
  { key: 'bank_transfer', field: 'bank', label: '对公打款验证' },
] as const;

export type CertStepKey = (typeof CERT_STEPS)[number]['key'];

/** 认证过程存档（存进 user.certOcrData，Demo 阶段代替 certification 表） */
export interface CertRecord {
  /** 营业执照 OCR：字段名与 CertifyResult.ocrData 对齐，前端可直接渲染 */
  license?: {
    /** 注册号（统一社会信用代码） */
    regNo: string;
    /** 法定代表人 */
    legalPerson: string;
    companyName: string;
    address: string;
    /** 营业期限 */
    validPeriod: string;
    /** 经营范围 */
    businessScope: string;
    /** 主体类型 */
    entityType: string;
    /** 识别来源：Demo 固定 mock-cfca，接入真实 OCR 后替换 */
    ocrProvider: string;
    /** 0-1 */
    confidence: number;
    ocrAt?: string;
  };
  legalId?: { legalName: string; frontUrl: string; backUrl?: string; maskedIdCard: string; verifiedAt: string };
  face?: { faceVerifyId: string; similarity: number; verifiedAt: string };
  bank?: { amount: number; accountTail: string; matched: boolean; verifiedAt: string };
  role?: string;
  submittedAt?: string;
  /**
   * 登录引导填写的信息（名字 / 开店城市 / 店名）。
   * 与 legalId 分离：legalId 是法人实名（需身份证材料），onboarding 只是身份确认与展示。
   */
  onboarding?: { ownerName?: string; city?: string; shopName?: string; at?: string };
}

/* ------------------------------ 演示账号 ------------------------------ */

const ROLE_ORDER = ['shop_owner', 'manufacturer', 'landmark', 'lecturer', 'admin'];

/**
 * 演示账号列表（公开接口）。
 * 只返回「种子演示身份」：资料完善（有简介/主体名）且不是某厂家的子账号。
 * 手机号 / 验证码登录临时新建的用户（bio 为空）不会混进演示列表，保证列表稳定在 14 个种子身份。
 * 返回 User 形状但用 stripPrivate 剔除手机号 / openid / 营业执照 —— 谁都不能拿到别人的隐私字段。
 */
export function demoAccounts(store: Store): User[] {
  const subUserIds = new Set(Array.from(store.subAccounts.values()).map((r) => r.subUserId));
  return Array.from(store.users.values())
    .filter((u) => !subUserIds.has(u.id) && Boolean(u.bio && u.bio.trim()))
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.id - b.id)
    .map((u) => stripPrivate(u, false));
}

/* ------------------------------ 登录 ------------------------------ */

export function login(store: Store, dto: LoginDto): LoginResult {
  /* 通道一：演示账号一键登录 */
  if (dto.demoUserId !== undefined && dto.demoUserId !== null) {
    const user = store.users.get(Number(dto.demoUserId));
    if (!user) throw Errors.notFound('演示账号不存在');
    return { token: signToken(user), user, isNew: false };
  }

  /* 通道二：手机号 + 验证码（Demo 阶段任意 4-6 位数字） */
  const phone = String(dto.phone ?? '').trim();
  if (phone) {
    if (!/^1\d{10}$/.test(phone)) throw Errors.badRequest('手机号格式不正确');
    if (!/^\d{4,6}$/.test(String(dto.code ?? '').trim())) throw Errors.badRequest('验证码为 4-6 位数字');
    const exist = findByPhone(store, phone);
    if (exist) return { token: signToken(exist), user: exist, isNew: false };
    const user = createUser(store, {
      phone,
      nickname: cleanNickname(dto.nickname) || `店主${phone.slice(-4)}`,
    });
    return { token: signToken(user), user, isNew: true };
  }

  /* 通道三：小程序平台登录 */
  const platform = dto.platform;
  const loginCode = String(dto.loginCode ?? '').trim();
  if (platform && loginCode) {
    const field = OPENID_FIELD[platform];
    if (!field) throw Errors.badRequest('platform 仅支持 weapp / tt / alipay / h5 / app');
    const openid = `${platform}_${loginCode}`;
    const exist = Array.from(store.users.values()).find((u) => u[field] === openid);
    if (exist) return { token: signToken(exist), user: exist, isNew: false };
    const user = createUser(store, {
      nickname: cleanNickname(dto.nickname) || `新店主${store.users.size + 1}`,
      openid: { field, value: openid },
    });
    return { token: signToken(user), user, isNew: true };
  }

  throw Errors.badRequest('缺少登录凭证：请提供 demoUserId / phone+code / platform+loginCode');
}

function findByPhone(store: Store, phone: string): User | undefined {
  return Array.from(store.users.values()).find((u) => u.phone === phone);
}

function cleanNickname(v?: string): string {
  return String(v ?? '').trim().slice(0, 20);
}

/** 新用户一律以 shop_owner 身份进入，认证后再切换角色（前端据此引导认证 + 选风格标签） */
function createUser(
  store: Store,
  input: { phone?: string; nickname: string; openid?: { field: 'wxOpenid' | 'dyOpenid' | 'aliOpenid'; value: string } },
): User {
  const id = nextId(store, 'users');
  const ts = nowIso();
  const user: User = {
    id,
    phone: input.phone,
    nickname: input.nickname,
    avatarUrl: `https://picsum.photos/seed/wfb-user-${id}/200/200`,
    bio: '',
    role: 'shop_owner',
    certStatus: 'none',
    styleTags: [],
    sourcingCities: [],
    memberLevel: 'free',
    pushEnabled: true,
    createdAt: ts,
    updatedAt: ts,
  };
  if (input.openid) user[input.openid.field] = input.openid.value;
  store.users.set(id, user);
  return user;
}

/* ------------------------------ 认证 ------------------------------ */

/**
 * 提交认证：按「已提交的字段」推进四步进度。
 * 允许一次提交全部四步，也允许分步提交；跳步会直接 400，保证流转顺序。
 */
export function applyCertify(store: Store, user: User, dto: CertifyDto): CertifyResult {
  const companyName = String(dto.companyName ?? '').trim();
  const licenseUrl = String(dto.licenseUrl ?? '').trim();
  const role = dto.role;
  if (!role || !['shop_owner', 'manufacturer', 'landmark', 'lecturer'].includes(role)) {
    throw Errors.badRequest('role 仅支持 shop_owner / manufacturer / landmark / lecturer');
  }
  const record: CertRecord = { ...((user.certOcrData as CertRecord | undefined) ?? {}) };

  /* 第 1 步：营业执照 OCR（本地规则，可复现） */
  record.license = runLicenseOcr(companyName, licenseUrl);
  record.role = role;

  /* 第 2 步：法人身份证（需 legalName + idCardFrontUrl 同时提供） */
  if (dto.legalName || dto.idCardFrontUrl || dto.idCardBackUrl) {
    if (!dto.legalName || !dto.idCardFrontUrl) throw Errors.badRequest('法人身份证需同时提供 legalName 与 idCardFrontUrl');
    record.legalId = {
      legalName: String(dto.legalName).trim(),
      frontUrl: String(dto.idCardFrontUrl).trim(),
      backUrl: dto.idCardBackUrl ? String(dto.idCardBackUrl).trim() : undefined,
      maskedIdCard: maskIdCard(hash(`${companyName}|${dto.legalName}`)),
      verifiedAt: nowIso(),
    };
  }

  /* 第 3 步：人脸核验（依赖第 2 步）；前端只传字段不带值时，后端生成 mock 流水号回显 */
  if (dto.faceVerifyId !== undefined) {
    if (!record.legalId) throw Errors.badRequest('请先完成法人身份证核验（legalName + idCardFrontUrl）');
    const supplied = String(dto.faceVerifyId).trim();
    record.face = {
      faceVerifyId: supplied || `FACE-MOCK-${Date.now().toString(36).toUpperCase()}`,
      similarity: 98.6,
      verifiedAt: nowIso(),
    };
  }

  /* 第 4 步：对公打款验证（依赖第 3 步）。金额区间与契约一致：0.01 ~ 0.1 元 */
  if (dto.bankAmount !== undefined && dto.bankAmount !== null && String(dto.bankAmount) !== '') {
    if (!record.face) throw Errors.badRequest('请先完成人脸活体核验（faceVerifyId）');
    const amount = Number(dto.bankAmount);
    if (!Number.isFinite(amount) || amount <= 0) throw Errors.badRequest('bankAmount 必须是正数');
    if (amount < 0.01 || amount > 0.1) throw Errors.badRequest('bankAmount 需在 0.01 ~ 0.1 元之间（对公打款验证金额）');
    record.bank = {
      amount: Math.round(amount * 100) / 100,
      accountTail: String(hash(`${companyName}|bank`) % 10000).padStart(4, '0'),
      matched: true,
      verifiedAt: nowIso(),
    };
  }

  record.submittedAt = nowIso();

  /* 落库：主体信息 + 认证存档 + 认证后确定角色 */
  user.companyName = companyName;
  user.certLicenseUrl = licenseUrl;
  user.certOcrData = record as Record<string, unknown>;
  user.role = role;
  /* 登录引导填写的信息（名字 / 开店城市 / 店名）—— 独立于法人实名，可单独提交 */
  if (dto.shopName) user.companyName = String(dto.shopName).trim().slice(0, 60);
  /**
   * 登录引导填写的「名字 / 开店城市」：
   * 店主姓名用于身份确认与展示，城市用于「同城」推荐与附近厂家。
   * 只在这里落库，不需要身份证材料（与法人实名是两个不同强度的校验）。
   */
  if (dto.ownerName || dto.city || dto.shopName) {
    const onboarding = ((record.onboarding as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
    if (dto.ownerName) onboarding.ownerName = String(dto.ownerName).trim();
    if (dto.city) onboarding.city = String(dto.city).trim();
    if (dto.shopName) onboarding.shopName = String(dto.shopName).trim();
    onboarding.at = nowIso();
    record.onboarding = onboarding;
    if (dto.city) {
      const cities = new Set(user.sourcingCities ?? []);
      cities.add(String(dto.city).trim());
      user.sourcingCities = [...cities].slice(0, 8);
    }
  }
  const styleTags = (dto.styleTags ?? []).filter((t) => (STYLE_TAGS as readonly string[]).includes(t));
  if (styleTags.length) user.styleTags = styleTags as StyleTag[];
  if (dto.priceBand) user.priceBand = String(dto.priceBand);
  if (dto.sourcingCities?.length) user.sourcingCities = dto.sourcingCities.slice(0, 5).map((c) => String(c).trim()).filter(Boolean);
  /* 四步齐全也只是「提交完成」，最终结论由管理后台审批（POST /api/admin/cert/:userId） */
  user.certStatus = 'pending';
  user.updatedAt = nowIso();

  return buildCertifyResult(user);
}

/** 认证进度与步骤（GET /api/auth/certify/status 与提交响应共用同一份口径） */
export function buildCertifyResult(user: User): CertifyResult {
  const record = (user.certOcrData as CertRecord | undefined) ?? {};
  const approved = user.certStatus === 'approved';

  const steps = CERT_STEPS.map((s) => {
    const value = record[s.field];
    const done = approved || !!value;
    return { key: s.key, label: s.label, done, detail: stepDetail(s.key, record, approved) };
  });

  const doneCount = steps.filter((s) => s.done).length;
  let certStatus: CertifyResult['certStatus'];
  if (approved) certStatus = 'approved';
  else if (user.certStatus === 'rejected') certStatus = 'rejected';
  else if (doneCount > 0 || user.certStatus === 'pending') certStatus = 'pending';
  else certStatus = 'none';

  return {
    certStatus,
    steps,
    progress: Math.round((doneCount / CERT_STEPS.length) * 100),
    /* OCR 结果直接下发前端渲染（前端不得造假数据） */
    ocrData: record.license ? { ...record.license } : undefined,
    /* 人脸核验流水号：已提交回显，未提交为 undefined */
    faceVerifyId: record.face?.faceVerifyId,
    /* 对公打款金额：已核验用实收金额；人脸通过后先给出待打款金额，供页面展示 */
    bankAmount: record.bank?.amount ?? (record.face ? pendingBankAmount(record) : undefined),
  };
}

/** 待打款金额（0.01 ~ 0.1 元），由主体名称稳定推导，同一公司每次一致 */
function pendingBankAmount(record: CertRecord): number {
  return Math.round((1 + (hash(record.license?.companyName ?? 'wfb') % 10))) / 100;
}

function stepDetail(key: CertStepKey, record: CertRecord, approved: boolean): string {
  const demo = approved ? '平台已认证（演示数据）' : '';
  switch (key) {
    case 'license_ocr':
      return record.license
        ? `${record.license.companyName} · 注册号 ${record.license.regNo} · ${record.license.entityType} · 置信度 ${record.license.confidence}`
        : `待上传营业执照 · ${demo}`;
    case 'legal_id':
      return record.legalId
        ? `法人 ${record.legalId.legalName} · 证件号 ${record.legalId.maskedIdCard}`
        : `待提交法人身份证正反面 · ${demo}`;
    case 'face_verify':
      return record.face ? `核验流水号 ${record.face.faceVerifyId} · 相似度 ${record.face.similarity}%` : `待人脸活体核验 · ${demo}`;
    case 'bank_transfer':
      return record.bank
        ? `已收到打款 ¥${record.bank.amount.toFixed(2)} · 账户尾号 ${record.bank.accountTail}`
        : `待对公打款验证 · ${demo}`;
    default:
      return demo;
  }
}

/* ------------------------------ 营业执照 OCR（本地规则） ------------------------------ */

/** 城市 / 区县 / 园区成对出现，避免 mock 出「西安市南山区」这类不一致地址 */
const OCR_PLACES: { city: string; district: string; park: string }[] = [
  { city: '杭州市', district: '余杭区', park: '服装产业园' },
  { city: '广州市', district: '白云区', park: '服饰大厦' },
  { city: '深圳市', district: '南山区', park: '原创设计中心' },
  { city: '成都市', district: '锦江区', park: '轻纺城' },
  { city: '郑州市', district: '二七区', park: '服饰大厦' },
  { city: '桐乡市', district: '濮院镇', park: '羊绒产业园' },
  { city: '西安市', district: '雁塔区', park: '服装产业园' },
  { city: '义乌市', district: '北苑街道', park: '轻纺城' },
];
const SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '赵', '周'];
const GIVEN_NAMES = ['建国', '丽娟', '小峰', '美玲', '志强', '秀英', '海涛', '雅琴'];
const BUSINESS_SCOPES = [
  '服装服饰批发；服装服饰零售；针纺织品销售；服装制造；互联网销售（除销售需要许可的商品）；货物进出口。',
  '服装设计；服装服饰批发；面料纺织加工；鞋帽批发；日用百货销售。',
  '服装制造；服装辅料销售；服饰研发；专业设计服务；供应链管理服务。',
];

/**
 * 无外部依赖的 OCR 降级实现：同一份 companyName + licenseUrl 永远得到同一份识别结果，
 * 便于前端联调与截图复现。ocrProvider 固定 mock-cfca，接入真实 CFCA/工商 OCR 后替换即可。
 */
export function runLicenseOcr(companyName: string, licenseUrl: string): NonNullable<CertRecord['license']> {
  const seed = hash(`${companyName}|${licenseUrl}`);
  const place = OCR_PLACES[seed % OCR_PLACES.length];
  const startYear = 2016 + (seed % 8);
  return {
    regNo: `91${String(330000 + (seed % 600000))}MA${String(seed % 100000).padStart(5, '0')}X${String(seed % 100).padStart(2, '0')}`,
    legalPerson: `${SURNAMES[seed % SURNAMES.length]}${GIVEN_NAMES[Math.floor(seed / 3) % GIVEN_NAMES.length]}`,
    companyName,
    address: `${place.city}${place.district}${place.park}${(seed % 199) + 1}号`,
    validPeriod: `${startYear}-0${1 + (seed % 9)}-1${seed % 9} 至 长期`,
    businessScope: BUSINESS_SCOPES[Math.floor(seed / 13) % BUSINESS_SCOPES.length],
    entityType: entityTypeOf(companyName),
    ocrProvider: 'mock-cfca',
    confidence: Math.round((0.93 + (seed % 60) / 1000) * 1000) / 1000,
    ocrAt: nowIso(),
  };
}

/** 主体类型：按名称做本地规则判定（真实场景由 OCR 返回） */
function entityTypeOf(companyName: string): string {
  if (/个体|商行|经营部/.test(companyName)) return '个体工商户';
  if (/厂$|厂（/.test(companyName)) return '个人独资企业';
  if (/有限公司|有限责任公司/.test(companyName)) return '有限责任公司（自然人投资或控股）';
  if (/合作社/.test(companyName)) return '农民专业合作社';
  return '有限责任公司';
}

function maskIdCard(seed: number): string {
  return `3301**********${String(seed % 10000).padStart(4, '0')}`;
}

/** 稳定伪随机（同一输入 → 同一输出），避免 OCR mock 每次抖动 */
function hash(input: string): number {
  let h = 7;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) % 2147483647;
  return h;
}
