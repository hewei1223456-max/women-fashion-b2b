import type { ReactNode } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { ToolResult } from '@wfb/shared-types';
import { clsx } from '@wfb/shared-utils';
import ArticleCard from '../ArticleCard';
import MediaGrid from '../MediaGrid';
import { toastSuccess } from '../Toast';
import './index.scss';

interface Props {
  result: ToolResult | null;
  /** 结果区标题 */
  title?: string;
  onArticleClick?: (id: number) => void;
  /** 结果底部的额外操作 */
  extra?: ReactNode;
  className?: string;
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * 工具结果展示：text / items / imageUrl / videoUrl / attachments / 推荐阅读。
 * aiPowered=false 时提示「演示模式」（未配置 AI Key 时后端走本地规则引擎）。
 */
export default function ToolResultView({ result, title = '生成结果', onArticleClick, extra, className }: Props) {
  if (!result) return null;

  const copyText = () => {
    Taro.setClipboardData({ data: result.text ?? '' })
      .then(() => toastSuccess('已复制'))
      .catch(() => undefined);
  };

  return (
    <View className={clsx('tool-result', className)}>
      <View className="row-between tool-result__head">
        <Text className="bold t1">{title}</Text>
        <Text className="f-xs t3">耗时 {(result.elapsedMs / 1000).toFixed(1)}s</Text>
      </View>

      {!result.aiPowered ? (
        <View className="tool-result__notice">
          <Text className="tool-result__notice-text f-xs">⚡ 演示模式：未配置 AI Key，当前由本地规则引擎生成，流程与线上一致</Text>
        </View>
      ) : null}
      {result.notice ? (
        <View className="tool-result__notice tool-result__notice--info">
          <Text className="tool-result__notice-text f-xs">{result.notice}</Text>
        </View>
      ) : null}

      {result.text ? (
        <View className="tool-result__text-wrap">
          <Text className="tool-result__text f-sm t1">{result.text}</Text>
          <View className="tool-result__copy" onClick={copyText}>
            <Text className="tool-result__copy-text">复制文案</Text>
          </View>
        </View>
      ) : null}

      {result.imageUrl ? (
        <View className="tool-result__image-wrap">
          <MediaGrid images={[result.imageUrl]} />
        </View>
      ) : null}

      {result.videoUrl ? (
        <View className="tool-result__video">
          <Text className="tool-result__video-text f-sm t2">🎬 已生成视频：</Text>
          <Text className="tool-result__video-url f-xs brand">{result.videoUrl}</Text>
        </View>
      ) : null}

      {result.items?.length ? (
        <View className="tool-result__items">
          {result.items.map((item, index) => (
            <View key={index} className="tool-result__item">
              <View className="tool-result__item-index">
                <Text className="tool-result__item-index-text">{index + 1}</Text>
              </View>
              <View className="col flex-1">
                {Object.entries(item).map(([k, v]) => (
                  <View key={k} className="tool-result__item-row">
                    <Text className="tool-result__item-key f-xs t3">{k}</Text>
                    <Text className="tool-result__item-value f-sm t1">{renderValue(v)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {result.attachments?.length ? (
        <View className="tool-result__attachments">
          <Text className="f-xs t3">附件</Text>
          {result.attachments.map((a) => (
            <Text key={a.url} className="tool-result__attachment f-sm brand ellipsis">
              {a.name}
            </Text>
          ))}
        </View>
      ) : null}

      {extra}

      {result.recommendedArticles?.length ? (
        <View className="tool-result__recommend">
          <Text className="tool-result__recommend-title bold t1">推荐阅读</Text>
          {result.recommendedArticles.slice(0, 3).map((a) => (
            <ArticleCard key={a.id} article={a} onClick={() => onArticleClick?.(a.id)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** 结果占位：未生成时展示操作引导 */
export function ToolResultPlaceholder({ icon = '🧠', text = '填写信息后点击生成' }: { icon?: string; text?: string }) {
  return (
    <View className="tool-result__empty col-center">
      <Text className="tool-result__empty-icon">{icon}</Text>
      <Text className="f-sm t3">{text}</Text>
    </View>
  );
}
