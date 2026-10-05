import { View, Text } from '@tarojs/components';
import Taro, { usePullDownRefresh } from '@tarojs/taro';
import { useQuery } from '@tanstack/react-query';
import { MANUFACTURER_PLANS, planOf } from '@wfb/shared-types';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import Card from '@/components/Card';
import ListEmpty from '@/components/ListEmpty';
import SectionTitle from '@/components/SectionTitle';
import { compactNumber } from '@wfb/shared-utils';
import { errMsg } from '@/components/utils';
import './index.scss';

export default function ManufacturerAdmin() {
  const user = useAppStore((s) => s.user);
  const plan = planOf(user?.memberLevel ?? 'manufacturer_free');

  const dashboard = useQuery({ queryKey: ['contact-dashboard'], queryFn: () => api.contact.dashboard() });

  usePullDownRefresh(() => {
    dashboard.refetch().finally(() => Taro.stopPullDownRefresh());
  });

  const data = dashboard.data;
  const interactions = data ? (data.likes ?? 0) + (data.comments ?? 0) + (data.collects ?? 0) : 0;
  const funnel = data?.funnel ?? null;
  const maxFunnel = funnel?.reduce((m, f) => Math.max(m, f.value || 0), 1) ?? 1;
  const trend = data?.trend ?? [];
  const maxTrend = trend.reduce((m, t) => Math.max(m, t.exposure || 0), 1);
  const quotaPercent = data && data.quota?.limit > 0 ? Math.min(100, Math.round((data.quota.used / data.quota.limit) * 100)) : 0;

  return (
    <View className="page">
      <Card title="今日经营概览" subtitle={`当前版本：${plan.label} · 数据看板等级 ${plan.dashboard}`}>
        <View className="row wrap mfr-admin__kpis">
          <View className="mfr-admin__kpi col-center">
            <Text className="mfr-admin__kpi-value bold">{compactNumber(data?.exposure ?? 0)}</Text>
            <Text className="f-xs t3">曝光量</Text>
          </View>
          <View className="mfr-admin__kpi col-center">
            <Text className="mfr-admin__kpi-value bold accent">{compactNumber(data?.contacts ?? 0)}</Text>
            <Text className="f-xs t3">加微数</Text>
          </View>
          <View className="mfr-admin__kpi col-center">
            <Text className="mfr-admin__kpi-value bold">{((data?.contactRate ?? 0) * 100).toFixed(2)}%</Text>
            <Text className="f-xs t3">加微转化率</Text>
          </View>
          <View className="mfr-admin__kpi col-center">
            <Text className="mfr-admin__kpi-value bold">{compactNumber(interactions)}</Text>
            <Text className="f-xs t3">互动总量</Text>
          </View>
        </View>
      </Card>

      <ListEmpty
        loading={dashboard.isLoading}
        error={dashboard.isError ? errMsg(dashboard.error, '看板数据加载失败') : null}
        empty={false}
        onRetry={() => dashboard.refetch()}
      />

      {data ? (
        <View>
          <Card title="转化漏斗" subtitle="曝光 → 浏览 → 加微 → 有效加微">
            {funnel?.length ? (
              <View>
                {funnel.map((stage) => (
                  <View key={stage.stage} className="mfr-admin__funnel">
                    <View className="row-between">
                      <Text className="f-xs t2">{stage.stage}</Text>
                      <Text className="f-xs t3">{compactNumber(stage.value)}</Text>
                    </View>
                    <View className="mfr-admin__funnel-track">
                      <View className="mfr-admin__funnel-bar" style={{ width: `${Math.max(4, Math.round((stage.value / maxFunnel) * 100))}%` }} />
                    </View>
                  </View>
                ))}
                <Text className="f-xs t3 mfr-admin__note">转化率 = 加微数 / 曝光量，漏斗越往后流失越大，重点优化浏览到加微这一步。</Text>
              </View>
            ) : (
              <View className="mfr-admin__locked">
                <Text className="f-sm t2">🔒 完整转化漏斗为「高级版」及以上权益</Text>
                <Text className="f-xs t3 mfr-admin__locked-desc">升级后可查看逐层流失与优化建议。</Text>
                <View
                  className="btn btn-accent btn-sm mfr-admin__upgrade"
                  onClick={() => Taro.showModal({ title: '升级高级版', content: `高级版 ¥${MANUFACTURER_PLANS[2].price}/年：每日私信 100 条、不限款数、3 个子账号、漏斗看板。`, showCancel: true })}
                >
                  <Text>查看版本权益</Text>
                </View>
              </View>
            )}
          </Card>

          <Card title="近 7 日趋势" subtitle="柱高表示曝光量，橙色为加微数">
            {trend.length ? (
              <View className="mfr-admin__chart row">
                {trend.map((t) => (
                  <View key={t.date} className="mfr-admin__chart-col col-center">
                    <View className="mfr-admin__chart-bars row-center">
                      <View className="mfr-admin__chart-bar" style={{ height: Taro.pxTransform(Math.max(4, Math.round((t.exposure / maxTrend) * 160))) }} />
                      <View
                        className="mfr-admin__chart-bar mfr-admin__chart-bar--accent"
                        style={{ height: Taro.pxTransform(Math.max(3, Math.round(((t.contacts || 0) / Math.max(1, maxTrend)) * 160))) }}
                      />
                    </View>
                    <Text className="mfr-admin__chart-label">{t.date?.slice(5)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text className="f-sm t3">暂无趋势数据</Text>
            )}
          </Card>

          <Card title="主动私信配额" subtitle={`每日重置时间：${data.quota?.resetAt?.slice(0, 16).replace('T', ' ') ?? '-'}`}>
            <View className="row-between">
              <Text className="f-sm t2">
                已用 <Text className="bold accent">{data.quota?.used ?? 0}</Text> / {data.quota?.limit === -1 ? '不限' : data.quota?.limit ?? 0}
              </Text>
              <Text className="f-xs t3">剩余可主动私信</Text>
            </View>
            <View className="mfr-admin__quota-track">
              <View className="mfr-admin__quota-bar" style={{ width: `${quotaPercent}%` }} />
            </View>
            <View
              className="btn btn-ghost btn-sm mfr-admin__quota-btn"
              onClick={() => Taro.navigateTo({ url: '/pages/manufacturer/contact-list' })}
            >
              <Text>去私信管理 →</Text>
            </View>
          </Card>
        </View>
      ) : null}

      <SectionTitle title="版本权益" subtitle={`当前：${plan.label}`} />
      <Card>
        {MANUFACTURER_PLANS.map((p) => (
          <View key={p.level} className={`mfr-admin__plan ${p.level === plan.level ? 'is-current' : ''}`}>
            <View className="row-between">
              <Text className="f-sm bold t1">
                {p.label}
                {p.level === plan.level ? ' （当前）' : ''}
              </Text>
              <Text className="f-xs accent">{p.price === 0 ? '免费' : `¥${p.price}/年`}</Text>
            </View>
            <Text className="f-xs t3 mfr-admin__plan-desc">
              每日私信 {p.dailyMessages === -1 ? '不限' : p.dailyMessages} 条 · 可发布款 {p.productLimit === -1 ? '不限' : p.productLimit} 个 · 子账号{' '}
              {p.subAccounts === -1 ? '不限' : p.subAccounts} 个 · {p.groupSend ? '支持群发' : '不支持群发'} · {p.orderingFair ? '可发布订货会' : '不可发布订货会'}
            </Text>
          </View>
        ))}
      </Card>
    </View>
  );
}
