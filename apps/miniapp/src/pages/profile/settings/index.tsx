import { useEffect, useState } from 'react';
import { View, Text, Image, Input, Picker } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReceivePreference, StyleTag } from '@wfb/shared-types';
import { PRICE_BANDS, STYLE_TAGS } from '@wfb/shared-types';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import { UserBadges } from '@/components/Badge';
import './index.scss';

const ROLE_LABELS: Record<string, string> = {
  shop_owner: '店主人',
  manufacturer: '厂家',
  landmark: '地标大店',
  lecturer: '讲师',
  admin: '运营',
};

const CERT_LABELS: Record<string, string> = {
  none: '未认证',
  pending: '认证审核中',
  approved: '已认证',
  rejected: '认证未通过',
};

const DAILY_LIMITS = [0, 5, 10, 20, 50];

function go(url: string) {
  Promise.resolve(Taro.navigateTo({ url })).catch(() => Taro.showToast({ title: '页面开发中，敬请期待', icon: 'none' }));
}

export default function ProfileSettings() {
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const logout = useAppStore((s) => s.logout);
  const setPreference = useAppStore((s) => s.setPreference);
  const queryClient = useQueryClient();

  const [pushEnabled, setPushEnabled] = useState(user?.pushEnabled ?? true);
  const [dailyLimit, setDailyLimit] = useState(10);
  const [stylePreferences, setStylePreferences] = useState<StyleTag[]>([]);
  const [priceBandPreferences, setPriceBandPreferences] = useState<string[]>([]);
  const [blacklist, setBlacklist] = useState<number[]>([]);
  const [blackInput, setBlackInput] = useState('');
  const [prefLoaded, setPrefLoaded] = useState(false);

  const pref = useQuery({ queryKey: ['receive-preference'], queryFn: () => api.contact.preference(), enabled: !!user });
  const health = useQuery({ queryKey: ['system-health'], queryFn: () => api.system.health() });

  useEffect(() => {
    if (prefLoaded || !pref.data) return;
    const p: ReceivePreference = pref.data;
    setDailyLimit(p.dailyLimit ?? 10);
    setStylePreferences(p.stylePreferences ?? []);
    setPriceBandPreferences(p.priceBandPreferences ?? []);
    setBlacklist(p.blacklistManufacturerIds ?? []);
    setPrefLoaded(true);
  }, [pref.data, prefLoaded]);

  const savePush = useMutation({
    mutationFn: (on: boolean) => api.profile.update({ pushEnabled: on }),
    onSuccess: (u) => {
      setUser(u);
      Taro.showToast({ title: u.pushEnabled ? '已开启接收推送' : '已关闭接收推送', icon: 'none' });
    },
    onError: (e: Error) => {
      setPushEnabled(user?.pushEnabled ?? true);
      Taro.showToast({ title: e.message || '设置失败', icon: 'none' });
    },
  });

  const savePref = useMutation({
    mutationFn: () =>
      api.contact.savePreference({
        dailyLimit,
        stylePreferences,
        priceBandPreferences,
        blacklistManufacturerIds: blacklist,
      }),
    onSuccess: (p) => {
      setPreference(p);
      Taro.showToast({ title: '隐私设置已保存', icon: 'success' });
    },
    onError: (e: Error) => Taro.showToast({ title: e.message || '保存失败', icon: 'none' }),
  });

  const doLogout = useMutation({
    mutationFn: () => api.auth.logout(),
    onSettled: () => {
      logout();
      queryClient.clear();
      Taro.reLaunch({ url: '/pages/index/index' }).catch(() => undefined);
    },
  });

  const togglePush = () => {
    const next = !pushEnabled;
    setPushEnabled(next);
    savePush.mutate(next);
  };

  const toggleStyle = (t: StyleTag) => {
    setStylePreferences((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const toggleBand = (b: string) => {
    setPriceBandPreferences((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));
  };

  const addBlack = () => {
    const id = Number(blackInput);
    if (!id) {
      Taro.showToast({ title: '请输入厂家用户 ID', icon: 'none' });
      return;
    }
    if (blacklist.includes(id)) {
      Taro.showToast({ title: '已在黑名单中', icon: 'none' });
      return;
    }
    setBlacklist((prev) => [...prev, id]);
    setBlackInput('');
  };

  const confirmLogout = () => {
    Taro.showModal({
      title: '退出登录',
      content: '退出后需要重新登录才能发布内容与查看数据。',
      success: (res) => {
        if (res.confirm) doLogout.mutate();
      },
    });
  };

  if (!user) {
    return (
      <View className="page">
        <View className="empty">
          未登录
          <Text className="brand" onClick={() => go('/pages/auth/login')}>
            {' '}
            去登录
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="page">
      <View className="card">
        <View className="st-user">
          <Image className="st-user__avatar" src={user.avatarUrl} mode="aspectFill" />
          <View className="flex-1">
            <Text className="st-user__name">{user.nickname}</Text>
            {/* User 实体没有 badges 字段，组件按 role/certStatus/memberLevel 兜底推断 */}
            <UserBadges user={user} max={3} size="xs" />
            <Text className="st-user__meta">
              {ROLE_LABELS[user.role] ?? user.role} · {CERT_LABELS[user.certStatus] ?? user.certStatus}
            </Text>
          </View>
          <Text className="brand f-sm" onClick={() => go('/pages/profile/edit')}>
            编辑资料 ›
          </Text>
        </View>
      </View>

      <View className="card">
        <Text className="f-md bold">通知与认证</Text>
        <View className="st-row" onClick={togglePush}>
          <View>
            <Text className="st-row__key">接收主动私信推送</Text>
            <Text className="st-row__desc">关闭后厂家无法主动私信你（加微仍可用）</Text>
          </View>
          <Text className={`st-toggle ${pushEnabled ? 'is-on' : ''}`}>{pushEnabled ? '已开启' : '已关闭'}</Text>
        </View>
        <View className="st-row" onClick={() => go('/pages/auth/certify')}>
          <View>
            <Text className="st-row__key">企业认证</Text>
            <Text className="st-row__desc">认证后可解锁会员分层可见内容与更多额度</Text>
          </View>
          <Text className="st-row__val">{CERT_LABELS[user.certStatus] ?? '未认证'} ›</Text>
        </View>
      </View>

      <View className="card">
        <Text className="f-md bold">隐私设置（接收主动私信的偏好）</Text>
        {pref.isLoading ? <View className="loading">偏好加载中…</View> : null}
        {pref.isError ? (
          <View className="loading" onClick={() => pref.refetch()}>
            偏好加载失败，点击重试
          </View>
        ) : null}

        <Text className="field-label mt-xs">愿意接收的风格（不选 = 不限）</Text>
        <View className="st-chips">
          {STYLE_TAGS.map((t) => (
            <Text key={t} className={`st-chip ${stylePreferences.includes(t) ? 'is-active' : ''}`} onClick={() => toggleStyle(t)}>
              {t}
            </Text>
          ))}
        </View>

        <Text className="field-label mt-xs">愿意接收的价格带（不选 = 不限）</Text>
        <View className="st-chips">
          {PRICE_BANDS.map((b) => (
            <Text key={b} className={`st-chip ${priceBandPreferences.includes(b) ? 'is-active' : ''}`} onClick={() => toggleBand(b)}>
              {b}
            </Text>
          ))}
        </View>

        <Picker mode="selector" range={DAILY_LIMITS.map((n) => String(n))} onChange={(e) => setDailyLimit(DAILY_LIMITS[Number(e.detail.value)] ?? 10)}>
          <View className="st-row">
            <Text className="st-row__key">每日最多接收条数</Text>
            <Text className="st-row__val">{dailyLimit === 0 ? '不接收' : `${dailyLimit} 条`} ›</Text>
          </View>
        </Picker>

        <Text className="field-label mt-xs">厂家黑名单（输入厂家用户 ID 添加）</Text>
        <View className="st-black">
          <Input className="st-black__input" type="number" value={blackInput} placeholder="厂家用户 ID" onInput={(e) => setBlackInput(e.detail.value)} />
          <View className="st-black__btn" onClick={addBlack}>
            <Text>添加</Text>
          </View>
        </View>
        <View className="st-chips mt-xs">
          {blacklist.length === 0 ? <Text className="f-xs t3">暂无黑名单</Text> : null}
          {blacklist.map((id) => (
            <Text key={id} className="st-black__tag" onClick={() => setBlacklist((prev) => prev.filter((x) => x !== id))}>
              厂家 #{id} ✕
            </Text>
          ))}
        </View>

        <View className={`btn btn-primary btn-block mt-xs ${savePref.isPending ? 'btn-disabled' : ''}`} onClick={() => savePref.mutate()}>
          <Text>{savePref.isPending ? '保存中…' : '保存隐私设置'}</Text>
        </View>
      </View>

      <View className="card">
        <Text className="f-md bold">常用入口</Text>
        {[
          { key: 'collection', label: '我的收藏', path: '/pages/profile/collection' },
          { key: 'drafts', label: '草稿箱', path: '/pages/content/draft' },
          { key: 'manage', label: '内容管理', path: '/pages/content/content-manage' },
          { key: 'messages', label: '消息中心', path: '/pages/interaction/message-center' },
          { key: 'topics', label: '话题榜', path: '/pages/topic/index' },
        ].map((it) => (
          <View key={it.key} className="st-row" onClick={() => go(it.path)}>
            <Text className="st-row__key">{it.label}</Text>
            <Text className="st-row__val">›</Text>
          </View>
        ))}
      </View>

      <View className="card">
        <Text className="f-md bold">关于</Text>
        <View className="st-row">
          <Text className="st-row__key">版本</Text>
          <Text className="st-row__val">{health.data ? `v${health.data.version} · ${health.data.driver}` : '—'}</Text>
        </View>
        <View className="st-row">
          <Text className="st-row__key">接口状态</Text>
          <Text className="st-row__val">{health.isError ? '不可用' : health.data ? '正常' : '检测中…'}</Text>
        </View>
      </View>

      <View className="st-logout" onClick={confirmLogout}>
        <Text>{doLogout.isPending ? '退出中…' : '退出登录'}</Text>
      </View>
    </View>
  );
}
