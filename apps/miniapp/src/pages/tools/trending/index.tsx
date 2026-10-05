import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import type { StyleTag } from '@wfb/shared-types';
import { STYLE_TAGS } from '@wfb/shared-types';
import { api } from '@/services/request';
import ToolRunner from '@/components/ToolRunner';
import ChipSelect from '@/components/ChipSelect';

const PLATFORMS = [
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'douyin', label: '抖音' },
];

export default function TrendingTool() {
  const [style, setStyle] = useState<StyleTag>('韩系');
  const [platform, setPlatform] = useState<'xiaohongshu' | 'douyin'>('xiaohongshu');

  return (
    <View className="page">
      <ToolRunner
        toolKey="trending"
        toolName="爆款选题"
        submitText="生成今日选题"
        resultTitle="今日爆款选题"
        run={() => api.tools.trending({ style, platform })}
        form={
          <View>
            <Text className="field-label">选择你的风格</Text>
            <ChipSelect options={STYLE_TAGS.map((t) => ({ value: t, label: t }))} value={style} onSelect={(v) => setStyle(v as StyleTag)} />
            <Text className="field-label">发布平台</Text>
            <ChipSelect options={PLATFORMS} value={platform} onSelect={(v) => setPlatform(v as typeof platform)} />
            <Text className="f-xs t3">提示：选题结合近期风格热度与平台流量结构生成，可直接套用标题结构。</Text>
          </View>
        }
      />
    </View>
  );
}
