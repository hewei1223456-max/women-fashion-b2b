import { useState } from 'react';
import { View, Text, Textarea, Image } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import type { StyleTag } from '@wfb/shared-types';
import { STYLE_TAGS } from '@wfb/shared-types';
import { api } from '@/services/request';
import ToolRunner from '@/components/ToolRunner';
import ChipSelect from '@/components/ChipSelect';

const RATIOS = [
  { value: '1:1', label: '1:1 方图' },
  { value: '3:4', label: '3:4 主图' },
  { value: '9:16', label: '9:16 竖版' },
];

export default function AiImageTool() {
  const router = useRouter();
  /** 货源 → 功能联动：从款详情/资讯详情带过来的款图 */
  const linkedImage = router.params?.productImageUrl ? decodeURIComponent(router.params.productImageUrl) : '';
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<StyleTag>('韩系');
  const [ratio, setRatio] = useState<'1:1' | '3:4' | '9:16'>('3:4');

  return (
    <View className="page">
      <ToolRunner
        toolKey="ai-image"
        toolName="AI 配图"
        submitText="生成配图"
        resultTitle="生成结果"
        validate={() => (prompt.trim().length < 4 ? '请描述你想要的图片内容' : null)}
        run={() => api.tools.generateImage({ prompt: prompt.trim(), style, ratio, productImageUrl: linkedImage || undefined })}
        form={
          <View>
            {linkedImage ? (
              <View className="ai-image__linked">
                <Text className="f-xs t3">来自货源款的关联图（已自动带入）</Text>
                <Image className="ai-image__linked-img" src={linkedImage} mode="aspectFill" />
              </View>
            ) : null}
            <Text className="field-label">图片描述</Text>
            <Textarea
              className="textarea"
              value={prompt}
              maxlength={500}
              placeholder="例如：韩系碎花连衣裙平铺主图，奶油色背景，柔和自然光，构图留白"
              onInput={(e) => setPrompt(e.detail.value)}
            />
            <View className="row-between ai-image__count">
              <Text className="f-xs t3">描述越具体效果越好</Text>
              <Text className="f-xs t3">{prompt.length} / 500</Text>
            </View>
            <Text className="field-label">风格</Text>
            <ChipSelect options={STYLE_TAGS.map((t) => ({ value: t, label: t }))} value={style} onSelect={(v) => setStyle(v as StyleTag)} />
            <Text className="field-label">尺寸</Text>
            <ChipSelect options={RATIOS} value={ratio} onSelect={(v) => setRatio(v as typeof ratio)} />
          </View>
        }
        resultExtra={
          <View className="ai-image__link-entry" onClick={() => Taro.navigateTo({ url: '/pages/tools/remove-bg' })}>
            <Text className="f-sm brand">生成后需要抠图？试试「图片去背景」→</Text>
          </View>
        }
      />
    </View>
  );
}
