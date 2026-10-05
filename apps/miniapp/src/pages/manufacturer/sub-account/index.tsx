import { useState } from 'react';
import { View, Text, Input } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SubAccount } from '@wfb/shared-types';
import { planOf } from '@wfb/shared-types';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import Card from '@/components/Card';
import ChipSelect from '@/components/ChipSelect';
import ListEmpty from '@/components/ListEmpty';
import Modal from '@/components/Modal';
import { hideLoading, showLoading, toastError, toastSuccess } from '@/components/Toast';
import { errMsg } from '@/components/utils';
import './index.scss';

const ROLES = [
  { value: 'sales', label: '销售' },
  { value: 'operation', label: '运营' },
  { value: 'admin', label: '管理员' },
];

const ROLE_LABELS: Record<string, string> = { sales: '销售', operation: '运营', admin: '管理员' };

export default function SubAccount() {
  const user = useAppStore((s) => s.user);
  const plan = planOf(user?.memberLevel ?? 'manufacturer_free');
  const queryClient = useQueryClient();

  const [createVisible, setCreateVisible] = useState(false);
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'sales' | 'operation' | 'admin'>('sales');
  const [removeId, setRemoveId] = useState(0);

  const list = useQuery({ queryKey: ['sub-accounts'], queryFn: () => api.subAccount.list() });
  const accounts: SubAccount[] = list.data ?? [];
  const limit = plan.subAccounts;
  const reached = limit !== -1 && accounts.length >= limit;

  const create = async () => {
    if (nickname.trim().length < 2) return toastError('请填写子账号昵称');
    if (!/^\d{11}$/.test(phone.trim())) return toastError('请填写 11 位手机号');
    if (reached) return toastError(`${plan.label}最多创建 ${limit} 个子账号，请升级版本`);
    showLoading('创建中...');
    try {
      await api.subAccount.create({ nickname: nickname.trim(), phone: phone.trim(), role });
      hideLoading();
      toastSuccess('子账号已创建');
      setCreateVisible(false);
      setNickname('');
      setPhone('');
      queryClient.invalidateQueries({ queryKey: ['sub-accounts'] });
    } catch (e) {
      hideLoading();
      toastError(errMsg(e, '创建失败'));
    }
  };

  const remove = async () => {
    const id = removeId;
    setRemoveId(0);
    if (!id) return;
    try {
      await api.subAccount.remove(id);
      toastSuccess('已移除子账号');
      queryClient.invalidateQueries({ queryKey: ['sub-accounts'] });
    } catch (e) {
      toastError(errMsg(e, '移除失败'));
    }
  };

  return (
    <View className="page">
      <Card title="子账号管理" subtitle={`${plan.label} · 已用 ${accounts.length}/${limit === -1 ? '不限' : limit}`}>
        <Text className="f-xs t3">子账号可代厂家管理款与回复私信，权限由角色决定。</Text>
        <View className="row sub__roles">
          {ROLES.map((r) => (
            <View key={r.value} className="sub__role-chip">
              <Text className="f-xs t2">
                {r.label}：
                {r.value === 'sales' ? ' 发布款、回私信' : r.value === 'operation' ? ' 看数据、改款' : ' 全部权限'}
              </Text>
            </View>
          ))}
        </View>
        <View className={`btn btn-primary sub__create ${reached ? 'btn-disabled' : ''}`} onClick={() => (reached ? toastError('已达版本上限，请升级') : setCreateVisible(true))}>
          <Text>{reached ? '已达版本上限' : '+ 新建子账号'}</Text>
        </View>
      </Card>

      <ListEmpty
        loading={list.isLoading}
        error={list.isError ? errMsg(list.error, '子账号加载失败') : null}
        empty={!accounts.length}
        emptyText="还没有子账号"
        emptyDesc="把日常发款与回私信交给团队，自己只看数据"
        onRetry={() => list.refetch()}
      />

      {accounts.map((acc) => (
        <View key={acc.id} className="sub-row">
          <View className="col flex-1">
            <View className="row">
              <Text className="sub-row__name f-sm bold t1">{acc.nickname}</Text>
              <View className="tag sub-row__role">
                <Text>{ROLE_LABELS[acc.role] ?? acc.role}</Text>
              </View>
            </View>
            <Text className="f-xs t3 sub-row__phone">{acc.phone ? `${acc.phone.slice(0, 3)}****${acc.phone.slice(7)}` : '未绑定手机号'}</Text>
            <Text className="f-xs t3">创建于 {acc.createdAt?.slice(0, 10)}</Text>
          </View>
          <View className="btn btn-plain btn-sm" onClick={() => setRemoveId(acc.id)}>
            <Text>移除</Text>
          </View>
        </View>
      ))}

      <Modal visible={createVisible} title="新建子账号" confirmText="创建" cancelText="取消" onConfirm={create} onCancel={() => setCreateVisible(false)}>
        <View className="sub__form">
          <Text className="field-label">昵称 *</Text>
          <Input className="input" value={nickname} placeholder="例如：小美（客服）" onInput={(e) => setNickname(e.detail.value)} />
          <Text className="field-label">手机号 *</Text>
          <Input className="input" type="number" value={phone} maxlength={11} placeholder="11 位手机号" onInput={(e) => setPhone(e.detail.value)} />
          <Text className="field-label">角色</Text>
          <ChipSelect options={ROLES} value={role} onSelect={(v) => setRole(v as typeof role)} />
        </View>
      </Modal>

      <Modal visible={!!removeId} title="移除子账号" content="移除后该账号将无法再登录管理本厂内容。" confirmText="移除" onConfirm={remove} onCancel={() => setRemoveId(0)} />
    </View>
  );
}
