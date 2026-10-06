import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Input, Picker, Image } from '@tarojs/components';
import type { CommonEvent, ITouchEvent } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { BuyerPreference, CertifyDto, CertifyResult, ContentInterest, LearnTarget, ManufacturerNeed, SourcingNeed } from '@wfb/shared-types';
import {
  CONTENT_INTERESTS,
  CONTENT_INTEREST_LABELS,
  LEARN_TARGETS,
  LEARN_TARGET_LABELS,
  MANUFACTURER_NEEDS,
  MANUFACTURER_NEED_LABELS,
  SOURCING_NEEDS,
  SOURCING_NEED_LABELS,
} from '@wfb/shared-types';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import Badge from '@/components/Badge';
import { errMsg } from '@/components/utils';
import './index.scss';

/**
 * 登录后的引导式认证流程（用户原话）：
 *   「输出名字、开店城市、店名 → 上传营业执照 → 滑块验证 → 选想跟谁学 / 想看什么 / 想要什么货源 / 想要什么厂家」
 *
 * 四步：
 *   1 基础信息（真实表单 + 必填校验）
 *   2 营业执照（Taro.chooseImage → 提交后端 → 展示后端返回的 OCR 结果，前端不编造）
 *   3 滑块验证（自研，View + touch 事件，跨端可用）
 *   4 偏好画像（四组多选 → api.auth.submitPreference）
 */

type CertifyRole = CertifyDto['role'];

const STEPS = [
  { key: 'base', title: '基础信息', desc: '名字 / 开店城市 / 店名' },
  { key: 'license', title: '营业执照', desc: '上传执照，后端 OCR 识别' },
  { key: 'verify', title: '滑块验证', desc: '确认是本人操作' },
  { key: 'preference', title: '你的偏好', desc: '想跟谁学 · 想看什么 · 想要什么' },
];

const ROLES: { key: CertifyRole; label: string }[] = [
  { key: 'shop_owner', label: '店主人' },
  { key: 'manufacturer', label: '厂家' },
  { key: 'landmark', label: '地标大店' },
  { key: 'lecturer', label: '讲师' },
];

/** 开店城市（MARKETS 是拿货地/产业带，这里是城市字典） */
const CITIES = ['杭州', '广州', '深圳', '郑州', '成都', '西安', '北京', '上海', '武汉', '重庆', '南京', '长沙', '青岛', '沈阳', '东莞', '佛山', '苏州', '义乌'];

/** OCR 字段中文映射；后端新增字段时原样展示 key，不编造 */
const OCR_LABELS: Record<string, string> = {
  companyName: '企业名称',
  name: '企业名称',
  legalPerson: '法定代表人',
  legalName: '法定代表人',
  creditCode: '统一社会信用代码',
  regNumber: '注册号',
  registrationNumber: '注册号',
  address: '注册地址',
  validUntil: '营业期限',
  validPeriod: '营业期限',
  businessScope: '经营范围',
  entityType: '主体类型',
  type: '主体类型',
  capital: '注册资本',
  registeredCapital: '注册资本',
};

/**
 * Demo 未接入对象存储：后端只接受可访问的图片地址（http(s):// 或 /uploads/），
 * 而 chooseImage 给的是本地临时路径。这里对不合规的路径回落到 API 自带的占位图，
 * 保证「上传成功」这一步在 Demo 里能真实走通；接入 OSS 后把这里换成真实上传即可。
 */
function resolveLicenseUrl(tempPath: string, seed: string): string {
  if (/^(https?:\/\/|\/uploads\/)/.test(tempPath)) return tempPath;
  const label = encodeURIComponent('营业执照');
  return `/uploads/demo/img.svg?ratio=landscape&w=900&h=600&label=${label}&seed=${encodeURIComponent(seed)}`;
}

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/* ============================ 滑块验证（自研） ============================
 * 跨端约束：只用 View + Taro 的 touch 事件，不碰 DOM / window。
 * 拖动比例 = 手指位移 / 可移动距离，位移距离通过 createSelectorQuery 量取（量不到就用兜底宽度）。
 * PC 端（无 touch）兜底：点击轨道右半侧视为拖到底，保证桌面演示也能走完流程。
 * ======================================================================== */

const FALLBACK_TRACK = 260; // 真实 px，仅量取失败时使用
const FALLBACK_THUMB = 56;

/** View 的 touch 事件在 Taro 类型里声明为 CommonEventFunction，这里安全地取出触点坐标 */
function touchClientX(e: CommonEvent): number {
  const touches = (e as unknown as { touches?: { clientX?: number }[] }).touches;
  return Number(touches?.[0]?.clientX ?? NaN);
}

/** 点击事件的 detail.x（H5 为 clientX；小程序为页面坐标），取不到返回 NaN */
function eventX(e: CommonEvent): number {
  const detail = (e as unknown as { detail?: { x?: number } }).detail;
  return Number(detail?.x ?? NaN);
}

function SliderVerify({ onSuccess, text }: { onSuccess: () => void; text?: string }) {
  const [ratio, setRatio] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [passed, setPassed] = useState(false);
  const [geo, setGeo] = useState({ track: 0, thumb: 0, left: 0 });
  const geoRef = useRef(geo);
  const startX = useRef(0);
  const startRatio = useRef(0);

  const measure = useCallback(() => {
    try {
      Taro.createSelectorQuery()
        .select('.verify__track')
        .boundingClientRect()
        .select('.verify__thumb')
        .boundingClientRect()
        .exec((res) => {
          const track = res?.[0] as { width?: number; left?: number } | undefined;
          const thumb = res?.[1] as { width?: number } | undefined;
          const trackW = Number(track?.width ?? 0);
          const thumbW = Number(thumb?.width ?? 0);
          if (trackW > 0) {
            const next = { track: trackW, thumb: thumbW > 0 ? thumbW : FALLBACK_THUMB, left: Number(track?.left ?? 0) };
            geoRef.current = next;
            setGeo(next);
          }
        });
    } catch {
      /* 量取失败时用兜底宽度，比例算法依然可用 */
    }
  }, []);

  useEffect(() => {
    measure();
  }, [measure]);

  /** 可移动距离（真实 px） */
  const travelOf = () => {
    const { track, thumb } = geoRef.current;
    const t = track > 0 ? track : FALLBACK_TRACK;
    const h = thumb > 0 ? thumb : FALLBACK_THUMB;
    return Math.max(1, t - h);
  };

  /** 渲染用：位移百分比（translateX 的百分比相对自身宽度） */
  const travelPct = (() => {
    const { thumb } = geoRef.current;
    const h = thumb > 0 ? thumb : FALLBACK_THUMB;
    return (travelOf() / h) * 100;
  })();

  const complete = useCallback(() => {
    setPassed(true);
    setRatio(1);
    setDragging(false);
    onSuccess();
  }, [onSuccess]);

  const onTouchStart = (e: CommonEvent) => {
    if (passed) return;
    measure();
    startX.current = touchClientX(e);
    startRatio.current = ratio;
    setDragging(true);
  };

  const onTouchMove = (e: CommonEvent) => {
    if (passed) return;
    const cx = touchClientX(e);
    if (!Number.isFinite(cx) || !Number.isFinite(startX.current)) return;
    const next = clamp01(startRatio.current + (cx - startX.current) / travelOf());
    setRatio(next);
    if (next >= 0.995) complete();
  };

  const onTouchEnd = () => {
    setDragging(false);
    if (!passed) setRatio(0);
  };

  /** PC / 鼠标环境兜底：点击轨道（优先右半侧）完成验证 */
  const onTrackClick = (e: ITouchEvent) => {
    if (passed) return;
    const { track, thumb, left } = geoRef.current;
    const x = eventX(e as unknown as CommonEvent);
    if (Number.isFinite(x) && track > 0 && left > 0) {
      const next = clamp01((x - left - thumb / 2) / travelOf());
      if (next >= 0.5) {
        complete();
        return;
      }
      setRatio(next);
      return;
    }
    complete();
  };

  const fillWidth = `${(ratio * 100).toFixed(2)}%`;

  return (
    <View className="verify">
      <View className="verify__track" onClick={onTrackClick}>
        <View className="verify__fill" style={{ width: fillWidth }}>
          <Text className="verify__fill-text">{passed ? '验证通过' : dragging ? '松手前拖到最右' : ''}</Text>
        </View>
        <View
          className={`verify__thumb ${passed ? 'is-passed' : ''} ${dragging ? 'is-dragging' : ''}`}
          style={{ transform: `translateX(${(ratio * travelPct).toFixed(2)}%)` }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <Text className="verify__thumb-text">{passed ? '✓' : '→'}</Text>
        </View>
        <Text className="verify__text">{passed ? '验证通过' : text ?? '按住滑块，拖到最右侧解锁'}</Text>
      </View>
      <Text className="verify__tip">移动端拖动滑块；PC / 鼠标环境可点击轨道右半侧解锁。此验证用于证明是本人操作，不代表资质审核结果。</Text>
    </View>
  );
}

/* ================================ 页面 ================================ */

export default function Onboarding() {
  const token = useAppStore((s) => s.token);
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);

  const [step, setStep] = useState(0);

  /* 1 基础信息 */
  const [role, setRole] = useState<CertifyRole>(user?.role === 'manufacturer' || user?.role === 'landmark' || user?.role === 'lecturer' ? user.role : 'shop_owner');
  const [legalName, setLegalName] = useState('');
  const [cityIndex, setCityIndex] = useState(-1);
  const [shopName, setShopName] = useState(user?.companyName ?? '');

  /* 2 营业执照 */
  const [licenseLocal, setLicenseLocal] = useState('');
  const [licenseUrl, setLicenseUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [certifying, setCertifying] = useState(false);
  const [certResult, setCertResult] = useState<CertifyResult | null>(null);

  /* 3 滑块 */
  const [verified, setVerified] = useState(false);

  /* 4 偏好 */
  const [learnFrom, setLearnFrom] = useState<LearnTarget[]>([]);
  const [contentInterests, setContentInterests] = useState<ContentInterest[]>([]);
  const [sourcingNeeds, setSourcingNeeds] = useState<SourcingNeed[]>([]);
  const [manufacturerNeeds, setManufacturerNeeds] = useState<ManufacturerNeed[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [skipPref, setSkipPref] = useState(false);
  const [prefError, setPrefError] = useState('');
  const [done, setDone] = useState(false);

  const city = cityIndex >= 0 ? CITIES[cityIndex] : '';
  const baseReady = !!legalName.trim() && !!city && !!shopName.trim();
  const ocrEntries = Object.entries(certResult?.ocrData ?? {}).filter(([, v]) => v !== null && v !== undefined && String(v) !== '');

  /* ------------------------------ 步骤 1：基础信息 ------------------------------ */
  const gotoLicense = () => {
    if (!legalName.trim()) {
      Taro.showToast({ title: '请填写你的名字', icon: 'none' });
      return;
    }
    if (!city) {
      Taro.showToast({ title: '请选择开店城市', icon: 'none' });
      return;
    }
    if (!shopName.trim()) {
      Taro.showToast({ title: '请填写店名', icon: 'none' });
      return;
    }
    setStep(1);
  };

  /* ------------------------------ 步骤 2：营业执照 ------------------------------ */
  const chooseLicense = async () => {
    try {
      setUploading(true);
      const res = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
      const temp = res.tempFilePaths?.[0] ?? '';
      if (!temp) {
        setUploading(false);
        return;
      }
      setLicenseLocal(temp);
      setLicenseUrl(resolveLicenseUrl(temp, `${shopName}-${legalName}`));
      setUploading(false);
      Taro.showToast({ title: '营业执照已选择', icon: 'none' });
    } catch {
      setUploading(false);
      Taro.showToast({ title: '已取消选择', icon: 'none' });
    }
  };

  /** 提交认证：成功后展示后端返回的 OCR 结果与认证进度 */
  const submitCertify = async () => {
    if (!licenseUrl) {
      Taro.showToast({ title: '请先上传营业执照', icon: 'none' });
      return;
    }
    if (!token) {
      Taro.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    setCertifying(true);
    try {
      const dto: CertifyDto = {
        role,
        companyName: shopName.trim(),
        licenseUrl,
        legalName: legalName.trim() || undefined,
        sourcingCities: city ? [city] : undefined,
      };
      const res = await api.auth.certify(dto);
      setCertResult(res);
      if (res.certStatus === 'approved' && user) setUser({ ...user, certStatus: 'approved', companyName: shopName.trim() });
      Taro.showToast({ title: `认证进度 ${res.progress}%`, icon: 'none' });
    } catch (e) {
      Taro.showToast({ title: errMsg(e, '认证提交失败'), icon: 'none' });
    } finally {
      setCertifying(false);
    }
  };

  /* ------------------------------ 步骤 4：偏好提交 ------------------------------ */
  const submitPreference = async (skip: boolean) => {
    const missing = !learnFrom.length
      ? '想跟什么样的人学习'
      : !contentInterests.length
        ? '想看什么内容'
        : !sourcingNeeds.length
          ? '想要什么货源'
          : !manufacturerNeeds.length
            ? '想要什么类型的厂家'
            : '';
    if (!skip && missing) {
      Taro.showToast({ title: `请至少选一项：${missing}`, icon: 'none' });
      return;
    }

    if (skip) {
      setSkipPref(true);
      setDone(true);
      return;
    }

    setSubmitting(true);
    setPrefError('');
    try {
      const payload: BuyerPreference = { learnFrom, contentInterests, sourcingNeeds, manufacturerNeeds };
      await api.auth.submitPreference(payload);
      setDone(true);
    } catch (e) {
      /* 后端未就绪时如实提示，不伪造成功 */
      setPrefError(errMsg(e, '偏好提交失败'));
      Taro.showToast({ title: '偏好提交失败，可稍后再填', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  /* ------------------------------ 完成页 ------------------------------ */
  if (done) {
    const previewStatus = certResult?.certStatus === 'approved' ? 'approved' : certResult ? 'pending' : 'none';
    return (
      <View className="page ob">
        <View className="card ob__done">
          <Text className="ob__done-icon">🎉</Text>
          <Text className="ob__done-title bold">引导完成</Text>
          <Text className="ob__done-desc f-sm t2">
            {skipPref ? '偏好已跳过，可稍后在「我的 → 编辑资料」补充。' : prefError ? `偏好未提交：${prefError}` : '偏好已提交，用于冷启动推荐与厂家匹配。'}
          </Text>

          <View className="ob__badge-preview">
            <Text className="f-xs t3">你的身份标识（认证通过后展示在昵称旁）</Text>
            <View className="row ob__badge-row">
              <Text className="f-sm t1 ob__badge-name">{shopName || user?.nickname || '我'}</Text>
              <Badge user={{ role, certStatus: previewStatus, memberLevel: user?.memberLevel }} max={2} size="sm" />
            </View>
          </View>

          {certResult ? (
            <View className="ob__done-meta">
              <Text className="f-xs t3">认证状态：{certResult.certStatus} · 进度 {certResult.progress}%</Text>
            </View>
          ) : null}

          <View className="ob__actions">
            <View className="btn btn-primary btn-block" onClick={() => Taro.reLaunch({ url: '/pages/index/index' })}>
              <Text>进入资讯首页</Text>
            </View>
            <View className="btn btn-plain btn-block ob__actions-second" onClick={() => Taro.reLaunch({ url: '/pages/source/index' })}>
              <Text>去挑货源</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  /* ------------------------------ 主流程 ------------------------------ */
  return (
    <View className="page ob">
      {/* 步骤条 */}
      <View className="card ob__steps">
        {STEPS.map((s, i) => (
          <View key={s.key} className={`ob__step ${i === step ? 'is-active' : ''} ${i < step ? 'is-done' : ''}`} onClick={() => (i < step ? setStep(i) : undefined)}>
            <View className={`ob__step-dot ${i < step ? 'is-done' : ''} ${i === step ? 'is-active' : ''}`}>
              <Text className="ob__step-dot-text">{i < step ? '✓' : i + 1}</Text>
            </View>
            <Text className="ob__step-title">{s.title}</Text>
          </View>
        ))}
      </View>

      {!token ? (
        <View className="card">
          <Text className="f-sm t2">该引导需要登录后进行（认证与偏好都会写到你的账号）。</Text>
          <View className="btn btn-primary btn-block ob__mt" onClick={() => Taro.navigateTo({ url: '/pages/auth/login' })}>
            <Text>先去登录</Text>
          </View>
        </View>
      ) : null}

      <View className="ob__head">
        <Text className="ob__head-title bold t1">
          第 {step + 1} 步 · {STEPS[step].title}
        </Text>
        <Text className="ob__head-desc f-xs t3">{STEPS[step].desc}</Text>
      </View>

      {/* 第 1 步：基础信息 */}
      {step === 0 ? (
        <View className="card">
          <Text className="field-label">身份</Text>
          <View className="row wrap">
            {ROLES.map((r) => (
              <View key={r.key} className={`ob__chip ${role === r.key ? 'is-active' : ''}`} onClick={() => setRole(r.key)}>
                <Text className="ob__chip-text">{r.label}</Text>
              </View>
            ))}
          </View>

          <View className="field">
            <Text className="field-label">你的名字（必填）</Text>
            <Input className="input" value={legalName} placeholder="与营业执照法定代表人一致" onInput={(e) => setLegalName(e.detail.value)} />
          </View>

          <View className="field">
            <Text className="field-label">开店城市（必填）</Text>
            <Picker mode="selector" range={CITIES} value={cityIndex < 0 ? 0 : cityIndex} onChange={(e) => setCityIndex(Number(e.detail.value))}>
              <View className="ob__picker">
                <Text className={city ? 't1' : 't3'}>{city || '请选择城市'}</Text>
                <Text className="t3 f-xs">▾</Text>
              </View>
            </Picker>
          </View>

          <View className="field">
            <Text className="field-label">店名（必填）</Text>
            <Input className="input" value={shopName} placeholder="例如 杭州·小满家" onInput={(e) => setShopName(e.detail.value)} />
          </View>

          <View className={`btn btn-primary btn-block ob__mt ${baseReady ? '' : 'btn-disabled'}`} onClick={gotoLicense}>
            <Text>下一步：上传营业执照</Text>
          </View>
        </View>
      ) : null}

      {/* 第 2 步：营业执照 */}
      {step === 1 ? (
        <View className="card">
          <Text className="f-sm t2">
            提交信息：{legalName || '—'} · {city || '—'} · {shopName || '—'}
          </Text>
          <Text className="f-xs t3 ob__note">
            Demo 环境未接入对象存储：本地选图后提交给后端的是平台占位图地址，营业执照真伪不做校验；OCR 结果由后端返回，前端不编造。
          </Text>

          {licenseLocal ? (
            <View className="ob__license">
              <Image className="ob__license-img" src={licenseLocal} mode="aspectFit" onClick={chooseLicense} />
              <Text className="f-xs t3 ob__license-tip" onClick={chooseLicense}>
                已选择营业执照 · 点击可重新选择
              </Text>
            </View>
          ) : (
            <View className="ob__upload" onClick={chooseLicense}>
              <Text className="ob__upload-plus">＋</Text>
              <Text className="ob__upload-tip">{uploading ? '选择中…' : '上传营业执照（相册 / 拍照）'}</Text>
            </View>
          )}

          <View className="ob__actions">
            <View className={`btn btn-primary btn-block ${!licenseUrl || certifying ? 'btn-disabled' : ''}`} onClick={submitCertify}>
              <Text>{certifying ? '提交中…' : certResult ? '重新提交认证' : '提交认证并识别'}</Text>
            </View>
          </View>

          <View className="ob__ocr">
            <Text className="f-md bold">OCR 识别结果（后端返回）</Text>
            {ocrEntries.length ? (
              ocrEntries.map(([k, v]) => (
                <View key={k} className="ob__ocr-row">
                  <Text className="ob__ocr-key">{OCR_LABELS[k] ?? k}</Text>
                  <Text className="ob__ocr-val">{String(v)}</Text>
                </View>
              ))
            ) : (
              <Text className="f-xs t3 ob__note">尚未获得 OCR 结果：提交后由后端识别并回传。</Text>
            )}
            {certResult ? (
              <Text className="f-xs t3 ob__note">
                认证状态 {certResult.certStatus} · 进度 {certResult.progress}%
              </Text>
            ) : null}
          </View>

          <View className="ob__nav row">
            <View className="btn btn-plain flex-1" onClick={() => setStep(0)}>
              <Text>上一步</Text>
            </View>
            <View className={`btn btn-primary flex-1 ob__nav-next ${certResult ? '' : 'btn-disabled'}`} onClick={() => (certResult ? setStep(2) : undefined)}>
              <Text>下一步：滑块验证</Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* 第 3 步：滑块验证 */}
      {step === 2 ? (
        <View className="card">
          <Text className="f-sm t2">拖动滑块完成验证，验证通过后才能提交偏好画像。</Text>
          <View className="ob__slider">
            <SliderVerify onSuccess={() => setVerified(true)} />
          </View>
          {verified ? <Text className="f-xs ob__ok">✓ 验证已通过</Text> : null}

          <View className="ob__nav row">
            <View className="btn btn-plain flex-1" onClick={() => setStep(1)}>
              <Text>上一步</Text>
            </View>
            <View className={`btn btn-primary flex-1 ob__nav-next ${verified ? '' : 'btn-disabled'}`} onClick={() => (verified ? setStep(3) : undefined)}>
              <Text>下一步：选偏好</Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* 第 4 步：偏好四选 */}
      {step === 3 ? (
        <View>
          <View className="card">
            <Text className="f-md bold t1">想跟什么样的人学习？</Text>
            <View className="row wrap ob__chips">
              {LEARN_TARGETS.map((k) => (
                <View key={k} className={`ob__chip ${learnFrom.includes(k) ? 'is-active' : ''}`} onClick={() => setLearnFrom((prev) => toggleIn(prev, k))}>
                  <Text className="ob__chip-text">{LEARN_TARGET_LABELS[k]}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="card">
            <Text className="f-md bold t1">想看什么内容？</Text>
            <View className="row wrap ob__chips">
              {CONTENT_INTERESTS.map((k) => (
                <View key={k} className={`ob__chip ${contentInterests.includes(k) ? 'is-active' : ''}`} onClick={() => setContentInterests((prev) => toggleIn(prev, k))}>
                  <Text className="ob__chip-text">{CONTENT_INTEREST_LABELS[k]}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="card">
            <Text className="f-md bold t1">想要什么样的货源？</Text>
            <View className="row wrap ob__chips">
              {SOURCING_NEEDS.map((k) => (
                <View key={k} className={`ob__chip ${sourcingNeeds.includes(k) ? 'is-active' : ''}`} onClick={() => setSourcingNeeds((prev) => toggleIn(prev, k))}>
                  <Text className="ob__chip-text">{SOURCING_NEED_LABELS[k]}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="card">
            <Text className="f-md bold t1">想要什么样的厂家？</Text>
            <View className="row wrap ob__chips">
              {MANUFACTURER_NEEDS.map((k) => (
                <View key={k} className={`ob__chip ${manufacturerNeeds.includes(k) ? 'is-active' : ''}`} onClick={() => setManufacturerNeeds((prev) => toggleIn(prev, k))}>
                  <Text className="ob__chip-text">{MANUFACTURER_NEED_LABELS[k]}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="card">
            <Text className="f-xs t3">
              已选：学习 {learnFrom.length} · 内容 {contentInterests.length} · 货源 {sourcingNeeds.length} · 厂家 {manufacturerNeeds.length}
            </Text>
            {prefError ? <Text className="f-xs ob__err">{prefError}</Text> : null}
            <View className="ob__actions">
              <View className={`btn btn-primary btn-block ${submitting ? 'btn-disabled' : ''}`} onClick={() => submitPreference(false)}>
                <Text>{submitting ? '提交中…' : '完成引导'}</Text>
              </View>
              <Text className="ob__skip f-xs t3" onClick={() => submitPreference(true)}>
                稍后再填
              </Text>
            </View>
            <View className="ob__nav row">
              <View className="btn btn-plain flex-1" onClick={() => setStep(2)}>
                <Text>上一步</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
