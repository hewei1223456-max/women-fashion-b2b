import { useState } from 'react';
import { View, Text, Input, Image } from '@tarojs/components';
import { api } from '@/services/request';
import ToolRunner from '@/components/ToolRunner';
import './index.scss';

/** 演示用示例图，方便直接体验（生产由相册上传 / 款图带入） */
const SAMPLES = [
  'https://picsum.photos/seed/wfb-bg-1/600/800',
  'https://picsum.photos/seed/wfb-bg-2/600/800',
  'https://picsum.photos/seed/wfb-bg-3/600/800',
];

export default function RemoveBgTool() {
  const [imageUrl, setImageUrl] = useState('');

  return (
    <View className="page">
      <ToolRunner
        toolKey="remove-bg"
        toolName="图片去背景"
        submitText="一键去背景"
        resultTitle="抠图结果"
        validate={() => (!/^https?:\/\//.test(imageUrl.trim()) ? '请填入商品图链接或选择示例图' : null)}
        run={() => api.tools.removeBg({ imageUrl: imageUrl.trim() })}
        form={
          <View>
            <Text className="field-label">商品图链接</Text>
            <Input className="input" value={imageUrl} placeholder="https:// 开头的图片地址" onInput={(e) => setImageUrl(e.detail.value.trim())} />
            <View className="row remove-bg__samples">
              {SAMPLES.map((s, i) => (
                <View key={s} className={`remove-bg__sample ${imageUrl === s ? 'is-active' : ''}`} onClick={() => setImageUrl(s)}>
                  <Image className="remove-bg__sample-img" src={s} mode="aspectFill" />
                  <Text className="remove-bg__sample-text f-xs t3">示例 {i + 1}</Text>
                </View>
              ))}
            </View>
            {imageUrl ? (
              <View className="remove-bg__preview">
                <Text className="f-xs t3">原图预览</Text>
                <Image className="remove-bg__preview-img" src={imageUrl} mode="aspectFit" />
              </View>
            ) : null}
            <Text className="f-xs t3 remove-bg__tip">去背景后的 PNG 可直接用作主图，建议配合「AI 配图」生成场景图。</Text>
          </View>
        }
      />
    </View>
  );
}
