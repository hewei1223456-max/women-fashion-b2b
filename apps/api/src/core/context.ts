import type { Store } from './db';

/** 服务级依赖容器：控制器通过 ctx.deps 拿到仓储与配置（避免全局单例污染测试） */
export interface AppContext {
  store: Store;
  startedAt: number;
  version: string;
}

export function createAppContext(store: Store): AppContext {
  return { store, startedAt: Date.now(), version: '6.0.0-demo' };
}
