import { useMemo, useRef, type ReactNode } from 'react';
import { View } from '@tarojs/components';
import { clsx } from '@wfb/shared-utils';
import './index.scss';

/**
 * 双列错落瀑布流（小红书式）。
 *
 * 分配算法：**当前哪一列更矮就放哪一列**（贪心），比「奇偶交替」更接近等高的两列，
 * 尤其当封面比例差异大时不会出现「左列一长到底、右列空空」。
 *
 * 性能约定（用户反馈「很卡」，列表项必须轻量）：
 * - 分配结果只在 `items` / `columns` 变化时用 useMemo 重算一次，不随渲染/滚动重算；
 * - `heightOf` 用 ref 持有，调用方即使传内联箭头函数也不会让 memo 失效；
 * - 组件本身不做动画、不做图片预加载，只渲染两个纵向 column。
 */
export interface WaterfallProps<T> {
  items: T[];
  /**
   * 预估卡片高度（设计稿 px，750 基准）。
   * 只用于两列平衡，不参与真实布局 —— 渲染高度由卡片自身内容决定。
   */
  heightOf: (item: T, index: number) => number;
  renderItem: (item: T, index: number) => ReactNode;
  /** 列数，默认 2 */
  columns?: number;
  className?: string;
  columnClassName?: string;
  /** 取 key，默认取 (item as any).id */
  itemKey?: (item: T, index: number) => string | number;
}

export default function Waterfall<T>({
  items,
  heightOf,
  renderItem,
  columns = 2,
  className,
  columnClassName,
  itemKey,
}: WaterfallProps<T>) {
  const heightRef = useRef(heightOf);
  heightRef.current = heightOf;

  const buckets = useMemo(() => {
    const cols: T[][] = [];
    for (let i = 0; i < columns; i += 1) cols.push([]);
    const heights = new Array<number>(columns).fill(0);
    items.forEach((item, index) => {
      // 找当前最矮的一列（并列时取下标小的，保证结果稳定、可复现）
      let target = 0;
      for (let c = 1; c < columns; c += 1) {
        if (heights[c] < heights[target]) target = c;
      }
      cols[target].push(item);
      heights[target] += Math.max(1, heightRef.current(item, index));
    });
    return cols;
    // heightOf 通过 ref 读取，不进入依赖：只有数据/列数变化才重新分配
  }, [items, columns]);

  const keyOf = itemKey ?? ((item: T) => (item as { id?: number | string }).id ?? Math.random());

  return (
    <View className={clsx('wf', className)}>
      {buckets.map((col, colIndex) => (
        <View key={`wf-col-${colIndex}`} className={clsx('wf__col', columnClassName)}>
          {col.map((item, rowIndex) => (
            <View key={keyOf(item, rowIndex)} className="wf__cell">
              {renderItem(item, rowIndex)}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
