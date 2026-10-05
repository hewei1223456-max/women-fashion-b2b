import { useState } from 'react';
import type { ReactNode } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ToolResult } from '@wfb/shared-types';
import { TOOL_FREE_QUOTA } from '@wfb/shared-types';
import { clsx } from '@wfb/shared-utils';
import { api } from '@/services/request';
import QuotaHint from '../QuotaHint';
import Modal from '../Modal';
import ToolResultView from '../ToolResultView';
import { errMsg } from '../utils';
import './index.scss';

interface Props {
  /** TOOL_FREE_QUOTA 的 key，如 rewrite */
  toolKey: string;
  toolName: string;
  /** 输入表单区 */
  form: ReactNode;
  /** 提交前校验，返回字符串则中断并提示 */
  validate?: () => string | null;
  /** 实际调用 api.tools.* 的函数 */
  run: () => Promise<ToolResult>;
  /** 生成按钮文案 */
  submitText?: string;
  resultTitle?: string;
  /** 结果区额外内容 */
  resultExtra?: ReactNode;
  className?: string;
}

/**
 * 工具页通用外壳：输入 → 加载 → 结果 → 剩余免费次数 → 额度用完引导开通会员。
 * 10 个工具页共用，保证状态机与文案完全一致。
 */
export default function ToolRunner({ toolKey, toolName, form, validate, run, submitText = '立即生成', resultTitle, resultExtra, className }: Props) {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ToolResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgradeVisible, setUpgradeVisible] = useState(false);
  const [quotaOut, setQuotaOut] = useState(false);

  const quotaQuery = useQuery({ queryKey: ['tools-quota'], queryFn: () => api.tools.quota(), staleTime: 10_000 });
  const entry = quotaQuery.data?.find((q) => q.tool === toolKey);
  const fallbackLimit = TOOL_FREE_QUOTA[toolKey] ?? 0;
  const used = entry?.used ?? result?.quotaUsed ?? 0;
  const limit = entry?.limit ?? result?.quotaLimit ?? fallbackLimit;

  const submit = async () => {
    const invalid = validate?.();
    if (invalid) {
      Taro.showToast({ title: invalid, icon: 'none' });
      return;
    }
    setRunning(true);
    setError(null);
    setQuotaOut(false);
    try {
      const res = await run();
      setResult(res);
      queryClient.invalidateQueries({ queryKey: ['tools-quota'] });
    } catch (e) {
      const message = errMsg(e, '生成失败，请稍后重试');
      setError(message);
      if ((e as { code?: number })?.code === 429) {
        setQuotaOut(true);
        setUpgradeVisible(true);
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <View className={clsx('tool-runner', className)}>
      <QuotaHint used={used} limit={limit} label={toolName} loading={quotaQuery.isLoading} onUpgrade={() => setUpgradeVisible(true)} />

      <View className="card">{form}</View>

      <View className={clsx('btn btn-primary btn-block tool-runner__submit', running && 'btn-disabled')} onClick={submit}>
        <Text>{running ? '生成中，请稍候...' : submitText}</Text>
      </View>

      {running ? (
        <View className="tool-runner__running col-center">
          <View className="tool-runner__spinner" />
          <Text className="f-xs t3">AI 正在处理，通常 3-10 秒</Text>
        </View>
      ) : null}

      {error ? (
        <View className="tool-runner__error">
          <Text className="tool-runner__error-text f-sm">{error}</Text>
          {quotaOut ? (
            <View className="tool-runner__error-action" onClick={() => setUpgradeVisible(true)}>
              <Text className="tool-runner__error-action-text">开通会员，无限使用 →</Text>
            </View>
          ) : (
            <View className="tool-runner__error-action" onClick={submit}>
              <Text className="tool-runner__error-action-text">重试</Text>
            </View>
          )}
        </View>
      ) : null}

      {result ? <ToolResultView result={result} title={resultTitle ?? `${toolName}结果`} extra={resultExtra} /> : null}

      <Modal
        visible={upgradeVisible}
        title="开通会员"
        content="免费额度已用完。开通会员后 10 个功能全部无限使用，并解锁账号诊断、视频剪辑、运营建议等会员专属能力。"
        confirmText="去开通"
        cancelText="再看看"
        onCancel={() => setUpgradeVisible(false)}
        onConfirm={() => {
          setUpgradeVisible(false);
          Taro.navigateTo({ url: '/pages/profile/index' });
        }}
      />
    </View>
  );
}
