import type { ToolResult } from '@wfb/shared-types';
import type { Store } from '../../core/db';
import type { Router } from '../../core/server';
import { aiGatewaySnapshot } from '../../gateway/ai';
import { isAiConfigured } from '../../gateway/ai';
import { quotaOverview } from '../../gateway/quota';
import {
  linkReason,
  localAccountAnalysis,
  localAccountDiagnosis,
  localGenerateImage,
  localOperationAdvice,
  localRemoveBg,
  localRemoveWatermark,
  localRewrite,
  localTeleprompter,
  localTrending,
  localVideoEdit,
  runTool,
  styleHeat,
} from './service';
import { STYLE_TAGS } from '@wfb/shared-types';

/* =========================================================================
 * 功能板块（10 个工具）路由
 * 契约：docs/API.md 第 12 节 —— 全部返回 ToolResult；超额度 code=429。
 * ========================================================================= */

const SYS_BASE =
  '你是「女装B2B行业平台」的功能助手，服务对象是女装店主与源头厂家。' +
  '输出必须具体、可执行、带数字，禁止空话套话；中文回答；不要输出解释性的开场白。';

export function registerToolsModule(router: Router, store: Store) {
  /* ------------------------------ 额度总览 ------------------------------ */
  router.get(
    '/api/tools/quota',
    (ctx) => {
      const user = ctx.auth();
      const overview = quotaOverview(user, isAiConfigured());
      return { ...overview, ai: aiGatewaySnapshot() };
    },
    { summary: '今日各工具用量与 AI 网关状态' },
  );

  /* ------------------------------ 1. 文案改写 ------------------------------ */
  router.post(
    '/api/tools/rewrite',
    async (ctx): Promise<ToolResult> => {
      const user = ctx.auth();
      const text = ctx.str('text', { required: true, max: 3000 });
      const style = ctx.str('style');
      const tone = ctx.str('tone');
      const platform = ctx.str('platform');
      const local = () => localRewrite({ text, style, tone, platform });
      const preview = local();

      return runTool({
        store,
        user,
        tool: 'rewrite',
        styleTags: [style || (preview.items?.[4] as { detected?: { style?: string } })?.detected?.style || '韩系'],
        system: `${SYS_BASE}\n你是资深女装带货文案，擅长把平铺直叙的批发介绍改写为有钩子、有节奏的社交媒体文案。只输出 JSON：{"title":"标题","hook":"开头钩子","body":"正文","tags":["#标签"]}`,
        prompt: `原文：${text}\n要求：风格=${style || '自动识别'}；语气=${tone || '种草'}；平台=${platform || 'xiaohongshu'}。\n按该平台的内容结构改写，保留原文的价格/面料/起订量等事实，标题 12-20 字。`,
        json: true,
        parseAi: (raw) => {
          const j = safeJson(raw);
          if (!j) return null;
          const tags = Array.isArray(j.tags) ? (j.tags as string[]).join(' ') : String(j.tags ?? '');
          return {
            text: `${j.title ?? ''}\n\n${j.hook ?? ''}\n\n${j.body ?? ''}\n\n${tags}`.trim(),
            items: [
              { key: 'title', label: '标题', content: j.title },
              { key: 'hook', label: '开头钩子', content: j.hook },
              { key: 'body', label: '正文', content: j.body },
              { key: 'tags', label: '话题标签', content: tags },
            ],
            notice: '由 AI 网关生成',
          };
        },
        local,
      });
    },
    { summary: '文案改写' },
  );

  /* ------------------------------ 2. 去水印 ------------------------------ */
  router.post(
    '/api/tools/remove-watermark',
    async (ctx): Promise<ToolResult> => {
      const user = ctx.auth();
      const url = ctx.str('url', { required: true, max: 800 });
      const local = () => localRemoveWatermark({ url });
      return runTool({
        store,
        user,
        tool: 'remove-watermark',
        styleTags: user.styleTags as unknown as string[],
        system: `${SYS_BASE}\n你是短视频素材处理助手。只输出 JSON：{"platform":"平台","videoId":"作品ID","noWatermarkUrl":"无水印直链","steps":["步骤1","步骤2"],"tips":["注意事项"]}`,
        prompt: `请解析这个视频分享链接，识别平台、提取作品 ID，并给出无水印直链与 3 条保存步骤：${url}`,
        json: true,
        parseAi: (raw) => {
          const j = safeJson(raw);
          if (!j) return null;
          return {
            text: [
              `## 解析完成 · ${j.platform ?? '视频平台'}`,
              '',
              `- 作品 ID：\`${j.videoId ?? '-'}\``,
              `- 无水印直链：${j.noWatermarkUrl ?? '-'}`,
              '',
              '### 保存步骤',
              ...(Array.isArray(j.steps) ? (j.steps as string[]).map((s, i) => `${i + 1}. ${s}`) : []),
              ...(Array.isArray(j.tips) ? ['', '### 提示', ...(j.tips as string[]).map((s) => `- ${s}`)] : []),
            ].join('\n'),
            items: [
              { key: 'platform', label: '识别平台', value: j.platform },
              { key: 'videoId', label: '作品 ID', value: j.videoId },
              { key: 'noWatermarkUrl', label: '无水印直链', value: j.noWatermarkUrl },
            ],
            videoUrl: typeof j.noWatermarkUrl === 'string' ? (j.noWatermarkUrl as string) : undefined,
            notice: '由 AI 网关解析',
          };
        },
        local,
      });
    },
    { summary: '去水印解析' },
  );

  /* ------------------------------ 3. 爆款选题 ------------------------------ */
  router.post(
    '/api/tools/trending',
    async (ctx): Promise<ToolResult> => {
      const user = ctx.auth();
      const style = ctx.str('style');
      const platform = ctx.str('platform');
      const local = () => localTrending(store, { style, platform });
      const preview = local();
      const hotStyles = styleHeat(store).slice(0, 3).map((h) => `${h.style}(行为${h.behaviors}/加微${h.contacts})`).join('、');
      return runTool({
        store,
        user,
        tool: 'trending',
        styleTags: [style || (preview.items?.[0] as { basis?: string })?.basis?.match(/依据：(\S+?) /)?.[1] || '韩系'],
        system: `${SYS_BASE}\n你是女装账号选题策划。只输出 JSON：{"topics":[{"title":"选题标题","hook":"开头钩子","reason":"为什么能爆","format":"形式","bestTime":"发布时段","tags":["话题"]}]}，共 6 条。`,
        prompt: `风格=${style || '平台最热风格'}；平台=${platform || 'xiaohongshu'}；平台近 7 日热度参考：${hotStyles}。请给出 6 个具体可拍的爆款选题，每条必须有可直接开拍的标题、第一句钩子和数据化的爆款理由。`,
        json: true,
        parseAi: (raw) => {
          const j = safeJson(raw);
          const topics = Array.isArray(j?.topics) ? (j!.topics as Record<string, unknown>[]) : null;
          if (!topics?.length) return null;
          return {
            text: [
              `## ${style || '平台热门'} · 爆款选题（AI 生成）`,
              '',
              ...topics.flatMap((t, i) => [
                `### ${i + 1}. ${t.title}`,
                `- **开头钩子**：${t.hook}`,
                `- **为什么能爆**：${t.reason}`,
                `- **形式/时段**：${t.format}｜${t.bestTime}`,
                `- **标签**：#${(Array.isArray(t.tags) ? (t.tags as string[]) : []).join(' #')}`,
                '',
              ]),
            ].join('\n'),
            items: topics.map((t, i) => ({ index: i + 1, ...t })),
            notice: '由 AI 网关生成',
          };
        },
        local,
      });
    },
    { summary: '爆款选题' },
  );

  /* ------------------------------ 4. 账号分析 ------------------------------ */
  router.post(
    '/api/tools/account-analysis',
    async (ctx): Promise<ToolResult> => {
      const user = ctx.auth();
      const accountUrl = ctx.str('accountUrl', { required: true, max: 500 });
      const platform = ctx.str('platform', { fallback: 'xiaohongshu' });
      const local = () => localAccountAnalysis(store, { accountUrl, platform });
      return runTool({
        store,
        user,
        tool: 'account-analysis',
        styleTags: user.styleTags as unknown as string[],
        system: `${SYS_BASE}\n你是女装账号数据分析师。只输出 JSON：{"score":数字,"dimensions":[{"label":"维度","score":数字,"value":"你的数据","benchmark":"基准","verdict":"结论"}],"suggestions":["建议"]}`,
        prompt: `分析账号：${accountUrl}（平台=${platform}）。请从内容质量、粉丝画像、互动效率、加微转化、发布节奏五个维度打分（0-100）并给出 3 条可执行建议。`,
        json: true,
        parseAi: (raw) => {
          const j = safeJson(raw);
          const dims = Array.isArray(j?.dimensions) ? (j!.dimensions as Record<string, unknown>[]) : null;
          if (!dims?.length) return null;
          const suggestions = Array.isArray(j?.suggestions) ? (j!.suggestions as string[]) : [];
          return {
            text: [
              `## 账号分析（AI）综合评分 ${j?.score ?? '-'}/100`,
              '',
              '| 维度 | 得分 | 你的数据 | 平台基准 | 结论 |',
              '|---|---|---|---|---|',
              ...dims.map((d) => `| ${d.label} | ${d.score} | ${d.value} | ${d.benchmark} | ${d.verdict} |`),
              '',
              '### 优化建议',
              ...suggestions.map((s, i) => `${i + 1}. ${s}`),
            ].join('\n'),
            items: [{ key: 'overview', label: '综合评分', value: j?.score }, ...dims, { key: 'suggestions', label: '优化建议', value: suggestions }],
            notice: '由 AI 网关生成',
          };
        },
        local,
      });
    },
    { summary: '账号分析' },
  );

  /* ------------------------------ 5. 账号诊断（会员） ------------------------------ */
  router.post(
    '/api/tools/account-diagnosis',
    async (ctx): Promise<ToolResult> => {
      const user = ctx.auth();
      const accountUrl = ctx.str('accountUrl', { required: true, max: 500 });
      const platform = ctx.str('platform', { fallback: 'xiaohongshu' });
      const local = () => localAccountDiagnosis(store, { accountUrl, platform });
      return runTool({
        store,
        user,
        tool: 'account-diagnosis',
        styleTags: user.styleTags as unknown as string[],
        system: `${SYS_BASE}\n你是女装账号诊断专家。只输出 JSON：{"score":数字,"issues":[{"dimension":"维度","score":数字,"problem":"问题","evidence":"依据","action":"动作","expected":"预期"}],"plan":[{"week":"第1周","focus":"重点","tasks":["任务"]}]}`,
        prompt: `深度诊断账号 ${accountUrl}（平台=${platform}），输出 5 个维度的问题-依据-动作-预期，以及 30 天（4 周）行动计划。`,
        json: true,
        parseAi: (raw) => {
          const j = safeJson(raw);
          const issues = Array.isArray(j?.issues) ? (j!.issues as Record<string, unknown>[]) : null;
          if (!issues?.length) return null;
          const plan = Array.isArray(j?.plan) ? (j!.plan as Record<string, unknown>[]) : [];
          return {
            text: [
              `## 深度诊断（AI）综合 ${j?.score ?? '-'}/100`,
              '',
              ...issues.flatMap((d, i) => [
                `### ${i + 1}. ${d.dimension}（${d.score}/100）`,
                `- **问题**：${d.problem}`,
                `- **依据**：${d.evidence}`,
                `- **动作**：${d.action}`,
                `- **预期**：${d.expected}`,
                '',
              ]),
              '### 30 天行动计划',
              ...plan.flatMap((p) => [`**${p.week} · ${p.focus}**`, ...(Array.isArray(p.tasks) ? (p.tasks as string[]).map((t) => `- ${t}`) : [])]),
            ].join('\n'),
            items: [{ key: 'overall', label: '综合评分', value: j?.score }, ...issues, { key: 'plan', label: '30 天计划', value: plan }],
            notice: '由 AI 网关生成（会员专属工具）',
          };
        },
        local,
      });
    },
    { summary: '账号深度诊断（会员专属）' },
  );

  /* ------------------------------ 6. AI 配图 ------------------------------ */
  router.post(
    '/api/tools/generate-image',
    async (ctx): Promise<ToolResult> => {
      const user = ctx.auth();
      const prompt = ctx.str('prompt', { required: true, max: 1000 });
      const style = ctx.str('style');
      const productImageUrl = ctx.str('productImageUrl');
      const ratio = ctx.str('ratio', { fallback: '3:4' });
      const local = () => localGenerateImage({ prompt, style, productImageUrl, ratio });
      const base = local();
      return runTool({
        store,
        user,
        tool: 'ai-image',
        styleTags: [style || '韩系'],
        system: `${SYS_BASE}\n你是电商视觉提示词工程师。只输出 JSON：{"prompt":"中文绘图提示词","negative":"负向提示词","params":{"size":"1024x1365","steps":30,"cfg":7}}`,
        prompt: `为女装商品图生成绘图提示词。用户描述：${prompt}；风格=${style || '自动'}；比例=${ratio}。提示词需包含主体、面料质感、光线、构图、画质要求。`,
        json: true,
        parseAi: (raw) => {
          const j = safeJson(raw);
          if (!j?.prompt) return null;
          return {
            ...base,
            text: [`## AI 配图（${ratio}）`, '', '**提示词**', '```', String(j.prompt), '```', `**负向提示词**：${j.negative ?? ''}`].join('\n'),
            items: [
              { key: 'prompt', label: '优化后提示词', value: j.prompt },
              { key: 'negative', label: '负向提示词', value: j.negative },
              { key: 'params', label: '参数', value: j.params ?? { ratio } },
            ],
            notice: '提示词由 AI 网关生成；图片由绘图供应商渲染（未配置时返回占位图）',
          };
        },
        local,
      });
    },
    { summary: 'AI 配图' },
  );

  /* ------------------------------ 7. 图片去背景 ------------------------------ */
  router.post(
    '/api/tools/remove-bg',
    async (ctx): Promise<ToolResult> => {
      const user = ctx.auth();
      const imageUrl = ctx.str('imageUrl', { required: true, max: 400000 });
      const local = () => localRemoveBg({ imageUrl: imageUrl.length > 500 ? `base64(${imageUrl.length})` : imageUrl });
      return runTool({
        store,
        user,
        tool: 'remove-bg',
        styleTags: user.styleTags as unknown as string[],
        system: `${SYS_BASE}\n你是电商图片处理助手。只输出 JSON：{"summary":"处理说明","params":{"feather":1.5,"keepHair":true,"shadowKeep":0.3},"steps":["后续动作"]}`,
        prompt: `商品图去背景。图片：${imageUrl.slice(0, 120)}。请给出抠图参数（边缘羽化/发丝保留/阴影保留比例）与 3 个后续动作。`,
        json: true,
        parseAi: (raw) => {
          const j = safeJson(raw);
          if (!j) return null;
          return {
            text: [`## 去背景（AI 参数）`, '', String(j.summary ?? ''), '', ...(Array.isArray(j.steps) ? (j.steps as string[]).map((s, i) => `${i + 1}. ${s}`) : [])].join('\n'),
            items: [
              { key: 'params', label: '处理参数', value: j.params ?? {} },
              { key: 'steps', label: '后续动作', value: j.steps ?? [] },
            ],
            notice: '参数由 AI 网关生成',
          };
        },
        local,
      });
    },
    { summary: '图片去背景' },
  );

  /* ------------------------------ 8. 运营建议（会员） ------------------------------ */
  router.post(
    '/api/tools/operation-advice',
    async (ctx): Promise<ToolResult> => {
      const user = ctx.auth();
      const shopName = ctx.str('shopName', { required: true, max: 60 });
      const monthlyRevenue = ctx.num('monthlyRevenue');
      const avgOrderValue = ctx.num('avgOrderValue');
      const followerCount = ctx.num('followerCount');
      const styleTags = ctx.arr<string>('styleTags');
      const note = ctx.str('note', { max: 500 });
      const local = () => localOperationAdvice(store, { shopName, monthlyRevenue, avgOrderValue, styleTags, followerCount, note });
      return runTool({
        store,
        user,
        tool: 'operation-advice',
        styleTags: styleTags.length ? styleTags : (user.styleTags as unknown as string[]),
        system: `${SYS_BASE}\n你是女装零售运营顾问。只输出 JSON：{"diagnosis":"现状判断","metrics":{"口径":"数值"},"actions":["动作"],"kpi":[{"label":"指标","value":数字,"target":数字,"unit":"单位"}]}`,
        prompt: `店铺：${shopName}；月流水=${monthlyRevenue || '未填'}；客单价=${avgOrderValue || '未填'}；粉丝=${followerCount || '未填'}；风格=${styleTags.join('/') || '未填'}；补充=${note || '无'}。请给出可执行的运营建议，30 天月流水目标 +30%。`,
        json: true,
        parseAi: (raw) => {
          const j = safeJson(raw);
          if (!j?.actions) return null;
          const actions = j.actions as string[];
          return {
            text: [
              `## ${shopName} 运营建议（AI）`,
              '',
              String(j.diagnosis ?? ''),
              '',
              '### 关键指标',
              ...(Array.isArray(j.kpi) ? (j.kpi as Record<string, unknown>[]).map((k) => `- ${k.label}：${k.value} → 目标 ${k.target} ${k.unit ?? ''}`) : []),
              '',
              '### 具体动作',
              ...actions.map((a, i) => `${i + 1}. ${a}`),
            ].join('\n'),
            items: [
              { key: 'kpi', label: '关键指标', value: j.kpi ?? [] },
              { key: 'actions', label: '具体动作', value: actions },
              { key: 'metrics', label: '推演参数', value: j.metrics ?? {} },
            ],
            notice: '由 AI 网关生成（会员专属工具）',
          };
        },
        local,
      });
    },
    { summary: '运营建议（会员专属）' },
  );

  /* ------------------------------ 9. 提词器（不限次） ------------------------------ */
  router.post(
    '/api/tools/teleprompter',
    async (ctx): Promise<ToolResult> => {
      const user = ctx.auth();
      const text = ctx.str('text', { required: true, max: 8000 });
      const local = () => localTeleprompter({ text });
      return runTool({
        store,
        user,
        tool: 'teleprompter',
        styleTags: user.styleTags as unknown as string[],
        system: `${SYS_BASE}\n你是口播脚本编辑。只输出 JSON：{"segments":[{"text":"分段文本","tip":"重音/停顿提示"}]}`,
        prompt: `把下面的口播稿按语义切成可直接提词的分段，每段不超过 40 字，并标注停顿与重音：\n${text}`,
        json: true,
        parseAi: (raw) => {
          const j = safeJson(raw);
          const segs = Array.isArray(j?.segments) ? (j!.segments as Record<string, unknown>[]) : null;
          if (!segs?.length) return null;
          const base = localTeleprompter({ text });
          return {
            ...base,
            text: [`## 提词脚本（AI 分段 · ${segs.length} 段）`, '', ...segs.map((s) => `${s.text}\n【停顿 0.4s】`)].join('\n'),
            items: segs.map((s, i) => ({ index: i + 1, text: s.text, tip: s.tip })),
            notice: '分段由 AI 网关生成',
          };
        },
        local,
      });
    },
    { summary: '拍视频提词器（不限次）' },
  );

  /* ------------------------------ 10. 视频剪辑（会员） ------------------------------ */
  router.post(
    '/api/tools/video-edit',
    async (ctx): Promise<ToolResult> => {
      const user = ctx.auth();
      const text = ctx.str('text', { max: 2000 });
      const images = ctx.arr<string>('images');
      const productId = ctx.num('productId');
      const template = ctx.str('template');
      const videoUrl = ctx.str('videoUrl');
      const local = () => localVideoEdit({ text, images, productId, template, videoUrl });
      return runTool({
        store,
        user,
        tool: 'video-edit',
        styleTags: user.styleTags as unknown as string[],
        system: `${SYS_BASE}\n你是短视频剪辑师。只输出 JSON：{"totalSeconds":数字,"shots":[{"shot":"镜头名","seconds":数字,"visual":"画面","subtitle":"字幕","transition":"转场","bgm":"音乐点"}]}`,
        prompt: `根据素材文案生成 9:16 竖版短视频分镜表（6 个镜头，总时长 25-30 秒）：${text || '女装带货通用模板'}。模板=${template || '女装带货快节奏'}。`,
        json: true,
        parseAi: (raw) => {
          const j = safeJson(raw);
          const shots = Array.isArray(j?.shots) ? (j!.shots as Record<string, unknown>[]) : null;
          if (!shots?.length) return null;
          const base = localVideoEdit({ text, images, productId, template, videoUrl });
          return {
            ...base,
            text: [`## 剪辑方案（AI 分镜 · 共 ${j?.totalSeconds ?? '--'} 秒）`, '', ...shots.map((s, i) => `${i + 1}. [${s.seconds}s] ${s.shot}｜${s.visual}｜字幕：${s.subtitle}｜转场：${s.transition}`)].join('\n'),
            items: shots.map((s, i) => ({ index: i + 1, ...s })),
            notice: '分镜由 AI 网关生成',
          };
        },
        local,
      });
    },
    { summary: '视频剪辑（会员专属）' },
  );
}

/** 宽松 JSON 解析（AI 返回可能带解释文字或代码块） */
function safeJson(raw: string): Record<string, unknown> | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const tryParse = (s: string) => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  return tryParse(candidate) ?? tryParse(candidate.slice(candidate.indexOf('{'), candidate.lastIndexOf('}') + 1));
}

export { STYLE_TAGS };
