import { useState } from 'react';
import { View, Text, Textarea } from '@tarojs/components';
import { api } from '@/services/request';
import ToolRunner from '@/components/ToolRunner';
import ChipSelect from '@/components/ChipSelect';
import './index.scss';

const TEMPLATES = [
  { value: 'fast-cut', label: '快节奏卡点' },
  { value: 'model-show', label: '模特展示' },
  { value: 'detail-closeup', label: '细节特写' },
  { value: 'store-vlog', label: '店铺日常' },
];

export default function VideoEditTool() {
  const [templateId, setTemplateId] = useState('fast-cut');
  const [materials, setMaterials] = useState('');

  const materialUrls = materials
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <View className="page">
      <ToolRunner
        toolKey="video-edit"
        toolName="视频剪辑"
        submitText="生成短视频"
        resultTitle="剪辑任务"
        validate={() => (materialUrls.length < 1 ? '请至少粘贴 1 个素材链接（每行一个）' : null)}
        run={() => api.tools.videoEdit({ templateId, materialUrls })}
        form={
          <View>
            <View className="tag tag-accent video-edit__badge">
              <Text>按次计费 / 会员不限</Text>
            </View>
            <Text className="field-label">剪辑模板</Text>
            <ChipSelect options={TEMPLATES} value={templateId} onSelect={setTemplateId} />
            <View className="row-between">
              <Text className="field-label">素材链接（每行一个）</Text>
              <Text className="f-xs t3">已识别 {materialUrls.length} 个</Text>
            </View>
            <Textarea
              className="textarea"
              value={materials}
              maxlength={4000}
              placeholder={'https://…/video1.mp4\nhttps://…/video2.mp4'}
              onInput={(e) => setMaterials(e.detail.value)}
            />
            <Text className="f-xs t3 video-edit__tip">支持 mp4 / mov 链接；生成后可在结果区复制成片地址。</Text>
          </View>
        }
      />
    </View>
  );
}
