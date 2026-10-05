import { useState } from 'react';
import { View, Text, Input, Textarea } from '@tarojs/components';
import type { StyleTag } from '@wfb/shared-types';
import { STYLE_TAGS } from '@wfb/shared-types';
import { api } from '@/services/request';
import ToolRunner from '@/components/ToolRunner';
import ChipSelect from '@/components/ChipSelect';
import './index.scss';

export default function OperationAdviceTool() {
  const [shopName, setShopName] = useState('');
  const [monthlyRevenue, setMonthlyRevenue] = useState('');
  const [avgOrderValue, setAvgOrderValue] = useState('');
  const [followerCount, setFollowerCount] = useState('');
  const [styleTags, setStyleTags] = useState<StyleTag[]>(['韩系']);
  const [note, setNote] = useState('');

  const toggleStyle = (v: string) => {
    setStyleTags((prev) => (prev.includes(v as StyleTag) ? prev.filter((x) => x !== v) : [...prev, v as StyleTag]));
  };

  return (
    <View className="page">
      <ToolRunner
        toolKey="operation-advice"
        toolName="运营建议"
        submitText="获取运营建议"
        resultTitle="运营建议"
        validate={() => (shopName.trim().length < 2 ? '请填写店铺名称' : null)}
        run={() =>
          api.tools.operationAdvice({
            shopName: shopName.trim(),
            monthlyRevenue: monthlyRevenue ? Number(monthlyRevenue) : undefined,
            avgOrderValue: avgOrderValue ? Number(avgOrderValue) : undefined,
            followerCount: followerCount ? Number(followerCount) : undefined,
            styleTags,
            note: note.trim() || undefined,
          })
        }
        form={
          <View>
            <View className="tag tag-accent op-advice__badge">
              <Text>会员专属</Text>
            </View>
            <Text className="field-label">店铺名称 *</Text>
            <Input className="input" value={shopName} placeholder="例如：小满女装（四季青店）" onInput={(e) => setShopName(e.detail.value)} />
            <Text className="field-label">月销售额（元，可选）</Text>
            <Input className="input" type="number" value={monthlyRevenue} placeholder="例如：180000" onInput={(e) => setMonthlyRevenue(e.detail.value)} />
            <Text className="field-label">客单价（元，可选）</Text>
            <Input className="input" type="number" value={avgOrderValue} placeholder="例如：168" onInput={(e) => setAvgOrderValue(e.detail.value)} />
            <Text className="field-label">粉丝数（可选）</Text>
            <Input className="input" type="number" value={followerCount} placeholder="例如：3200" onInput={(e) => setFollowerCount(e.detail.value)} />
            <Text className="field-label">主营风格（可多选）</Text>
            <ChipSelect
              multiple
              options={STYLE_TAGS.map((t) => ({ value: t, label: t }))}
              values={styleTags}
              onSelect={toggleStyle}
            />
            <Text className="field-label">补充说明（可选）</Text>
            <Textarea
              className="textarea"
              value={note}
              maxlength={500}
              placeholder="例如：主要做线下老客，想在小红书起号；上新节奏一周两次"
              onInput={(e) => setNote(e.detail.value)}
            />
          </View>
        }
      />
    </View>
  );
}
