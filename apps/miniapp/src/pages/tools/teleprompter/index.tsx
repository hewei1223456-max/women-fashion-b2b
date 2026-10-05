import { useEffect, useState } from 'react';
import { View, Text, Textarea, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { api } from '@/services/request';
import ToolRunner from '@/components/ToolRunner';
import './index.scss';

const FONT_PRESETS = [48, 64, 80, 96];
const SPEED_PRESETS = [1, 2, 3, 5, 8];

export default function TeleprompterTool() {
  const [text, setText] = useState('');
  /** 用于全屏提词的口播稿（优先用生成结果） */
  const [script, setScript] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(3);
  const [fontIndex, setFontIndex] = useState(1);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    if (!fullscreen || !playing) return;
    const timer = setInterval(() => setScrollTop((t) => t + speed), 120);
    return () => clearInterval(timer);
  }, [fullscreen, playing, speed]);

  const openFullscreen = () => {
    setScrollTop(0);
    setPlaying(true);
    setFullscreen(true);
  };

  return (
    <View className="page">
      <ToolRunner
        toolKey="teleprompter"
        toolName="提词器"
        submitText="生成口播稿"
        resultTitle="口播稿"
        validate={() => (text.trim().length < 5 ? '请输入要口播的内容或卖点' : null)}
        run={async () => {
          const res = await api.tools.teleprompter({ text: text.trim() });
          setScript(res.text || text.trim());
          return res;
        }}
        form={
          <View>
            <Text className="field-label">要口播的内容 / 卖点</Text>
            <Textarea
              className="textarea"
              value={text}
              maxlength={3000}
              placeholder="例如：这件醋酸缎面衬衫垂感很好，S/M/L 三个码，拿货价 89，适合通勤客群……"
              onInput={(e) => setText(e.detail.value)}
            />
            <View className="row-between teleprompter__quick">
              <Text className="f-xs t3">生成后可进入全屏提词，边拍边看</Text>
              <Text className="f-xs t3">{text.length} 字</Text>
            </View>
            <View className="btn btn-ghost btn-sm teleprompter__preview-btn" onClick={() => setFullscreen(true)}>
              <Text>直接进入全屏提词（用手写内容）</Text>
            </View>
          </View>
        }
        resultExtra={
          <View className="teleprompter__entry" onClick={openFullscreen}>
            <Text className="teleprompter__entry-text">▶ 进入全屏提词模式</Text>
          </View>
        }
      />

      {fullscreen ? (
        <View className="teleprompter">
          <View className="teleprompter__body">
            <ScrollView className="teleprompter__scroll" scrollY scrollTop={scrollTop} scrollWithAnimation>
              <Text className="teleprompter__text" style={{ fontSize: Taro.pxTransform(FONT_PRESETS[fontIndex]) }}>
                {script || text || '（暂无口播内容）'}
              </Text>
              <View className="teleprompter__end" />
            </ScrollView>
          </View>

          <View className="teleprompter__controls">
            <View className="row-between teleprompter__row">
              <Text className="teleprompter__ctrl" onClick={() => setPlaying((p) => !p)}>
                {playing ? '⏸ 暂停' : '▶ 继续'}
              </Text>
              <Text
                className="teleprompter__ctrl"
                onClick={() => {
                  setScrollTop(0);
                  setPlaying(true);
                }}
              >
                ↺ 回到开头
              </Text>
              <Text className="teleprompter__ctrl" onClick={() => setFullscreen(false)}>
                ✕ 退出
              </Text>
            </View>
            <View className="row-between teleprompter__row">
              <Text className="teleprompter__ctrl" onClick={() => setSpeed((s) => Math.max(1, s - 1))}>
                减速 −
              </Text>
              <Text className="teleprompter__value">速度 {speed}</Text>
              <Text className="teleprompter__ctrl" onClick={() => setSpeed((s) => Math.min(8, s + 1))}>
                加速 +
              </Text>
            </View>
            <View className="row-between teleprompter__row">
              <Text className="teleprompter__ctrl" onClick={() => setFontIndex((i) => Math.max(0, i - 1))}>
                字号 −
              </Text>
              <Text className="teleprompter__value">字号 {FONT_PRESETS[fontIndex]}</Text>
              <Text className="teleprompter__ctrl" onClick={() => setFontIndex((i) => Math.min(FONT_PRESETS.length - 1, i + 1))}>
                字号 +
              </Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
