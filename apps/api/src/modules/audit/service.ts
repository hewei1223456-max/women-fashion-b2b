import crypto from 'node:crypto';
import type { AuditLog } from '@wfb/shared-types';
import { SENSITIVE_WORDS } from '@wfb/shared-utils';
import type { AuditLogRow, Store } from '../../core/db';
import { nextId, pageOf } from '../../core/db';
import { Errors } from '../../core/server';

/* =========================================================================
 * 内容审核与安全（PRD 第七篇《内容审核与安全》 / docs/API.md 第 14 节）
 *
 *   文本同步审核：本地敏感词库 + 正则模式 + mock 第三方内容安全供应商
 *   媒体异步审核：微信 mediaCheckAsync / msgSecCheck V2 回调（明文 + AES 加密）
 *   审核流转：pending → 文本同步通过 → 媒体异步回调 → approved / rejected（进人工复审）
 *
 * 敏感词库复用 packages/shared-utils 的 SENSITIVE_WORDS，并在此基础上扩展分级词库。
 * ========================================================================= */

export const PROVIDER = process.env.CONTENT_SECURITY_PROVIDER ?? 'mock';
/** 微信回调签名 Token（Demo 默认值，生产用环境变量注入） */
export const WECHAT_TOKEN = process.env.WECHAT_TOKEN ?? 'wfb-demo-token';
/** 微信 EncodingAESKey（43 位），Demo 默认值保证回调链路开箱可用 */
export const DEFAULT_AES_KEY = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
/** 审核记录里最多回显的命中词 */
export const MAX_HIT_WORDS = 20;

/* ============================== 分级敏感词库 ============================== */

export type HitLevel = 'block' | 'review';

export interface LexiconEntry {
  word: string;
  level: HitLevel;
  category: string;
}

/** 违规（直接拦截） */
const BLOCK_WORDS: LexiconEntry[] = [
  { word: '加微信秒发货', level: 'block', category: '站外导流' },
  { word: '包治百病', level: 'block', category: '虚假宣传' },
  { word: '刷单', level: 'block', category: '虚假交易' },
  { word: '高仿', level: 'block', category: '售假' },
  { word: 'A货', level: 'block', category: '售假' },
  { word: '假货', level: 'block', category: '售假' },
  { word: '代开发票', level: 'block', category: '违法票据' },
  { word: '博彩', level: 'block', category: '赌博' },
  { word: '赌博', level: 'block', category: '赌博' },
  { word: '走私', level: 'block', category: '违法经营' },
  { word: '枪支', level: 'block', category: '违禁品' },
  { word: '毒品', level: 'block', category: '违禁品' },
];

/** 疑似（转人工复审） */
const REVIEW_WORDS: LexiconEntry[] = [
  { word: '加微信', level: 'review', category: '站外导流' },
  { word: '微信号', level: 'review', category: '站外导流' },
  { word: '加V', level: 'review', category: '站外导流' },
  { word: '私聊', level: 'review', category: '站外导流' },
  { word: '全国最低价', level: 'review', category: '广告法极限词' },
  { word: '全网最低', level: 'review', category: '广告法极限词' },
  { word: '最便宜', level: 'review', category: '广告法极限词' },
  { word: '第一品牌', level: 'review', category: '广告法极限词' },
  { word: '国家级', level: 'review', category: '广告法极限词' },
  { word: '百分百有效', level: 'review', category: '广告法极限词' },
];

/** 词库 = 分级词库 ∪ shared-utils 的 SENSITIVE_WORDS（保证公共词库不漏） */
export const LEXICON: LexiconEntry[] = (() => {
  const map = new Map<string, LexiconEntry>();
  for (const e of [...BLOCK_WORDS, ...REVIEW_WORDS]) map.set(e.word, e);
  for (const w of SENSITIVE_WORDS) {
    if (!map.has(w)) map.set(w, { word: w, level: 'block', category: '平台公共词库' });
  }
  return Array.from(map.values());
})();

/** 正则模式：联系方式 / 外链等结构化风险 */
export const PATTERNS: { name: string; re: RegExp; level: HitLevel; category: string }[] = [
  { name: '手机号', re: /1[3-9]\d{9}/g, level: 'review', category: '联系方式' },
  { name: '微信号', re: /(?:微信|weixin|wx|WX|vx|VX)\s*[:：]?\s*[A-Za-z0-9_-]{5,20}/g, level: 'review', category: '联系方式' },
  { name: 'QQ号', re: /(?:QQ|qq|扣扣)\s*[:：]?\s*[1-9]\d{4,11}/g, level: 'review', category: '联系方式' },
  { name: '外部链接', re: /https?:\/\/[^\s"'<>，。；]+/g, level: 'review', category: '站外链接' },
];

export interface Hit {
  word: string;
  level: HitLevel;
  category: string;
  from: 'lexicon' | 'pattern';
}

/** 词库匹配：一次扫描返回全部命中（含命中的分类与等级） */
export function scanSensitive(text: string): Hit[] {
  const hits: Hit[] = [];
  const seen = new Set<string>();
  for (const entry of LEXICON) {
    if (text.includes(entry.word) && !seen.has(`${entry.word}`)) {
      seen.add(entry.word);
      hits.push({ word: entry.word, level: entry.level, category: entry.category, from: 'lexicon' });
    }
  }
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    const matches = text.match(new RegExp(p.re.source, 'g')) ?? [];
    for (const m of matches) {
      const key = `${p.name}:${m}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ word: m, level: p.level, category: p.category, from: 'pattern' });
    }
  }
  return hits.slice(0, MAX_HIT_WORDS);
}

/* ============================== mock 供应商 ============================== */

export type Suggestion = 'pass' | 'review' | 'risky' | 'block';

export interface ProviderVerdict {
  provider: string;
  suggestion: Suggestion;
  label: number;
  reason: string;
}

/**
 * 内容安全供应商（Demo 为 mock，真实环境替换为微信 msgSecCheck V2 / 阿里云绿网）。
 * 注意：它不是一个写死的返回，而是基于词库/模式命中的真实结果做分级判定。
 */
export function runProvider(text: string, hits: Hit[]): ProviderVerdict {
  const blockHits = hits.filter((h) => h.level === 'block');
  const reviewHits = hits.filter((h) => h.level === 'review');
  if (blockHits.length) {
    return {
      provider: `${PROVIDER}-sec-check`,
      suggestion: 'risky',
      label: 20001,
      reason: `命中违规词：${blockHits.map((h) => h.word).join('、')}（${uniq(blockHits.map((h) => h.category)).join('、')}）`,
    };
  }
  if (reviewHits.length) {
    return {
      provider: `${PROVIDER}-sec-check`,
      suggestion: 'review',
      label: 10001,
      reason: `疑似风险内容：${uniq(reviewHits.map((h) => h.category)).join('、')}，需人工复审`,
    };
  }
  return { provider: `${PROVIDER}-sec-check`, suggestion: 'pass', label: 100, reason: '文本审核通过' };
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/* ============================== 同步文本审核 ============================== */

export interface AuditTextInput {
  text: string;
  scene?: string;
  bizType?: string;
  bizId?: number;
  contentId?: number;
  contentUrl?: string;
  userId?: number;
  /** 异步媒体审核任务号（媒体审核才有） */
  mediaTaskId?: string;
}

export interface AuditTextResult {
  pass: boolean;
  reason: string;
  hitWords: string[];
  source: string;
  /** 以下为 Demo 可视化与回调联调所需的附加信息 */
  auditLogId: number;
  traceId: string;
  reviewStatus: AuditLog['reviewStatus'];
  suggestion: Suggestion;
  label: number;
  categories: string[];
  scene: string;
  elapsedMs: number;
}

/** trace_id：微信媒体异步审核回调按它回写审核记录 */
export function newTraceId(): string {
  return `wxa_${crypto.randomBytes(8).toString('hex')}`;
}

export function auditText(store: Store, input: AuditTextInput): AuditTextResult {
  const started = Date.now();
  const text = String(input.text ?? '');
  const hits = scanSensitive(text);
  const verdict = runProvider(text, hits);
  const pass = verdict.suggestion === 'pass';
  const reviewStatus: AuditLog['reviewStatus'] =
    verdict.suggestion === 'pass' ? 'auto_pass' : verdict.suggestion === 'block' ? 'auto_reject' : 'manual_pending';

  const id = nextId(store, 'auditLogs');
  const traceId = newTraceId();
  const detail = {
    suggestion: verdict.suggestion,
    label: verdict.label,
    hitWords: hits.map((h) => h.word),
    categories: uniq(hits.map((h) => h.category)),
    scene: input.scene ?? 'default',
    traceId,
    mediaTaskId: input.mediaTaskId,
    provider: verdict.provider,
    textLength: text.length,
    userId: input.userId,
    checkedAt: new Date().toISOString(),
  };
  const row: AuditLogRow = {
    id,
    contentType: 'text',
    contentId: input.contentId ?? input.bizId,
    contentUrl: input.contentUrl,
    auditSource: verdict.provider,
    auditResult: verdict.suggestion,
    auditDetail: detail,
    reviewStatus,
    bizType: input.bizType ?? input.scene ?? 'text',
    bizId: input.bizId ?? 0,
    text: text.slice(0, 500),
    createdAt: new Date().toISOString(),
  };
  store.auditLogs.set(id, row);

  const source = `${verdict.provider}${hits.length ? `(命中${uniq(hits.map((h) => h.from)).join('+')})` : '(无命中)'}`;
  return {
    pass,
    reason: verdict.reason,
    hitWords: hits.map((h) => h.word),
    source,
    auditLogId: id,
    traceId,
    reviewStatus,
    suggestion: verdict.suggestion,
    label: verdict.label,
    categories: uniq(hits.map((h) => h.category)),
    scene: input.scene ?? 'default',
    elapsedMs: Date.now() - started,
  };
}

/* ============================== 人工复审队列 ============================== */

export interface AuditQueueQuery {
  reviewStatus?: string;
  bizType?: string;
  page: number;
  pageSize: number;
}

export function listAuditQueue(store: Store, q: AuditQueueQuery) {
  let rows = Array.from(store.auditLogs.values());
  if (q.reviewStatus) rows = rows.filter((r) => r.reviewStatus === q.reviewStatus);
  if (q.bizType) rows = rows.filter((r) => String(r.bizType) === q.bizType);
  rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return pageOf(rows, q.page, q.pageSize);
}

/* ============================== 复审回写 ============================== */

export interface ReviewInput {
  auditLogId: number;
  action: 'pass' | 'reject';
  reason?: string;
  reviewerId?: number;
}

export interface ReviewOutcome {
  ok: true;
  auditLogId: number;
  reviewStatus: AuditLog['reviewStatus'];
  bizType: string;
  bizId: number;
  contentSynced: { target: string; id: number; status: string } | null;
}

/** 复审结论回写被审内容（资讯 / 款 / 评论），并给作者发审核通知 */
export function reviewAuditLog(store: Store, input: ReviewInput): ReviewOutcome {
  const row = store.auditLogs.get(input.auditLogId);
  if (!row) throw Errors.notFound('审核记录不存在');
  const passed = input.action === 'pass';
  row.reviewStatus = passed ? 'manual_pass' : 'manual_reject';
  row.auditDetail = {
    ...(row.auditDetail ?? {}),
    reviewAction: input.action,
    reviewReason: input.reason ?? (passed ? '人工复审通过' : '人工复审驳回'),
    reviewerId: input.reviewerId,
    reviewedAt: new Date().toISOString(),
  };

  const contentSynced = writeBackContent(store, row, passed);
  return {
    ok: true,
    auditLogId: row.id,
    reviewStatus: row.reviewStatus,
    bizType: row.bizType,
    bizId: row.bizId,
    contentSynced,
  };
}

function writeBackContent(store: Store, row: AuditLogRow, passed: boolean): ReviewOutcome['contentSynced'] {
  const status = passed ? 'approved' : 'rejected';
  const bizType = String(row.bizType ?? '');
  if (bizType === 'article' || bizType === 'info') {
    const article = store.articles.get(row.bizId);
    if (article) {
      article.auditStatus = status;
      const notificationId = nextId(store, 'notifications');
      store.notifications.set(notificationId, {
        id: notificationId,
        userId: article.authorId,
        type: 'audit',
        title: passed ? '内容审核通过' : '内容审核未通过',
        body: passed
          ? `《${article.title}》已通过人工复审并发布`
          : `《${article.title}》被驳回：${String((row.auditDetail as Record<string, unknown>)?.reviewReason ?? '内容违规')}`,
        targetType: 'article',
        targetId: article.id,
        isRead: false,
        createdAt: new Date().toISOString(),
      });
      return { target: 'article', id: article.id, status };
    }
  }
  if (bizType === 'product' || bizType === 'source') {
    const product = store.products.get(row.bizId);
    if (product) {
      product.status = status;
      return { target: 'product', id: product.id, status };
    }
  }
  if (bizType === 'comment') {
    const comment = store.comments.get(row.bizId);
    if (comment) {
      comment.status = passed ? 'approved' : 'rejected';
      return { target: 'comment', id: comment.id, status: comment.status };
    }
  }
  return null;
}

/* ============================== 微信回调：解密 / 解析 ============================== */

export function wechatAesKey(): Buffer {
  const raw = process.env.WECHAT_AES_KEY || process.env.CONTENT_SECURITY_AES_KEY || DEFAULT_AES_KEY;
  const normalized = raw.replace(/=+$/, '');
  const key = Buffer.from(`${normalized}=`, 'base64');
  if (key.length !== 32) throw Errors.server('WECHAT_AES_KEY 必须是 43 位 EncodingAESKey（Base64 解码后 32 字节）');
  return key;
}

/** PKCS#7 去填充（微信 AES 报文） */
function pkcs7Unpad(buf: Buffer): Buffer {
  const pad = buf[buf.length - 1];
  if (pad < 1 || pad > 32 || pad > buf.length) return buf;
  return buf.subarray(0, buf.length - pad);
}

/** AES-256-CBC 解密微信消息体：random(16) + msgLen(4) + msg + appid */
export function decryptWechatMessage(encrypt: string): string {
  const key = wechatAesKey();
  const iv = key.subarray(0, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(false);
  const decrypted = pkcs7Unpad(Buffer.concat([decipher.update(Buffer.from(encrypt, 'base64')), decipher.final()]));
  if (decrypted.length < 20) throw Errors.badRequest('微信回调密文格式不正确');
  const msgLen = decrypted.readUInt32BE(16);
  if (msgLen <= 0 || 20 + msgLen > decrypted.length) throw Errors.badRequest('微信回调密文长度不合法');
  return decrypted.subarray(20, 20 + msgLen).toString('utf8');
}

/** 微信 URL 校验签名：sha1(sort([token, timestamp, nonce])) */
export function verifyWechatSignature(signature: string, timestamp: string, nonce: string, encrypt?: string): boolean {
  const parts = [WECHAT_TOKEN, timestamp, nonce];
  if (encrypt) parts.push(encrypt);
  const calc = crypto.createHash('sha1').update(parts.sort().join('')).digest('hex');
  const a = Buffer.from(calc);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** 极简 XML → 对象（微信消息为扁平/一层嵌套结构，无需完整 XML 解析器） */
export function xmlToObject(xml: string): Record<string, unknown> {
  const out = parseXmlNodes(xml);
  // 微信报文有 <xml> 根节点：整份文档会被根节点一次性匹配，这里拆掉这层包装
  const keys = Object.keys(out);
  if (keys.length === 1 && out[keys[0]] && typeof out[keys[0]] === 'object' && !Array.isArray(out[keys[0]])) {
    return out[keys[0]] as Record<string, unknown>;
  }
  return out;
}

function parseXmlNodes(xml: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const re = /<([A-Za-z_][\w.-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    let value = m[2];
    const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(value);
    if (cdata) value = cdata[1];
    if (value.includes('<') && /<\/[A-Za-z_]/.test(value)) {
      const nested = parseXmlNodes(value);
      out[m[1]] = Object.keys(nested).length ? nested : value.trim();
    } else {
      out[m[1]] = value.trim();
    }
  }
  return out;
}

export interface ParsedCallback {
  encrypted: boolean;
  format: 'json' | 'xml' | 'plain';
  signatureVerified: boolean | null;
  event?: string;
  msgType?: string;
  traceId?: string;
  suggest?: string;
  label?: number;
  errcode?: number;
  payload: Record<string, unknown>;
  decrypted?: string;
}

function toObject(text: string): { obj: Record<string, unknown>; format: 'json' | 'xml' | 'plain' } {
  const trimmed = text.trim();
  if (!trimmed) return { obj: {}, format: 'plain' };
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return { obj: parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : { value: parsed }, format: 'json' };
    } catch {
      return { obj: { raw: trimmed }, format: 'plain' };
    }
  }
  if (trimmed.startsWith('<')) return { obj: xmlToObject(trimmed), format: 'xml' };
  return { obj: { raw: trimmed }, format: 'plain' };
}

/**
 * 解析微信回调（明文 JSON / 明文 XML / AES 加密体均可）。
 * 微信 mediaCheckAsync 回调形如：
 *   { ToUserName, FromUserName, CreateTime, MsgType: 'event', Event: 'wxa_media_check',
 *     trace_id, result: { suggest: 'risky', label: 20001 } }
 */
export function parseCallback(body: Record<string, unknown>, query: Record<string, string> = {}): ParsedCallback {
  let source: Record<string, unknown> = body ?? {};
  let format: 'json' | 'xml' | 'plain' = 'json';
  let encrypted = false;
  let decrypted: string | undefined;

  // 框架在非 JSON Content-Type（微信发 text/xml）时会把原始报文放进 body.raw
  if (typeof source.raw === 'string') {
    const parsed = toObject(source.raw);
    source = parsed.obj;
    format = parsed.format;
  }

  const encryptValue = typeof source.Encrypt === 'string' ? source.Encrypt : typeof source.encrypt === 'string' ? source.encrypt : undefined;
  const signature = String(source.msg_signature ?? source.signature ?? query.msg_signature ?? query.signature ?? '');
  const timestamp = String(source.timestamp ?? query.timestamp ?? '');
  const nonce = String(source.nonce ?? query.nonce ?? '');

  let signatureVerified: boolean | null = null;
  if (signature && timestamp && nonce) {
    signatureVerified = verifyWechatSignature(signature, timestamp, nonce, encryptValue);
  }

  if (encryptValue) {
    encrypted = true;
    decrypted = decryptWechatMessage(encryptValue);
    const parsed = toObject(decrypted);
    source = parsed.obj;
    format = parsed.format;
  }

  const result = (source.result ?? source.Result) as { suggest?: string; label?: number } | string | undefined;
  const resultObj = result && typeof result === 'object' ? result : {};
  const suggest =
    (resultObj.suggest as string | undefined) ??
    (typeof result === 'string' ? result : undefined) ??
    (source.suggest as string | undefined) ??
    (source.Suggest as string | undefined);
  const labelRaw = resultObj.label ?? source.label ?? source.Label;
  const label = labelRaw === undefined ? undefined : Number(labelRaw);
  const errcodeRaw = source.errcode ?? source.ErrCode;

  return {
    encrypted,
    format,
    signatureVerified,
    event: (source.Event as string | undefined) ?? (source.event as string | undefined),
    msgType: (source.MsgType as string | undefined) ?? (source.msgType as string | undefined),
    traceId:
      (source.trace_id as string | undefined) ??
      (source.traceId as string | undefined) ??
      (source.TraceId as string | undefined),
    suggest: suggest ? String(suggest) : undefined,
    label: Number.isFinite(label) ? label : undefined,
    errcode: errcodeFrom(errcodeRaw),
    payload: source,
    decrypted,
  };
}

function errcodeFrom(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/* ============================== 回调回写审核记录 ============================== */

export interface CallbackOutcome {
  ok: boolean;
  matched: boolean;
  traceId?: string;
  auditLogId?: number;
  suggest?: string;
  reviewStatus?: AuditLog['reviewStatus'];
  contentSynced?: ReviewOutcome['contentSynced'];
  handler: string;
  message: string;
}

function mapSuggestion(suggest: string | undefined, label: number | undefined): { suggest: string; reviewStatus: AuditLog['reviewStatus']; result: string } {
  const s = String(suggest ?? '').toLowerCase();
  if (s === 'pass') return { suggest: 'pass', reviewStatus: 'auto_pass', result: 'pass' };
  if (s === 'block') return { suggest: 'block', reviewStatus: 'auto_reject', result: 'block' };
  if (s === 'risky') return { suggest: 'risky', reviewStatus: 'manual_pending', result: 'risky' };
  if (s === 'review') return { suggest: 'review', reviewStatus: 'manual_pending', result: 'review' };
  if (label !== undefined && label >= 20000) return { suggest: 'risky', reviewStatus: 'manual_pending', result: 'risky' };
  if (label !== undefined && label >= 10000) return { suggest: 'review', reviewStatus: 'manual_pending', result: 'review' };
  return { suggest: suggest ?? 'pass', reviewStatus: 'auto_pass', result: 'pass' };
}

/**
 * 微信异步审核回调处理：trace_id 命中则更新 auditLogs.reviewStatus；
 * 命中 risky/review 一律转 manual_pending，命中 block 直接驳回并回写内容状态。
 */
export function applyCallback(store: Store, parsed: ParsedCallback): CallbackOutcome {
  const handler =
    parsed.event === 'wxa_media_check'
      ? 'mediaCheckAsync'
      : parsed.msgType === 'event' && parsed.event
        ? `event:${parsed.event}`
        : 'msgSecCheckV2';

  if (!parsed.traceId) {
    return { ok: true, matched: false, handler, message: '回调未携带 trace_id，仅记录不回写' };
  }
  const hit = Array.from(store.auditLogs.values()).find((row) => {
    const detail = (row.auditDetail ?? {}) as Record<string, unknown>;
    return detail.traceId === parsed.traceId || detail.mediaTaskId === parsed.traceId;
  });
  if (!hit) {
    return { ok: true, matched: false, traceId: parsed.traceId, handler, message: `trace_id ${parsed.traceId} 未命中审核记录` };
  }

  const mapped = mapSuggestion(parsed.suggest, parsed.label);
  hit.reviewStatus = mapped.reviewStatus;
  hit.auditResult = mapped.result;
  hit.auditSource = `${PROVIDER}-sec-check-callback`;
  hit.auditDetail = {
    ...(hit.auditDetail ?? {}),
    callback: {
      handler,
      suggest: parsed.suggest ?? null,
      label: parsed.label ?? null,
      event: parsed.event ?? null,
      errcode: parsed.errcode ?? null,
      encrypted: parsed.encrypted,
      signatureVerified: parsed.signatureVerified,
      receivedAt: new Date().toISOString(),
    },
    callbackResult: mapped.suggest,
  };

  const contentSynced = mapped.reviewStatus === 'auto_reject' ? writeBackContent(store, hit, false) : null;

  return {
    ok: true,
    matched: true,
    traceId: parsed.traceId,
    auditLogId: hit.id,
    suggest: mapped.suggest,
    reviewStatus: mapped.reviewStatus,
    contentSynced,
    handler,
    message:
      mapped.reviewStatus === 'manual_pending'
        ? '命中 risky/review，已转人工复审队列（manual_pending）'
        : mapped.reviewStatus === 'auto_reject'
          ? '命中 block，已驳回并回写内容状态'
          : '审核通过（auto_pass）',
  };
}
