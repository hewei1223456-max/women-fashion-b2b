import { useState } from 'react';
import { View, Text, Textarea } from '@tarojs/components';
import type { StyleTag } from '@wfb/shared-types';
import { STYLE_TAGS } from '@wfb/shared-types';
import { api } from '@/services/request';
import ToolRunner from '@/components/ToolRunner';
import ChipSelect from '@/components/ChipSelect';
import './index.scss';

const TONES = ['种草', '专业', '亲切', '高级感'] as const;
const PLATFORMS = [
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'douyin', label: '抖音' },
  { value: 'pengyouquan', label: '朋友圈' },
];

export default function RewriteTool() {
  const [text, setText] = useState('');
  const [style, setStyle] = useState<StyleTag>('韩系');
  const [tone, setTone] = useState<(typeof TONES)[number]>('种草');
  const [platform, setPlatform] = useState<'xiaohongshu' | 'douyin' | 'pengyouquan'>('xiaohongshu');

  return (
    <View className="page">
      <ToolRunner
        toolKey="rewrite"
        toolName="文案改写"
        submitText="开始改写"
        resultTitle="改写结果"
        validate={() => (text.trim().length < 5 ? '请输入至少 5 个字的原文' : null)}
        run={() => api.tools.rewrite({ text: text.trim(), style, tone, platform })}
        form={
          <View>
            <View className="row-between">
              <Text className="field-label">原文（同行爆款 / 自己的草稿）</Text>
              <Text className="f-xs t3">{text.length} / 2000</Text>
            </View>
            <Textarea
              className="textarea"
              value={text}
              maxlength={2000}
              placeholder="粘贴或输入原文，例如：这件碎花连衣裙版型很正，显瘦又不挑人……"
              onInput={(e) => setText(e.detail.value)}
            />
            <View className="divider" />
            <Text className="field-label">目标风格</Text>
            <ChipSelect options={STYLE_TAGS.map((t) => ({ value: t, label: t }))} value={style} onSelect={(v) => setStyle(v as StyleTag)} />
            <Text className="field-label">语气</Text>
            <ChipSelect options={TONES.map((t) => ({ value: t, label: t }))} value={tone} onSelect={(v) => setTone(v as (typeof TONES)[number])} />
            <Text className="field-label">发布平台</Text>
            <ChipSelect options={PLATFORMS} value={platform} onSelect={(v) => setPlatform(v as typeof platform)} />
            <Text className="f-xs t3 tool-tip">提示：改写会保留卖点，替换表达与句式，降低搬运风险。</Text>
          </View>
        }
      />
    </View>
  );
}
