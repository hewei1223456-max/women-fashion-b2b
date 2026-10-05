/**
 * 女装B2B行业平台 · 共享类型（@wfb/shared-types）
 *
 * 全仓库唯一的「契约源」：
 *   - apps/api      后端返回契约
 *   - apps/miniapp  Taro 多端前端
 *   - apps/admin    Next.js 管理后台
 *
 * 任何接口字段变更，先改这里，再改两端实现。
 * 模块划分：domain.ts（字典与常量）→ models.ts（实体）→ api.ts（请求/响应）。
 */

export * from './domain';
export * from './models';
export * from './api';
