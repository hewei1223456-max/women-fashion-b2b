import { useEffect, useState } from 'react';
import { View, Text, Image, Input, Textarea, Picker } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { StyleTag, UpdateProfileDto } from '@wfb/shared-types';
import { MARKETS, PRICE_BANDS, STYLE_TAGS } from '@wfb/shared-types';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import './index.scss';

const CERT_LABELS: Record<string, string> = {
  none: '未认证',
  pending: '审核中',
  approved: '已认证',
  rejected: '未通过',
};

function go(url: string) {
  Promise.resolve(Taro.navigateTo({ url })).catch(() => Taro.showToast({ title: '页面开发中，敬请期待', icon: 'none' }));
}

export default function ProfileEdit() {
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);

  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [styleTags, setStyleTags] = useState<StyleTag[]>(user?.styleTags ?? []);
  const [priceBand, setPriceBand] = useState(user?.priceBand ?? '');
  const [cities, setCities] = useState<string[]>(user?.sourcingCities ?? []);
  const [pushEnabled, setPushEnabled] = useState(user?.pushEnabled ?? true);
  const [loaded, setLoaded] = useState(false);

  const detail = useQuery({
    queryKey: ['profile-detail', user?.id],
    queryFn: () => api.profile.detail(user!.id),
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (loaded || !detail.data) return;
    const u = detail.data.user;
    setNickname(u.nickname ?? '');
    setAvatarUrl(u.avatarUrl ?? '');
    setBio(u.bio ?? '');
    setStyleTags(u.styleTags ?? []);
    setCities(user?.sourcingCities ?? []);
    setPriceBand(user?.priceBand ?? '');
    setPushEnabled(user?.pushEnabled ?? true);
    setLoaded(true);
  }, [detail.data, loaded, user]);

  const save = useMutation({
    mutationFn: (dto: UpdateProfileDto) => api.profile.update(dto),
    onSuccess: (u) => {
      setUser(u);
      Taro.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => Taro.navigateBack().catch(() => undefined), 600);
    },
    onError: (e: Error) => Taro.showToast({ title: e.message || '保存失败', icon: 'none' }),
  });

  const pickAvatar = () => {
    Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
      .then((res) => {
        const url = res.tempFilePaths[0];
        if (url) setAvatarUrl(url);
      })
      .catch(() => undefined);
  };

  const toggleTag = (t: StyleTag) => {
    setStyleTags((prev) => {
      if (prev.includes(t)) return prev.filter((x) => x !== t);
      if (prev.length >= 5) {
        Taro.showToast({ title: '最多 5 个风格标签', icon: 'none' });
        return prev;
      }
      return [...prev, t];
    });
  };

  const toggleCity = (c: string) => {
    setCities((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const submit = () => {
    const name = nickname.trim();
    if (name.length < 2 || name.length > 16) {
      Taro.showToast({ title: '昵称需 2-16 个字', icon: 'none' });
      return;
    }
    if (bio.length > 100) {
      Taro.showToast({ title: '简介最多 100 字', icon: 'none' });
      return;
    }
    if (styleTags.length < 1) {
      Taro.showToast({ title: '请至少选 1 个风格标签（用于推荐）', icon: 'none' });
      return;
    }
    save.mutate({
      nickname: name,
      avatarUrl,
      bio,
      styleTags,
      priceBand: priceBand || undefined,
      sourcingCities: cities,
      pushEnabled,
    });
  };

  if (!user) {
    return (
      <View className="page">
        <View className="empty">
          请先登录
          <Text className="brand" onClick={() => Taro.navigateTo({ url: '/pages/auth/login' }).catch(() => undefined)}>
            {' '}
            去登录
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="page">
      {detail.isLoading ? <View className="loading">资料加载中…</View> : null}
      {detail.isError ? (
        <View className="card" onClick={() => detail.refetch()}>
          <Text className="f-sm t2">云端资料加载失败，可直接编辑本地资料</Text>
          <Text className="f-sm brand">点击重试</Text>
        </View>
      ) : null}

      <View className="card">
        <View className="ed-avatar-row">
          <View>
            <Text className="f-md t2">头像</Text>
            <Text className="ed-avatar-tip">点击右侧头像选择图片（Demo 环境本地预览）</Text>
          </View>
          <Image className="ed-avatar" src={avatarUrl} mode="aspectFill" onClick={pickAvatar} />
        </View>
      </View>

      <View className="card">
        <View className="field">
          <Text className="field-label">昵称（2-16 字）</Text>
          <Input className="input" value={nickname} maxlength={16} placeholder="填写昵称" onInput={(e) => setNickname(e.detail.value)} />
        </View>
        <View className="field">
          <Text className="field-label">个人简介（{bio.length}/100）</Text>
          <Textarea
            className="textarea"
            value={bio}
            maxlength={100}
            placeholder="介绍一下你的店铺 / 厂家 / 擅长风格"
            onInput={(e) => setBio(e.detail.value)}
          />
        </View>
      </View>

      <View className="card">
        <Text className="f-md bold">风格标签（必选 1-5 个，决定推荐匹配）</Text>
        <View className="ed-chips mt-xs">
          {STYLE_TAGS.map((t) => (
            <Text key={t} className={`ed-chip ${styleTags.includes(t) ? 'is-active' : ''}`} onClick={() => toggleTag(t)}>
              {t}
            </Text>
          ))}
        </View>
      </View>

      <View className="card">
        <Text className="f-md bold">拿货偏好</Text>

        <Picker mode="selector" range={[...PRICE_BANDS]} onChange={(e) => setPriceBand(PRICE_BANDS[Number(e.detail.value)] ?? '')}>
          <View className="ed-row">
            <Text className="ed-row__key">价格带</Text>
            <Text className={`ed-row__val ${priceBand ? '' : 'is-ph'}`}>{priceBand || '未选择'}</Text>
          </View>
        </Picker>

        <Text className="field-label mt-xs">常去拿货市场（可多选）</Text>
        <View className="ed-chips">
          {MARKETS.map((c) => (
            <Text key={c} className={`ed-chip ${cities.includes(c) ? 'is-active' : ''}`} onClick={() => toggleCity(c)}>
              {c}
            </Text>
          ))}
        </View>

        <View className="ed-row" onClick={() => setPushEnabled((v) => !v)}>
          <Text className="ed-row__key">接收主动私信推送</Text>
          <Text className={`ed-toggle ${pushEnabled ? 'is-on' : ''}`}>{pushEnabled ? '已开启' : '已关闭'}</Text>
        </View>
      </View>

      <View className="card">
        <Text className="f-md bold">更多设置</Text>
        <View className="ed-row" onClick={() => go('/pages/profile/settings')}>
          <Text className="ed-row__key">通知与隐私设置</Text>
          <Text className="ed-row__val">黑名单 / 接收条数 ›</Text>
        </View>
        <View className="ed-row" onClick={() => go('/pages/auth/certify')}>
          <Text className="ed-row__key">企业认证</Text>
          <Text className="ed-row__val">{CERT_LABELS[user.certStatus] ?? '未认证'} ›</Text>
        </View>
        <View className="ed-row" onClick={() => go('/pages/profile/collection')}>
          <Text className="ed-row__key">我的收藏</Text>
          <Text className="ed-row__val">›</Text>
        </View>
        <View className="ed-row" onClick={() => go('/pages/content/my-content')}>
          <Text className="ed-row__key">我的内容</Text>
          <Text className="ed-row__val">›</Text>
        </View>
      </View>

      <View className={`btn btn-primary btn-block ${save.isPending ? 'btn-disabled' : ''}`} onClick={submit}>
        <Text>{save.isPending ? '保存中…' : '保存资料'}</Text>
      </View>
    </View>
  );
}
