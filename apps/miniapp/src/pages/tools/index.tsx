import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useQuery } from '@tanstack/react-query';
import { TOOL_FREE_QUOTA, TOOLS } from '@wfb/shared-types';
import { api } from '@/services/request';
import TabBar from '@/components/TabBar';
import SectionTitle from '@/components/SectionTitle';
import ListEmpty from '@/components/ListEmpty';
import { errMsg, normalizeQuota, quotaOf } from '@/components/utils';
import './index.scss';

export default function Tools() {
  const quotaQuery = useQuery({ queryKey: ['tools-quota'], queryFn: () => api.tools.quota() });

  const quotas = normalizeQuota(quotaQuery.data);
  const limited = quotas.filter((q) => (q.limit ?? 0) > 0);
  const remaining = limited.reduce((sum, q) => sum + Math.max(0, (q.limit ?? 0) - (q.used ?? 0)), 0);
  const unlimited = quotas.filter((q) => q.limit === -1).length;
  const freeTools = TOOLS.filter((t) => !t.memberOnly).length;

  const open = (path: string) => Taro.navigateTo({ url: path });

  return (
    <View className="page-safe">
      <View className="tools-hub__banner">
        <View className="row-between">
          <View className="col flex-1">
            <Text className="tools-hub__banner-title bold">今日免费额度剩余 {quotaQuery.isLoading ? '-' : remaining} 次</Text>
            <Text className="tools-hub__banner-desc f-xs">
              {freeTools} 个免费工具{unlimited ? ` · ${unlimited} 个不限次` : ''} + 会员专属深度能力，货源一键生成内容
            </Text>
          </View>
          <View className="tools-hub__banner-btn" onClick={() => Taro.navigateTo({ url: '/pages/profile/index' })}>
            <Text className="tools-hub__banner-btn-text">开通会员</Text>
          </View>
        </View>
      </View>

      <SectionTitle title="全部功能" subtitle={`共 ${TOOLS.length} 个`} />

      {quotaQuery.isLoading ? <ListEmpty loading /> : null}
      {quotaQuery.isError ? (
        <ListEmpty error={errMsg(quotaQuery.error, '额度信息加载失败')} onRetry={() => quotaQuery.refetch()} />
      ) : null}
      {!quotaQuery.isLoading && !quotaQuery.isError && !TOOLS.length ? <ListEmpty empty emptyText="暂无可用工具" /> : null}

      {TOOLS.length ? (
        <View className="tools-hub__grid wrap">
          {TOOLS.map((tool) => {
            const q = quotaOf(quotas, tool.key);
            const limit = q?.limit ?? TOOL_FREE_QUOTA[tool.key] ?? 0;
            const used = q?.used ?? 0;
            const left = limit === -1 ? -1 : Math.max(0, limit - used);
            return (
              <View key={tool.key} className="tools-hub__cell" onClick={() => open(tool.path)}>
                <View className="tools-hub__icon-wrap">
                  <Text className="tools-hub__icon">{tool.icon}</Text>
                </View>
                <Text className="tools-hub__name bold t1 ellipsis">{tool.name}</Text>
                <Text className="tools-hub__desc f-xs t3 ellipsis-2">{tool.desc}</Text>
                <View className="tools-hub__foot row-between">
                  {tool.memberOnly ? (
                    <View className="tag tag-accent">
                      <Text>会员</Text>
                    </View>
                  ) : (
                    <View className="tag tag-gray">
                      <Text>{left === -1 ? '不限次' : left > 0 ? `今日剩 ${left} 次` : '额度已用完'}</Text>
                    </View>
                  )}
                  <Text className="tools-hub__arrow f-xs t3">→</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      <TabBar current="tools" />
    </View>
  );
}
