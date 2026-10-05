import { useMemo } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import type { PublishResult } from '@wfb/shared-types';
import { safeJson } from '@wfb/shared-utils';
import './index.scss';

const AUDIT_LABELS: Record<string, string> = {
  pending: '审核中',
  approved: '已通过',
  rejected: '未通过',
};

function go(url: string, tab = false) {
  const task = tab ? Taro.redirectTo({ url }) : Taro.navigateTo({ url });
  Promise.resolve(task).catch(() => Taro.showToast({ title: '页面开发中，敬请期待', icon: 'none' }));
}

export default function PublishSuccess() {
  const router = useRouter();
  const contentId = Number(router.params.id ?? 0);

  const result = useMemo<PublishResult | null>(() => {
    const raw = Taro.getStorageSync('wfb_last_publish');
    const parsed = safeJson<PublishResult | null>(typeof raw === 'string' ? raw : null, null);
    return parsed && typeof parsed.id === 'number' ? parsed : null;
  }, []);

  const textPass = result?.textAudit?.pass ?? true;
  const mediaTasks = result?.mediaTaskIds ?? [];

  return (
    <View className="page">
      <View className="ps-hero">
        <Text className="ps-hero__icon">{textPass ? '🎉' : '⚠️'}</Text>
        <Text className="ps-hero__title">{textPass ? '发布成功' : '已提交，但需修改'}</Text>
        <Text className="ps-hero__sub">
          {result?.message ?? '内容已提交，正在按平台流程审核'}
        </Text>
      </View>

      <View className="card">
        <Text className="f-md bold">同步文本审核结论</Text>
        <View className="ps-row">
          <Text className="ps-row__key">文本审核</Text>
          <Text className={`ps-row__val ${textPass ? 'is-ok' : 'is-bad'}`}>{textPass ? '通过' : '未通过'}</Text>
        </View>
        {result?.textAudit?.reason ? (
          <View className="ps-row">
            <Text className="ps-row__key">未通过原因</Text>
            <Text className="ps-row__val is-bad">{result.textAudit.reason}</Text>
          </View>
        ) : null}
        {result?.textAudit?.hitWords?.length ? (
          <View className="ps-row">
            <Text className="ps-row__key">命中词</Text>
            <Text className="ps-row__val is-bad">{result.textAudit.hitWords.join('、')}</Text>
          </View>
        ) : null}
        <View className="ps-row">
          <Text className="ps-row__key">内容审核状态</Text>
          <Text className="ps-row__val">{AUDIT_LABELS[result?.auditStatus ?? 'pending'] ?? '审核中'}</Text>
        </View>
        <View className="ps-row">
          <Text className="ps-row__key">是否需要人工复审</Text>
          <Text className={`ps-row__val ${result?.manualReview ? 'is-bad' : ''}`}>{result?.manualReview ? '是' : '否'}</Text>
        </View>
        {contentId ? (
          <View className="ps-row">
            <Text className="ps-row__key">内容 ID</Text>
            <Text className="ps-row__val">{contentId}</Text>
          </View>
        ) : null}
      </View>

      <View className="card">
        <Text className="f-md bold">异步媒体审核任务</Text>
        {mediaTasks.length ? (
          mediaTasks.map((id) => (
            <Text key={id} className="ps-task">
              任务号：{id}
            </Text>
          ))
        ) : (
          <Text className="ps-task">本次内容无需媒体审核（纯文本内容）</Text>
        )}
        <View className="ps-tip">
          <Text className="ps-tip__text">
            ⏱ 图片 / 视频走平台异步审核，可能要等 5-30 分钟才有最终结论；审核期间内容对他人不可见，结果会通过「消息中心 - 审核通知」推送给你。
          </Text>
        </View>
      </View>

      <View className="card">
        <Text className="f-md bold">接下来可以做</Text>
        <View className="ps-actions">
          <Text className="ps-action ps-action--primary" onClick={() => go('/pages/content/my-content')}>
            查看我的内容
          </Text>
          <Text className="ps-action" onClick={() => go(contentId ? `/pages/content/content-analytics?id=${contentId}` : '/pages/content/content-analytics')}>
            数据看板
          </Text>
          <Text className="ps-action" onClick={() => Taro.redirectTo({ url: '/pages/content/publish' }).catch(() => undefined)}>
            继续发布
          </Text>
          <Text className="ps-action" onClick={() => go('/pages/index/index', true)}>
            回首页
          </Text>
        </View>
      </View>
    </View>
  );
}
