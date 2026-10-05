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

export default function AccountDiagnosisTool() {
  const [accountUrl, setAccountUrl] = useState('');
  const [platform, setPlatform] = useState<'xiaohongshu' | 'douyin' | 'shipin'>('xiaohongshu');

  return (
    <View className="page">
      <ToolRunner
        toolKey="account-diagnosis"
        toolName="账号诊断"
        submitText="深度诊断"
        resultTitle="诊断结论与优化方案"
        validate={() => (accountUrl.trim().length < 2 ? '请填写账号主页链接或账号名' : null)}
        run={() => api.tools.accountDiagnosis({ accountUrl: accountUrl.trim(), platform })}
        form={
          <View>
            <View className="tag tag-accent account-diagnosis__badge">
              <Text>会员专属</Text>
            </View>
            <Text className="field-label">账号主页链接 / 账号名</Text>
            <Input className="input" value={accountUrl} placeholder="例如：wfb_demo_shop" onInput={(e) => setAccountUrl(e.detail.value)} />
            <Text className="field-label">平台</Text>
            <ChipSelect options={PLATFORMS} value={platform} onSelect={(v) => setPlatform(v as typeof platform)} />
            <Text className="f-xs t3">诊断在账号分析基础上给出可执行的选题、发布时间、货盘结构建议。</Text>
          </View>
        }
      />
    </View>
  );
}
