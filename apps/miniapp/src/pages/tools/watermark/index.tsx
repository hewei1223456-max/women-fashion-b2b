import { useState } from 'react';
import { View, Text, Input } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { api } from '@/services/request';
import ToolRunner from '@/components/ToolRunner';
import { toastError } from '@/components/Toast';

export default function WatermarkTool() {
  const [url, setUrl] = useState('');

  const paste = () => {
    Taro.getClipboardData()
      .then((res) => setUrl(String(res.data ?? '').trim()))
      .catch(() => toastError('读取剪贴板失败，请手动粘贴'));
  };

  return (
    <View className="page">
      <ToolRunner
        toolKey="remove-watermark"
        toolName="去水印"
        submitText="解析并去水印"
        resultTitle="解析结果"
        validate={() => (!/^https?:\/\//.test(url.trim()) ? '请粘贴完整的分享链接（http 开头）' : null)}
        run={() => api.tools.removeWatermark({ url: url.trim() })}
        form={
          <View>
            <Text className="field-label">视频分享链接</Text>
            <Input className="input" value={url} placeholder="粘贴抖音 / 小红书分享链接" onInput={(e) => setUrl(e.detail.value)} />
            <View className="row tools-watermark__actions">
              <View className="btn btn-plain btn-sm" onClick={paste}>
                <Text>读取剪贴板</Text>
              </View>
              <View className="btn btn-plain btn-sm tools-watermark__clear" onClick={() => setUrl('')}>
                <Text>清空</Text>
              </View>
            </View>
            <Text className="f-xs t3 tools-watermark__tip">复制分享链接后点击「读取剪贴板」即可；仅支持公开视频链接。</Text>
          </View>
        }
      />
    </View>
  );
}
