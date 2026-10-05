import { useState } from 'react';
import { View, Text, Image, Input } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { LoginDto, User, UserRole } from '@wfb/shared-types';
import { api, TARO_ENV } from '@/services/request';
import { useAppStore } from '@/store/app';
import './index.scss';

const ROLE_META: Record<UserRole, { label: string; desc: string; icon: string }> = {
  shop_owner: { label: '店主人', desc: '找款式 / 找厂家 / 学方法论', icon: '🛍️' },
  manufacturer: { label: '厂家', desc: '发款 / 加微转化 / 数据看板', icon: '🏭' },
  landmark: { label: '地标大店', desc: '大店主页 / 游学方法论输出', icon: '🏬' },
  lecturer: { label: '讲师', desc: '课程与游学蒸馏资料', icon: '🎓' },
  admin: { label: '平台运营', desc: '审核队列 / 认证审批 / 看板', icon: '🛡️' },
};

const ROLE_ORDER: UserRole[] = ['shop_owner', 'manufacturer', 'landmark', 'lecturer', 'admin'];

function platformOf(): NonNullable<LoginDto['platform']> {
  if (TARO_ENV === 'weapp' || TARO_ENV === 'tt' || TARO_ENV === 'alipay' || TARO_ENV === 'h5') return TARO_ENV;
  return 'app';
}

export default function Login() {
  const setAuth = useAppStore((s) => s.setAuth);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);

  const demos = useQuery({ queryKey: ['demo-accounts'], queryFn: () => api.auth.demoAccounts() });

  const login = useMutation({
    mutationFn: (dto: LoginDto) => api.auth.login(dto),
    onSuccess: (res) => {
      setAuth(res.token, res.user);
      Taro.showToast({ title: res.isNew ? '欢迎加入，请先完善资料' : `欢迎回来，${res.user.nickname}`, icon: 'success' });
      setTimeout(() => {
        Taro.reLaunch({ url: res.isNew ? '/pages/profile/edit' : '/pages/index/index' }).catch(() => undefined);
      }, 700);
    },
    onError: (e: Error) => Taro.showToast({ title: e.message || '登录失败', icon: 'none' }),
  });

  const accounts: User[] = demos.data ?? [];
  const sorted = [...accounts].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));

  const sendCode = () => {
    if (!/^1\d{10}$/.test(phone)) {
      Taro.showToast({ title: '请输入 11 位手机号', icon: 'none' });
      return;
    }
    setSent(true);
    Taro.showToast({ title: '验证码已发送（Demo 任意 6 位）', icon: 'none' });
  };

  const phoneLogin = () => {
    if (!/^1\d{10}$/.test(phone)) {
      Taro.showToast({ title: '请输入 11 位手机号', icon: 'none' });
      return;
    }
    if (!/^\d{4,6}$/.test(code)) {
      Taro.showToast({ title: '请输入 4-6 位验证码', icon: 'none' });
      return;
    }
    login.mutate({ phone, code, platform: platformOf() });
  };

  return (
    <View className="page">
      <View className="lg-hero">
        <View className="lg-hero__logo">
          <Text className="lg-hero__logo-text">WF</Text>
        </View>
        <Text className="lg-hero__title">女装 B2B 行业平台</Text>
        <Text className="lg-hero__sub">认知基础设施 · 连接引擎 · 效率工具</Text>
      </View>

      <View className="card">
        <View className="row-between">
          <Text className="f-md bold">演示账号一键登录</Text>
          {demos.isFetching ? <Text className="f-xs t3">加载中…</Text> : null}
        </View>
        <Text className="f-xs t3">覆盖 5 个角色，直接体验各端差异（无需真实手机号）</Text>

        {demos.isLoading ? <View className="loading">账号加载中…</View> : null}

        {demos.isError ? (
          <View className="card-flat" onClick={() => demos.refetch()}>
            <Text className="f-sm t2">演示账号加载失败（{(demos.error as Error)?.message ?? 'API 未启动'}）</Text>
            <Text className="f-sm brand">点击重试</Text>
          </View>
        ) : null}

        {!demos.isLoading && !demos.isError && sorted.length === 0 ? <View className="empty">暂无演示账号</View> : null}

        {sorted.map((u) => {
          const meta = ROLE_META[u.role];
          return (
            <View key={u.id} className="lg-role">
              <Image className="lg-role__avatar" src={u.avatarUrl} mode="aspectFill" />
              <View className="flex-1">
                <Text className="lg-role__name">
                  {u.nickname} · {meta?.label ?? u.role}
                </Text>
                <Text className="lg-role__desc">{meta?.desc ?? '体验账号'}</Text>
              </View>
              <Text className={`lg-role__btn ${login.isPending ? 'btn-disabled' : ''}`} onClick={() => login.mutate({ demoUserId: u.id })}>
                一键登录
              </Text>
            </View>
          );
        })}
      </View>

      <View className="card">
        <Text className="f-md bold">手机号验证码登录</Text>
        <View className="field mt-xs">
          <Text className="field-label">手机号</Text>
          <Input className="input" type="number" maxlength={11} value={phone} placeholder="请输入手机号" onInput={(e) => setPhone(e.detail.value)} />
        </View>
        <View className="field">
          <Text className="field-label">验证码</Text>
          <View className="lg-code-row">
            <Input className="lg-code-input" type="number" maxlength={6} value={code} placeholder="4-6 位数字" onInput={(e) => setCode(e.detail.value)} />
            <View className="lg-code-btn" onClick={sendCode}>
              <Text>{sent ? '重新发送' : '获取验证码'}</Text>
            </View>
          </View>
        </View>
        <View className={`btn btn-primary btn-block ${login.isPending ? 'btn-disabled' : ''}`} onClick={phoneLogin}>
          <Text>{login.isPending ? '登录中…' : '登录 / 注册'}</Text>
        </View>
        <Text className="lg-agreement">
          登录即代表同意《用户协议》与《隐私政策》；Demo 环境不会发送真实短信，验证码任意 4-6 位数字即可。
        </Text>
      </View>

      <View className="card" onClick={() => Taro.navigateTo({ url: '/pages/auth/certify' }).catch(() => undefined)}>
        <View className="row-between">
          <View>
            <Text className="f-md bold">企业认证</Text>
            <Text className="f-xs t3">营业执照 OCR → 身份证 → 人脸核验 → 对公打款</Text>
          </View>
          <Text className="brand f-sm">去认证 ›</Text>
        </View>
      </View>
    </View>
  );
}
