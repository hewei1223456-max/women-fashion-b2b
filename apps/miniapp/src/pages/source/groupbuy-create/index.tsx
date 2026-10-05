import { useState } from 'react';
import { View, Text, Input, Textarea, Picker } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useQueryClient } from '@tanstack/react-query';
import type { StyleTag } from '@wfb/shared-types';
import { MARKETS, STYLE_TAGS } from '@wfb/shared-types';
import { api } from '@/services/request';
import ChipSelect from '@/components/ChipSelect';
import { hideLoading, showLoading, toastError, toastSuccess } from '@/components/Toast';
import { errMsg } from '@/components/utils';
import './index.scss';

/** 默认截止日期：7 天后 */
function defaultDeadline(): string {
  const d = new Date(Date.now() + 7 * 86_400_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function GroupBuyCreate() {
  const router = useRouter();
  const productId = Number(router.params?.productId ?? 0);
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetCount, setTargetCount] = useState('20');
  const [styleTag, setStyleTag] = useState<StyleTag>('韩系');
  const [market, setMarket] = useState<string>('十三行');
  const [deadline, setDeadline] = useState(defaultDeadline());
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (title.trim().length < 4) return toastError('请填写拼单标题（至少 4 个字）');
    if (!Number(targetCount)) return toastError('请填写目标件数');
    setSubmitting(true);
    showLoading('提交中...');
    try {
      const created = await api.groupbuy.create({
        title: title.trim(),
        description: description.trim(),
        productId: productId || undefined,
        targetCount: Number(targetCount),
        styleTag,
        market,
        deadlineAt: new Date(`${deadline}T23:59:59`).toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ['groupbuy-list'] });
      queryClient.invalidateQueries({ queryKey: ['groupbuy-mine'] });
      hideLoading();
      toastSuccess('拼单已发布');
      Taro.redirectTo({ url: `/pages/source/groupbuy-detail?id=${created.id}` });
    } catch (e) {
      hideLoading();
      toastError(errMsg(e, '发布失败'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="page">
      <View className="card">
        {productId ? (
          <View className="gbc__linked">
            <Text className="f-xs t3">已关联款 #{productId}（从款详情进入）</Text>
          </View>
        ) : null}

        <Text className="field-label">拼单标题 *</Text>
        <Input className="input" value={title} maxlength={40} placeholder="例如：十三行醋酸衬衫拼单，10 件起批" onInput={(e) => setTitle(e.detail.value)} />

        <Text className="field-label">拼单说明</Text>
        <Textarea
          className="textarea"
          value={description}
          maxlength={500}
          placeholder="说明款式、颜色尺码、价格、发货时间、拼单规则等"
          onInput={(e) => setDescription(e.detail.value)}
        />

        <Text className="field-label">目标件数 *</Text>
        <Input className="input" type="number" value={targetCount} placeholder="例如：20" onInput={(e) => setTargetCount(e.detail.value)} />

        <Text className="field-label">风格</Text>
        <ChipSelect options={STYLE_TAGS.map((t) => ({ value: t, label: t }))} value={styleTag} onSelect={(v) => setStyleTag(v as StyleTag)} />

        <Text className="field-label">拿货市场</Text>
        <ChipSelect options={MARKETS.map((m) => ({ value: m, label: m }))} value={market} onSelect={setMarket} />

        <Text className="field-label">截止日期</Text>
        <Picker mode="date" value={deadline} start={defaultDeadline()} onChange={(e) => setDeadline(String(e.detail.value))}>
          <View className="field gbc__picker row-between">
            <Text className="f-sm t1">{deadline}</Text>
            <Text className="f-xs t3">选择日期</Text>
          </View>
        </Picker>
      </View>

      <View className={`btn btn-primary btn-block ${submitting ? 'btn-disabled' : ''}`} onClick={submit}>
        <Text>{submitting ? '提交中...' : '发布拼单'}</Text>
      </View>
      <Text className="f-xs t3 gbc__tip">发布后其他店主可在「拼单广场」看到并参团，达到目标件数自动成团。</Text>
    </View>
  );
}
