import { useState } from 'react';
import { View, Text, Input } from '@tarojs/components';
import { api } from '@/services/request';
import ToolRunner from '@/components/ToolRunner';
import ChipSelect from '@/components/ChipSelect';

const PLATFORMS = [
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'douyin', label: '抖音' },
  { value: 'shipin', label: '视频号' },
];

export default function AccountAnalysisTool() {
  const [accountUrl, setAccountUrl] = useState('');
  const [platform, setPlatform] = useState<'xiaohongshu' | 'douyin' | 'shipin'>('xiaohongshu');

  return (
    <View className="page">
      <ToolRunner
        toolKey="account-analysis"
        toolName="账号分析"
        submitText="开始分析"
        resultTitle="账号分析报告"
        validate={() => (accountUrl.trim().length < 2 ? '请填写账号主页链接或账号名' : null)}
        run={() => api.tools.accountAnalysis({ accountUrl: accountUrl.trim(), platform })}
        form={
          <View>
            <Text className="field-label">账号主页链接 / 账号名</Text>
            <Input
              className="input"
              value={accountUrl}
              placeholder="例如：https://www.xiaohongshu.com/user/profile/xxx"
              onInput={(e) => setAccountUrl(e.detail.value)}
            />
            <Text className="field-label">平台</Text>
            <ChipSelect options={PLATFORMS} value={platform} onSelect={(v) => setPlatform(v as typeof platform)} />
            <Text className="f-xs t3">分析维度：内容质量分、粉丝画像、爆款率、发布节奏建议。</Text>
          </View>
        }
      />
    </View>
  );
}
