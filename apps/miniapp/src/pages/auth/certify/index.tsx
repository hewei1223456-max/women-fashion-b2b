import { useEffect, useState } from 'react';
import { View, Text, Image, Input } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { CertifyDto, CertifyResult, StyleTag } from '@wfb/shared-types';
import { STYLE_TAGS } from '@wfb/shared-types';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import './index.scss';

type CertifyRole = CertifyDto['role'];

const ROLES: { key: CertifyRole; label: string }[] = [
  { key: 'shop_owner', label: '店主人' },
  { key: 'manufacturer', label: '厂家' },
  { key: 'landmark', label: '地标大店' },
  { key: 'lecturer', label: '讲师' },
];

const CERT_LABELS: Record<string, string> = {
  none: '未提交认证',
  pending: '审核中',
  approved: '已认证',
  rejected: '认证未通过',
};

/** OCR 字段中文映射；未覆盖的字段原样展示后端返回的 key */
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

const LOCAL_STEPS = [
  { key: 'license', label: '营业执照上传 + OCR 识别' },
  { key: 'idcard', label: '法人身份证核验' },
  { key: 'face', label: '人脸核验' },
  { key: 'bank', label: '对公打款验证' },
];

function upload(label: string): Promise<string> {
  return Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] }).then((res) => {
    const url = res.tempFilePaths[0] ?? '';
    if (url) Taro.showToast({ title: `${label}已选择`, icon: 'none' });
    return url;
  });
}

export default function Certify() {
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);

  const [role, setRole] = useState<CertifyRole>(user?.role === 'manufacturer' || user?.role === 'landmark' || user?.role === 'lecturer' ? user.role : 'shop_owner');
  const [companyName, setCompanyName] = useState(user?.companyName ?? '');
  const [licenseUrl, setLicenseUrl] = useState(user?.certLicenseUrl ?? '');
  const [legalName, setLegalName] = useState('');
  const [idFront, setIdFront] = useState('');
  const [idBack, setIdBack] = useState('');
  const [styleTags, setStyleTags] = useState<StyleTag[]>(user?.styleTags ?? []);
  const [bankAmount, setBankAmount] = useState('');
  const [result, setResult] = useState<CertifyResult | null>(null);
  const [synced, setSynced] = useState(false);

  const status = useQuery({ queryKey: ['cert-status'], queryFn: () => api.auth.certStatus() });

  useEffect(() => {
    if (synced || !status.data) return;
    setResult(status.data);
    setSynced(true);
  }, [status.data, synced]);

  const certify = useMutation({
    mutationFn: (dto: CertifyDto) => api.auth.certify(dto),
    onSuccess: (res) => {
      setResult(res);
      Taro.showToast({ title: `认证进度已更新至 ${res.progress}%`, icon: 'none' });
      if (res.certStatus === 'approved' && user) setUser({ ...user, certStatus: 'approved' });
    },
    onError: (e: Error) => Taro.showToast({ title: e.message || '提交失败', icon: 'none' }),
  });

  const baseDto = (): CertifyDto => ({
    role,
    companyName: companyName.trim(),
    licenseUrl,
    legalName: legalName.trim() || undefined,
    idCardFrontUrl: idFront || undefined,
    idCardBackUrl: idBack || undefined,
    styleTags,
  });

  const submitLicense = () => {
    if (!companyName.trim()) {
      Taro.showToast({ title: '请填写企业/店铺名称', icon: 'none' });
      return;
    }
    if (!licenseUrl) {
      Taro.showToast({ title: '请上传营业执照', icon: 'none' });
      return;
    }
    certify.mutate(baseDto());
  };

  const submitIdCard = () => {
    if (!legalName.trim()) {
      Taro.showToast({ title: '请填写法人姓名', icon: 'none' });
      return;
    }
    if (!idFront || !idBack) {
      Taro.showToast({ title: '请上传身份证正反面', icon: 'none' });
      return;
    }
    certify.mutate(baseDto());
  };

  const submitFace = () => {
    if (!licenseUrl || !companyName.trim()) {
      Taro.showToast({ title: '请先完成第 1 步', icon: 'none' });
      return;
    }
    certify.mutate(baseDto());
  };

  const submitBank = () => {
    const amount = Number(bankAmount);
    if (!amount || amount <= 0 || amount > 0.1) {
      Taro.showToast({ title: '打款金额需在 0.01-0.1 元之间', icon: 'none' });
      return;
    }
    certify.mutate({ ...baseDto(), bankAmount: amount });
  };

  const progress = result?.progress ?? 0;
  const certStatus = result?.certStatus ?? 'none';
  const badgeClass =
    certStatus === 'approved' ? 'is-ok' : certStatus === 'rejected' ? 'is-bad' : certStatus === 'pending' ? 'is-pending' : '';

  const steps = result?.steps?.length
    ? result.steps
    : LOCAL_STEPS.map((s) => ({ ...s, done: false as boolean, detail: undefined as string | undefined }));

  const ocrEntries = Object.entries(result?.ocrData ?? {}).filter(([, v]) => v !== null && v !== undefined && String(v) !== '');

  return (
    <View className="page">
      <View className="card">
        <View className="cf-status">
          <Text className="cf-status__label">认证状态</Text>
          <Text className={`cf-status__badge ${badgeClass}`}>{CERT_LABELS[certStatus] ?? certStatus}</Text>
        </View>
        <View className="cf-progress">
          <View className="cf-progress__fill" style={{ width: `${Math.min(100, Math.max(2, progress))}%` }} />
        </View>
        <Text className="f-xs t3">当前进度 {progress}%（四步全部完成后进入人工审批）</Text>

        <View className="divider" />

        {steps.map((s, idx) => (
          <View key={s.key} className="cf-step">
            <View className={`cf-step__idx ${s.done ? 'is-done' : ''}`}>
              <Text>{s.done ? '✓' : idx + 1}</Text>
            </View>
            <View className="flex-1">
              <Text className="cf-step__label">{s.label}</Text>
              {s.detail ? <Text className="cf-step__detail">{s.detail}</Text> : null}
            </View>
            <Text className="cf-step__state">{s.done ? '已完成' : '待完成'}</Text>
          </View>
        ))}
      </View>

      {/* 第 1 步：营业执照 + OCR */}
      <View className="card">
        <View className="cf-sec-title">
          <View className="cf-sec-title__no">
            <Text>1</Text>
          </View>
          <Text className="cf-sec-title__text">营业执照上传 + OCR</Text>
        </View>

        <Text className="field-label">认证主体类型</Text>
        <View className="cf-chips">
          {ROLES.map((r) => (
            <Text key={r.key} className={`cf-chip ${role === r.key ? 'is-active' : ''}`} onClick={() => setRole(r.key)}>
              {r.label}
            </Text>
          ))}
        </View>

        <View className="field">
          <Text className="field-label">企业 / 店铺名称</Text>
          <Input
            className="input"
            value={companyName}
            placeholder="与营业执照一致"
            onInput={(e) => setCompanyName(e.detail.value)}
          />
        </View>

        <Text className="field-label">营业执照照片</Text>
        {licenseUrl ? (
          <Image className="cf-upload__img" src={licenseUrl} mode="aspectFill" onClick={() => upload('营业执照').then(setLicenseUrl).catch(() => undefined)} />
        ) : (
          <View className="cf-upload" onClick={() => upload('营业执照').then(setLicenseUrl).catch(() => undefined)}>
            <Text className="cf-upload__plus">＋</Text>
            <Text className="cf-upload__tip">上传营业执照（后端将做 OCR 识别）</Text>
          </View>
        )}

        <View className="cf-ocr">
          <Text className="f-md bold">OCR 识别结果</Text>
          {ocrEntries.length === 0 ? (
            <Text className="cf-ocr__empty">尚未获得 OCR 结果：提交后由后端识别并回传（前端不编造数据）</Text>
          ) : (
            ocrEntries.map(([k, v]) => (
              <View key={k} className="cf-ocr__row">
                <Text className="cf-ocr__key">{OCR_LABELS[k] ?? k}</Text>
                <Text className="cf-ocr__val">{String(v)}</Text>
              </View>
            ))
          )}
        </View>

        <View className="cf-actions">
          <View className={`cf-btn cf-btn--primary ${certify.isPending ? 'is-disabled' : ''}`} onClick={submitLicense}>
            <Text>{certify.isPending ? '提交中…' : '提交并识别'}</Text>
          </View>
        </View>
      </View>

      {/* 第 2 步：身份证 */}
      <View className="card">
        <View className="cf-sec-title">
          <View className="cf-sec-title__no">
            <Text>2</Text>
          </View>
          <Text className="cf-sec-title__text">法人身份证</Text>
        </View>

        <View className="field">
          <Text className="field-label">法人姓名</Text>
          <Input className="input" value={legalName} placeholder="与身份证一致" onInput={(e) => setLegalName(e.detail.value)} />
        </View>

        <Text className="field-label">身份证正面（人像面）</Text>
        {idFront ? (
          <Image className="cf-upload__img" src={idFront} mode="aspectFill" />
        ) : (
          <View className="cf-upload" onClick={() => upload('身份证正面').then(setIdFront).catch(() => undefined)}>
            <Text className="cf-upload__plus">＋</Text>
            <Text className="cf-upload__tip">上传人像面</Text>
          </View>
        )}

        <Text className="field-label mt-xs">身份证反面（国徽面）</Text>
        {idBack ? (
          <Image className="cf-upload__img" src={idBack} mode="aspectFill" />
        ) : (
          <View className="cf-upload" onClick={() => upload('身份证反面').then(setIdBack).catch(() => undefined)}>
            <Text className="cf-upload__plus">＋</Text>
            <Text className="cf-upload__tip">上传国徽面</Text>
          </View>
        )}

        <View className="cf-actions">
          <View className={`cf-btn cf-btn--primary ${certify.isPending ? 'is-disabled' : ''}`} onClick={submitIdCard}>
            <Text>{certify.isPending ? '提交中…' : '提交身份证信息'}</Text>
          </View>
        </View>
      </View>

      {/* 第 3 步：人脸核验 */}
      <View className="card">
        <View className="cf-sec-title">
          <View className="cf-sec-title__no">
            <Text>3</Text>
          </View>
          <Text className="cf-sec-title__text">人脸核验</Text>
        </View>
        <Text className="f-sm t3">点击下方按钮发起核验，核验流水号由后端返回（对接公安/CFCA 后为真实值）。</Text>
        <View className="cf-ocr">
          <View className="cf-ocr__row">
            <Text className="cf-ocr__key">核验流水号</Text>
            <Text className="cf-ocr__val">{result?.faceVerifyId ?? '尚未发起（后端未返回）'}</Text>
          </View>
        </View>
        <View className="cf-actions">
          <View className={`cf-btn cf-btn--primary ${certify.isPending ? 'is-disabled' : ''}`} onClick={submitFace}>
            <Text>{certify.isPending ? '核验中…' : '开始人脸核验'}</Text>
          </View>
        </View>
      </View>

      {/* 第 4 步：对公打款 */}
      <View className="card">
        <View className="cf-sec-title">
          <View className="cf-sec-title__no">
            <Text>4</Text>
          </View>
          <Text className="cf-sec-title__text">对公打款验证</Text>
        </View>
        <Text className="f-sm t3">平台向你的对公账户打入随机金额（0.01-0.10 元），填写收到金额即完成验证。</Text>
        <View className="field mt-xs">
          <Text className="field-label">收到的打款金额（元）</Text>
          <Input className="input" type="digit" value={bankAmount} placeholder="如 0.07" onInput={(e) => setBankAmount(e.detail.value)} />
        </View>
        <View className="cf-ocr">
          <View className="cf-ocr__row">
            <Text className="cf-ocr__key">后台记录金额</Text>
            <Text className="cf-ocr__val">{result?.bankAmount !== undefined ? `${result.bankAmount} 元` : '尚未发起打款'}</Text>
          </View>
        </View>
        <View className="cf-actions">
          <View className={`cf-btn cf-btn--primary ${certify.isPending ? 'is-disabled' : ''}`} onClick={submitBank}>
            <Text>{certify.isPending ? '提交中…' : '提交打款金额'}</Text>
          </View>
        </View>
      </View>

      <View className="card">
        <Text className="f-md bold">风格标签（用于推荐匹配，可稍后在编辑资料修改）</Text>
        <View className="cf-chips mt-xs">
          {STYLE_TAGS.map((t) => (
            <Text
              key={t}
              className={`cf-chip ${styleTags.includes(t) ? 'is-active' : ''}`}
              onClick={() => setStyleTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))}
            >
              {t}
            </Text>
          ))}
        </View>
      </View>

      <View className="cf-note">
        <Text className="cf-note__text">🔒 认证资料仅用于资质审核，平台不会对外展示营业执照与身份证信息；Demo 环境上传仅记录本地路径，不影响真实资质。</Text>
      </View>
    </View>
  );
}
