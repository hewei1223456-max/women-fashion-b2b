import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, Input, Textarea, Picker, Video } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContentType, PublishContentDto, PublishResult, StyleTag, Visibility } from '@wfb/shared-types';
import { MARKETS, STYLE_TAGS, VISIBILITIES } from '@wfb/shared-types';
import { formatDate, parseMentions, parseTopics, precheckText } from '@wfb/shared-utils';
import { api } from '@/services/request';
import './index.scss';

const CONTENT_TYPES: { key: ContentType; label: string; hint: string }[] = [
  { key: 'image_text', label: '图文', hint: '1-18 张图，适合新款讲解 / 拿货攻略' },
  { key: 'video', label: '视频', hint: '短视频，发布后需异步媒体审核' },
  { key: 'long_article', label: '长文', hint: '最长 5000 字，适合方法论与游学笔记' },
  { key: 'product_card', label: '款卡片', hint: '单款卡片，直接挂到货源板块' },
];

const VISIBILITY_LABELS: Record<Visibility, string> = {
  public: '公开',
  fans: '仅粉丝',
  group: '仅群成员',
  elite: '精英群可见',
  shark: '鲨鱼群可见',
  landmark: '地标大店会员可见',
};

const BOARDS: { key: 'info' | 'source'; label: string }[] = [
  { key: 'info', label: '资讯板块' },
  { key: 'source', label: '货源板块' },
];

/** 'YYYY-MM-DD HH:mm' → ISO（避开各端 Date 解析差异） */
function toIso(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return new Date().toISOString();
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0, 0);
  return d.toISOString();
}

export default function Publish() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const editId = Number(router.params.id ?? 0);
  const draftIdParam = Number(router.params.draftId ?? 0);

  const [draftId, setDraftId] = useState(0);
  const [board, setBoard] = useState<'info' | 'source'>('info');
  const [contentType, setContentType] = useState<ContentType>('image_text');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [styleTags, setStyleTags] = useState<StyleTag[]>([]);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [location, setLocation] = useState('');
  const [productId, setProductId] = useState('');
  const [priceRange, setPriceRange] = useState('');
  const [moq, setMoq] = useState('');
  const [scheduleOn, setScheduleOn] = useState(false);
  const [schedDate, setSchedDate] = useState(formatDate(new Date(Date.now() + 86_400_000).toISOString()));
  const [schedTime, setSchedTime] = useState('10:00');
  const [savedAt, setSavedAt] = useState('');

  const filled = useRef(false);
  const drafts = useQuery({ queryKey: ['drafts'], queryFn: () => api.content.drafts(), enabled: draftIdParam > 0 });
  const editDetail = useQuery({ queryKey: ['content-edit', editId], queryFn: () => api.info.detail(editId), enabled: editId > 0 });

  /* 草稿 / 编辑回填 */
  useEffect(() => {
    if (filled.current) return;
    if (draftIdParam && drafts.data) {
      const d = drafts.data.find((x) => x.id === draftIdParam);
      if (!d) return;
      setDraftId(d.id);
      setContentType(d.contentType);
      setTitle(d.title ?? '');
      setContent(d.content ?? '');
      setImages(d.images ?? []);
      setVideoUrl(d.videoUrl ?? '');
      setStyleTags(d.styleTags ?? []);
      setVisibility(d.visibility ?? 'public');
      setProductId(d.productId ? String(d.productId) : '');
      setLocation(d.location ?? '');
      if (d.scheduledAt) {
        setScheduleOn(true);
        setSchedDate(formatDate(d.scheduledAt));
        setSchedTime(formatDate(d.scheduledAt, true).slice(11));
      }
      filled.current = true;
    } else if (editId && editDetail.data) {
      const a = editDetail.data;
      setContentType(a.contentType);
      setBoard(a.productId ? 'source' : 'info');
      setTitle(a.title ?? '');
      setContent(a.content ?? '');
      setImages(a.images ?? []);
      setVideoUrl(a.videoUrl ?? '');
      setStyleTags(a.styleTags ?? []);
      setVisibility(a.visibility ?? 'public');
      setProductId(a.productId ? String(a.productId) : '');
      setLocation(a.location ?? '');
      setPriceRange(a.priceRange ?? '');
      setMoq(a.moq ? String(a.moq) : '');
      filled.current = true;
    }
  }, [draftIdParam, drafts.data, editId, editDetail.data]);

  const topics = useMemo(() => parseTopics(content), [content]);
  const mentions = useMemo(() => parseMentions(content), [content]);
  const hits = useMemo(() => precheckText(`${title}\n${content}`), [title, content]);

  const saveDraft = useMutation({
    mutationFn: () =>
      api.content.saveDraft({
        id: draftId || undefined,
        board,
        contentType,
        title,
        content,
        images,
        videoUrl: videoUrl || undefined,
        styleTags,
        topics,
        visibility,
        productId: productId ? Number(productId) : undefined,
        location: location || undefined,
        scheduledAt: scheduleOn ? toIso(`${schedDate} ${schedTime}`) : undefined,
      }),
    onSuccess: (d) => {
      setDraftId(d.id);
      setSavedAt(formatDate(new Date().toISOString(), true));
    },
    onError: (e: Error) => Taro.showToast({ title: e.message || '草稿保存失败', icon: 'none' }),
  });

  const publish = useMutation({
    mutationFn: (dto: PublishContentDto) => (editId ? api.content.update(editId, dto) : api.content.publish(dto)),
    onSuccess: (res: PublishResult) => {
      Taro.setStorageSync('wfb_last_publish', JSON.stringify(res));
      void queryClient.invalidateQueries({ queryKey: ['my-content'] });
      void queryClient.invalidateQueries({ queryKey: ['drafts'] });
      Promise.resolve(Taro.redirectTo({ url: `/pages/content/publish-success?id=${res.id}` })).catch(() =>
        Taro.showToast({ title: '发布成功', icon: 'success' }),
      );
    },
    onError: (e: Error) => Taro.showToast({ title: e.message || '发布失败', icon: 'none' }),
  });

  /* 草稿自动保存：5 秒无输入后落库 */
  useEffect(() => {
    const dirty = title.trim().length > 0 || content.trim().length > 0 || images.length > 0 || videoUrl.length > 0;
    if (!dirty || publish.isPending) return undefined;
    const timer = setTimeout(() => saveDraft.mutate(), 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, images.length, videoUrl, styleTags.join(','), visibility, board, contentType, location, scheduleOn]);

  const pickImages = () => {
    const remain = 18 - images.length;
    if (remain <= 0) {
      Taro.showToast({ title: '最多 18 张图片', icon: 'none' });
      return;
    }
    Taro.chooseImage({ count: remain, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
      .then((res) => setImages((prev) => [...prev, ...res.tempFilePaths].slice(0, 18)))
      .catch(() => undefined);
  };

  const pickVideo = () => {
    Taro.chooseVideo({ sourceType: ['album', 'camera'], maxDuration: 60, compressed: true })
      .then((res) => setVideoUrl(res.tempFilePath))
      .catch(() => undefined);
  };

  const toggleTag = (t: StyleTag) => {
    setStyleTags((prev) => {
      if (prev.includes(t)) return prev.filter((x) => x !== t);
      if (prev.length >= 3) {
        Taro.showToast({ title: '最多选择 3 个风格标签', icon: 'none' });
        return prev;
      }
      return [...prev, t];
    });
  };

  const validate = (): string | null => {
    if (!title.trim()) return '标题不能为空';
    if (title.trim().length > 50) return '标题最多 50 字';
    const titleHits = precheckText(title);
    if (!titleHits.pass) return `标题含敏感词：${titleHits.hitWords.join('、')}`;
    const bodyHits = precheckText(content);
    if (!bodyHits.pass) return `正文含敏感词：${bodyHits.hitWords.join('、')}`;
    if (content.length > 5000) return '正文最多 5000 字';
    if (contentType === 'long_article' && content.trim().length < 100) return '长文正文至少 100 字';
    if (contentType !== 'product_card' && contentType !== 'long_article' && !content.trim()) return '正文不能为空';
    if (styleTags.length < 1) return '请至少选择 1 个风格标签';
    if (contentType === 'video' && !videoUrl) return '请上传视频';
    if (contentType !== 'video' && images.length === 0) return '请至少上传 1 张图片';
    if (board === 'source' && contentType !== 'product_card' && !productId) return '货源板块需关联款（填写款 ID）';
    if (contentType === 'product_card' && !priceRange) return '款卡片需填写价格区间';
    if (scheduleOn && new Date(toIso(`${schedDate} ${schedTime}`)).getTime() <= Date.now()) return '定时发布时间需晚于当前时间';
    return null;
  };

  const submit = () => {
    const err = validate();
    if (err) {
      Taro.showToast({ title: err, icon: 'none' });
      return;
    }
    const dto: PublishContentDto = {
      contentType,
      board,
      title: title.trim(),
      content: content.trim(),
      images,
      videoUrl: videoUrl || undefined,
      coverUrl: images[0],
      styleTags,
      topics,
      visibility,
      productId: productId ? Number(productId) : undefined,
      priceRange: priceRange || undefined,
      moq: moq ? Number(moq) : undefined,
      location: location || undefined,
      scheduledAt: scheduleOn ? toIso(`${schedDate} ${schedTime}`) : undefined,
      publishAs: contentType === 'product_card' ? 'product' : 'article',
    };
    publish.mutate(dto);
  };

  const typeHint = CONTENT_TYPES.find((t) => t.key === contentType)?.hint ?? '';

  return (
    <View className="page pb-page">
      <View className="pb-boards">
        {BOARDS.map((b) => (
          <View key={b.key} className={`pb-board ${board === b.key ? 'is-active' : ''}`} onClick={() => setBoard(b.key)}>
            <Text>{b.label}</Text>
          </View>
        ))}
      </View>

      <View className="pb-types">
        {CONTENT_TYPES.map((t) => (
          <View key={t.key} className={`pb-type ${contentType === t.key ? 'is-active' : ''}`} onClick={() => setContentType(t.key)}>
            <Text>{t.label}</Text>
          </View>
        ))}
      </View>
      <Text className="f-xs t3">{typeHint}</Text>

      {draftIdParam > 0 && drafts.isError ? (
        <View className="card" onClick={() => drafts.refetch()}>
          <Text className="f-sm t2">草稿加载失败，无法回填（{(drafts.error as Error)?.message ?? '网络异常'}）</Text>
          <Text className="f-sm brand">点击重试</Text>
        </View>
      ) : null}

      {editId > 0 && editDetail.isError ? (
        <View className="card" onClick={() => editDetail.refetch()}>
          <Text className="f-sm t2">原内容加载失败，无法回填（{(editDetail.error as Error)?.message ?? '网络异常'}）</Text>
          <Text className="f-sm brand">点击重试</Text>
        </View>
      ) : null}

      <View className="card mt-xs">
        <Input
          className="pb-title-input"
          value={title}
          maxlength={50}
          placeholder="填写标题，最多 50 字"
          onInput={(e) => setTitle(e.detail.value)}
        />
        <Text className={`pb-counter ${title.length > 50 ? 'is-over' : ''}`}>{title.length}/50</Text>
        <View className="divider" />
        <Textarea
          className="textarea"
          value={content}
          maxlength={5000}
          placeholder="正文支持 #话题 与 @好友，例如：#秋季新款 @十三行老板"
          onInput={(e) => setContent(e.detail.value)}
        />
        <Text className={`pb-counter ${content.length > 5000 ? 'is-over' : ''}`}>{content.length}/5000</Text>

        {topics.length || mentions.length ? (
          <View className="pb-parse">
            {topics.map((t) => (
              <Text key={`t-${t}`} className="tag">
                #{t}
              </Text>
            ))}
            {mentions.map((m) => (
              <Text key={`m-${m}`} className="tag tag-accent">
                @{m}
              </Text>
            ))}
          </View>
        ) : null}

        {!hits.pass ? (
          <View className="pb-hits">
            <Text className="pb-hits__text">⚠️ 命中敏感词：{hits.hitWords.join('、')}，请修改后再发布（后端还会二次校验）</Text>
          </View>
        ) : null}
      </View>

      <View className="card">
        <Text className="pb-label">图片（{images.length}/18）</Text>
        {contentType === 'video' ? (
          videoUrl ? (
            <View>
              <Video className="pb-video" src={videoUrl} controls />
              <Text className="f-xs t3" onClick={() => setVideoUrl('')}>
                移除视频
              </Text>
            </View>
          ) : (
            <View className="pb-thumb pb-thumb--add" onClick={pickVideo}>
              <Text className="pb-thumb__plus">＋</Text>
              <Text className="pb-thumb__tip">上传视频</Text>
            </View>
          )
        ) : (
          <View className="pb-grid">
            {images.map((url, idx) => (
              <View key={`${url}-${idx}`} className="pb-thumb">
                <Image className="pb-thumb__img" src={url} mode="aspectFill" />
                <Text className="pb-thumb__del" onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}>
                  ×
                </Text>
              </View>
            ))}
            {images.length < 18 ? (
              <View className="pb-thumb pb-thumb--add" onClick={pickImages}>
                <Text className="pb-thumb__plus">＋</Text>
                <Text className="pb-thumb__tip">添加图片</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>

      <View className="card">
        <Text className="pb-label">风格标签（必选 1-3 个）</Text>
        <View className="pb-chips">
          {STYLE_TAGS.map((t) => (
            <Text key={t} className={`pb-chip ${styleTags.includes(t) ? 'is-active' : ''}`} onClick={() => toggleTag(t)}>
              {t}
            </Text>
          ))}
        </View>
      </View>

      <View className="card">
        <Text className="pb-label">发布设置</Text>

        <Picker
          mode="selector"
          range={[...MARKETS]}
          onChange={(e) => setLocation(MARKETS[Number(e.detail.value)] ?? '')}
        >
          <View className="pb-row">
            <Text className="pb-row__key">定位拿货地</Text>
            <Text className={`pb-row__val ${location ? '' : 'is-ph'}`}>{location || '未选择'}</Text>
          </View>
        </Picker>

        <Picker
          mode="selector"
          range={VISIBILITIES.map((v) => VISIBILITY_LABELS[v])}
          onChange={(e) => setVisibility(VISIBILITIES[Number(e.detail.value)] ?? 'public')}
        >
          <View className="pb-row">
            <Text className="pb-row__key">可见范围</Text>
            <Text className="pb-row__val">{VISIBILITY_LABELS[visibility]}</Text>
          </View>
        </Picker>

        {board === 'source' || contentType === 'product_card' ? (
          <View>
            <View className="pb-row">
              <Text className="pb-row__key">关联款 ID</Text>
              <Input
                className="pb-row__val"
                type="number"
                value={productId}
                placeholder="如 12"
                onInput={(e) => setProductId(e.detail.value)}
              />
            </View>
            <View className="pb-row">
              <Text className="pb-row__key">价格区间</Text>
              <Input
                className="pb-row__val"
                value={priceRange}
                placeholder="如 69-129"
                onInput={(e) => setPriceRange(e.detail.value)}
              />
            </View>
            <View className="pb-row">
              <Text className="pb-row__key">起订量（件）</Text>
              <Input className="pb-row__val" type="number" value={moq} placeholder="如 20" onInput={(e) => setMoq(e.detail.value)} />
            </View>
          </View>
        ) : null}

        <View className="pb-row" onClick={() => setScheduleOn((v) => !v)}>
          <Text className="pb-row__key">定时发布</Text>
          <Text className={`pb-row__val ${scheduleOn ? 'brand' : 'is-ph'}`}>{scheduleOn ? '已开启' : '关闭（立即发布）'}</Text>
        </View>

        {scheduleOn ? (
          <View className="row">
            <Picker mode="date" value={schedDate} start={formatDate(new Date().toISOString())} onChange={(e) => setSchedDate(String(e.detail.value))}>
              <View className="pb-row flex-1">
                <Text className="pb-row__key">日期</Text>
                <Text className="pb-row__val">{schedDate}</Text>
              </View>
            </Picker>
            <Picker mode="time" value={schedTime} onChange={(e) => setSchedTime(String(e.detail.value))}>
              <View className="pb-row flex-1">
                <Text className="pb-row__key">时间</Text>
                <Text className="pb-row__val">{schedTime}</Text>
              </View>
            </Picker>
          </View>
        ) : null}
      </View>

      <Text className="pb-autosave">
        {saveDraft.isPending ? '草稿保存中…' : savedAt ? `草稿已自动保存于 ${savedAt}` : '编辑 5 秒后自动保存草稿'}
      </Text>

      <View className="fixed-bottom">
        <View className="pb-bottom">
          <View className="pb-save" onClick={() => saveDraft.mutate()}>
            <Text>存草稿</Text>
          </View>
          <View className={`pb-submit ${publish.isPending ? 'is-disabled' : ''}`} onClick={submit}>
            <Text>{publish.isPending ? '发布中…' : editId ? '保存修改' : scheduleOn ? '定时发布' : '立即发布'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
