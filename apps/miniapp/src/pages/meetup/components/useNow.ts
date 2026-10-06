import { useEffect, useState } from 'react';

/**
 * 轻量计时器：倒计时组件用。
 *
 * - `active=false` 时不开 interval（已结束 / 已取消的活动不再空转）
 * - 卸载时清理，避免页面切走后仍在跑
 * - 列表卡建议 tickMs=30000，详情页用默认 1000
 */
export function useNow(active = true, tickMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), Math.max(1000, tickMs));
    return () => clearInterval(timer);
  }, [active, tickMs]);

  return now;
}
