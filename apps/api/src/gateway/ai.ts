import crypto from 'node:crypto';

/* =========================================================================
 * AI 模型网关（PRD 10.5 / 第十二篇）
 *
 * 统一 OpenAI 兼容协议，支持 DeepSeek / 智谱 GLM / MiniMax 一键切换：
 *   - Token 计量（总/按模型/按工具）
 *   - 内存语义缓存（同 prompt 归一化后命中直接返回）
 *   - 错误重试 2 次（指数退避）、单次超时 8s、模型降级链
 *   - **未配置 AI_API_KEY 时 chat() 直接返回 ok:false**，由调用方降级到本地规则引擎
 *
 * 零新依赖：只用 Node 内置 fetch / crypto / AbortSignal.timeout。
 * ========================================================================= */

export type AiProviderKey = 'deepseek' | 'glm' | 'minimax';

interface ProviderPreset {
  label: string;
  baseUrl: string;
  model: string;
}

/** 供应商预设（可通过 AI_BASE_URL / AI_DEFAULT_MODEL 覆盖） */
export const AI_PROVIDER_PRESETS: Record<AiProviderKey, ProviderPreset> = {
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  glm: { label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  minimax: { label: 'MiniMax', baseUrl: 'https://api.minimax.chat/v1', model: 'abab6.5s-chat' },
};

const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 8000);
const MAX_RETRIES = Math.max(0, Number(process.env.AI_MAX_RETRIES ?? 2));
const CACHE_LIMIT = Math.max(10, Number(process.env.AI_CACHE_LIMIT ?? 200));

export interface AiChatOptions {
  /** 系统提示词（角色/输出格式约束） */
  system?: string;
  /** 用户提示词 */
  user: string;
  /** 归属工具（用于按工具计量） */
  tool?: string;
  temperature?: number;
  maxTokens?: number;
  /** 要求模型返回 JSON（response_format: json_object） */
  json?: boolean;
}

export interface AiChatResult {
  ok: boolean;
  text: string;
  provider?: string;
  model?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** 是否命中缓存（命中则不计费、不耗时） */
  cached: boolean;
  attempts: number;
  latencyMs: number;
  error?: string;
  /** 降级过程中被跳过的供应商 */
  degradedFrom?: string[];
}

interface CacheEntry {
  text: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  at: number;
}

const cache = new Map<string, CacheEntry>();

interface GatewayStats {
  calls: number;
  cacheHits: number;
  failures: number;
  retries: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  byModel: Record<string, number>;
  byTool: Record<string, { calls: number; tokens: number; failures: number }>;
  lastCallAt?: string;
}

const stats: GatewayStats = {
  calls: 0,
  cacheHits: 0,
  failures: 0,
  retries: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  byModel: {},
  byTool: {},
};

/** 是否配置了真实 AI Key（未配置则全站走本地规则引擎） */
export function isAiConfigured(): boolean {
  return !!process.env.AI_API_KEY;
}

interface ResolvedProvider {
  provider: string;
  label: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

/** 主供应商 + 降级链 */
function resolveChain(): ResolvedProvider[] {
  const apiKey = process.env.AI_API_KEY ?? '';
  if (!apiKey) return [];
  const primaryKey = (process.env.AI_PROVIDER ?? 'deepseek') as AiProviderKey;
  const preset = AI_PROVIDER_PRESETS[primaryKey] ?? AI_PROVIDER_PRESETS.deepseek;
  const primary: ResolvedProvider = {
    provider: primaryKey,
    label: preset.label,
    baseUrl: (process.env.AI_BASE_URL ?? preset.baseUrl).replace(/\/+$/, ''),
    model: process.env.AI_DEFAULT_MODEL ?? preset.model,
    apiKey,
  };
  const fallbackKey = process.env.AI_FALLBACK_API_KEY ?? apiKey;
  const extras = (process.env.AI_FALLBACK_PROVIDERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((k) => k !== primaryKey)
    .map((k) => {
      const p = AI_PROVIDER_PRESETS[k as AiProviderKey];
      if (!p) return null;
      return { provider: k, label: p.label, baseUrl: p.baseUrl, model: p.model, apiKey: fallbackKey } as ResolvedProvider;
    })
    .filter(Boolean) as ResolvedProvider[];
  return [primary, ...extras];
}

/** 归一化：去空白/标点/大小写 → 近似语义命中也算同一条缓存 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s，。、,.;；:：!！?？~～"'“”‘’()（）[\]【】{}<>《》|/\\-]/g, '');
}

function cacheKey(opts: AiChatOptions, model: string): string {
  const raw = `${model}::${normalize(opts.system ?? '')}::${normalize(opts.user)}`;
  return crypto.createHash('sha1').update(raw).digest('hex');
}

function pushCache(key: string, entry: CacheEntry) {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(key, entry);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface SingleCall {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** 单次调用（8s 硬超时） */
async function callOnce(p: ResolvedProvider, opts: AiChatOptions): Promise<SingleCall> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const messages: { role: string; content: string }[] = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: opts.user });
  try {
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify({
        model: p.model,
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 1200,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${body.slice(0, 160)}`);
    }
    const data = (await res.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const text = String(data?.choices?.[0]?.message?.content ?? '').trim();
    if (!text) throw new Error('模型返回空内容');
    const usage = data?.usage ?? {};
    return {
      text,
      model: data?.model ?? p.model,
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      totalTokens: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
    };
  } finally {
    clearTimeout(timer);
  }
}

function recordTool(tool: string, tokens: number, failed: boolean) {
  const row = (stats.byTool[tool] ??= { calls: 0, tokens: 0, failures: 0 });
  if (failed) row.failures += 1;
  else {
    row.calls += 1;
    row.tokens += tokens;
  }
}

/**
 * 调用 AI 网关。失败/未配置一律返回 ok:false（**不抛异常**），由调用方降级。
 */
export async function aiChat(opts: AiChatOptions): Promise<AiChatResult> {
  const started = Date.now();
  const tool = opts.tool ?? 'unknown';
  const chain = resolveChain();
  if (!chain.length) {
    return {
      ok: false,
      text: '',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cached: false,
      attempts: 0,
      latencyMs: 0,
      error: 'AI_API_KEY 未配置，已降级为本地规则引擎',
    };
  }

  const key = cacheKey(opts, chain[0].model);
  const hit = cache.get(key);
  if (hit) {
    stats.cacheHits += 1;
    stats.lastCallAt = new Date().toISOString();
    recordTool(tool, 0, false);
    return {
      ok: true,
      text: hit.text,
      provider: hit.provider,
      model: hit.model,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cached: true,
      attempts: 0,
      latencyMs: Date.now() - started,
    };
  }

  const degraded: string[] = [];
  let attempts = 0;
  let lastError = '';

  for (const p of chain) {
    for (let i = 0; i <= MAX_RETRIES; i++) {
      attempts += 1;
      try {
        const r = await callOnce(p, opts);
        pushCache(key, {
          text: r.text,
          provider: p.provider,
          model: r.model,
          promptTokens: r.promptTokens,
          completionTokens: r.completionTokens,
          totalTokens: r.totalTokens,
          at: Date.now(),
        });
        stats.calls += 1;
        stats.promptTokens += r.promptTokens;
        stats.completionTokens += r.completionTokens;
        stats.totalTokens += r.totalTokens;
        stats.byModel[r.model] = (stats.byModel[r.model] ?? 0) + 1;
        stats.lastCallAt = new Date().toISOString();
        recordTool(tool, r.totalTokens, false);
        return {
          ok: true,
          text: r.text,
          provider: p.provider,
          model: r.model,
          promptTokens: r.promptTokens,
          completionTokens: r.completionTokens,
          totalTokens: r.totalTokens,
          cached: false,
          attempts,
          latencyMs: Date.now() - started,
          degradedFrom: degraded.length ? degraded : undefined,
        };
      } catch (e) {
        lastError = e instanceof Error ? `${p.label}: ${e.message}` : `${p.label}: 未知错误`;
        if (i < MAX_RETRIES) {
          stats.retries += 1;
          await sleep(200 * (i + 1)); // 指数退避：200ms → 400ms
        }
      }
    }
    degraded.push(p.label);
  }

  stats.failures += 1;
  stats.lastCallAt = new Date().toISOString();
  recordTool(tool, 0, true);
  return {
    ok: false,
    text: '',
    model: chain[0].model,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cached: false,
    attempts,
    latencyMs: Date.now() - started,
    error: lastError || 'AI 网关调用失败，已降级为本地规则引擎',
    degradedFrom: degraded,
  };
}

/** 网关快照（供 /api/tools/quota 与管理后台可视化） */
export function aiGatewaySnapshot() {
  const chain = resolveChain();
  return {
    configured: isAiConfigured(),
    provider: chain[0]?.provider ?? null,
    providerLabel: chain[0]?.label ?? null,
    model: chain[0]?.model ?? null,
    baseUrl: chain[0]?.baseUrl ?? null,
    fallbackProviders: chain.slice(1).map((c) => c.label),
    timeoutMs: TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
    cacheSize: cache.size,
    cacheLimit: CACHE_LIMIT,
    stats: { ...stats, byModel: { ...stats.byModel }, byTool: { ...stats.byTool } },
  };
}

/** 清空语义缓存（管理后台 / 自测用） */
export function clearAiCache() {
  cache.clear();
}

/** 重置计量（测试用） */
export function resetAiStats() {
  stats.calls = 0;
  stats.cacheHits = 0;
  stats.failures = 0;
  stats.retries = 0;
  stats.promptTokens = 0;
  stats.completionTokens = 0;
  stats.totalTokens = 0;
  stats.byModel = {};
  stats.byTool = {};
  stats.lastCallAt = undefined;
}

/** 从模型输出里抠出 JSON（容忍 ```json 代码块与前后解释文字） */
export function parseJsonLoose<T = Record<string, unknown>>(text: string): T | null {
  if (!text) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate) as T;
  } catch {
    /* 继续尝试截取首个 { ... } */
  }
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
  return null;
}
