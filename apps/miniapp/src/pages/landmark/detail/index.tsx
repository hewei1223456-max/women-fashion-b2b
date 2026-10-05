import { useEffect, useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/request';
import Card from '@/components/Card';
import ListEmpty from '@/components/ListEmpty';
import ArticleCard from '@/components/ArticleCard';
import SectionTitle from '@/components/SectionTitle';
import { toast, toastError } from '@/components/Toast';
import { count, errMsg } from '@/components/utils';
import './index.scss';

export default function LandmarkDetail() {
  const router = useRouter();
  const id = Number(router.params?.id ?? 0);
  const queryClient = useQueryClient();
  const [following, setFollowing] = useState<boolean | null>(null);

  const detail = useQuery({ queryKey: ['landmark-detail', id], queryFn: () => api.landmark.detail(id), enabled: !!id });
  const shop = detail.data;

  useEffect(() => {
    if (shop) setFollowing(!!shop.followed);
  }, [shop]);

  const followed = following ?? shop?.followed ?? false;

  const toggleFollow = async () => {
    if (!shop) return;
    const next = !followed;
    setFollowing(next);
    try {
      const res = next ? await api.interaction.follow({ userId: shop.userId }) : await api.interaction.unfollow({ userId: shop.userId });
      setFollowing(res.followed);
      toast(next ? '已关注大店' : '已取消关注');
      queryClient.invalidateQueries({ queryKey: ['landmark-detail', id] });
    } catch (e) {
      setFollowing(!next);
      toastError(errMsg(e, '操作失败'));
    }
  };

  const message = async () => {
    if (!shop) return;
    try {
      await api.message.send({ receiverId: shop.userId, content: `你好，想请教${shop.shopName}的组货经验` });
      toast('已发送私信');
      Taro.navigateTo({ url: '/pages/interaction/message-center' });
    } catch (e) {
      toastError(errMsg(e, '私信发送失败'));
    }
  };

  if (!id) {
    return (
      <View className="page">
        <ListEmpty error="缺少大店 ID，请从列表进入" />
      </View>
    );
  }

  return (
    <View className="page-safe">
      <ListEmpty loading={detail.isLoading} error={detail.isError ? errMsg(detail.error, '大店信息加载失败') : null} empty={!shop} onRetry={() => detail.refetch()} />

      {shop ? (
        <View>
          <Image className="lmd__cover" src={shop.coverUrl} mode="aspectFill" />

          <Card>
            <View className="row-between">
              <Text className="lmd__name bold t1 flex-1">{shop.shopName}</Text>
              <View className={`btn btn-sm ${followed ? 'btn-plain' : 'btn-primary'}`} onClick={toggleFollow}>
                <Text>{followed ? '已关注' : '+ 关注'}</Text>
              </View>
            </View>
            <View className="row wrap lmd__tags">
              <View className="tag tag-gray">
                <Text>📍 {shop.city}</Text>
              </View>
              <View className="tag tag-accent">
                <Text>年营收 {shop.annualRevenue}</Text>
              </View>
              {shop.periods ? (
                <View className="tag">
                  <Text>已办 {shop.periods} 期游学</Text>
                </View>
              ) : null}
            </View>
            <Text className="f-sm t2 lmd__desc">{shop.styleDescription}</Text>

            <View className="row lmd__stats">
              <View className="lmd__stat col-center">
                <Text className="lmd__stat-value bold">{count(shop.articleCount)}</Text>
                <Text className="f-xs t3">方法论</Text>
              </View>
              <View className="lmd__stat col-center">
                <Text className="lmd__stat-value bold">{count(shop.followerCount)}</Text>
                <Text className="f-xs t3">粉丝</Text>
              </View>
              <View className="lmd__stat col-center">
                <Text className="lmd__stat-value bold">{shop.periods ?? 0}</Text>
                <Text className="f-xs t3">游学期数</Text>
              </View>
            </View>

            <View className="row lmd__actions">
              <View className="btn btn-plain btn-sm lmd__action" onClick={message}>
                <Text>私信请教</Text>
              </View>
              <View className="btn btn-ghost btn-sm lmd__action" onClick={() => Taro.navigateTo({ url: '/pages/source/ordering-fair' })}>
                <Text>看订货会</Text>
              </View>
            </View>
          </Card>

          <SectionTitle title="经营方法论" subtitle={`${shop.articles?.length ?? 0} 篇`} />

          <ListEmpty
            loading={false}
            empty={!shop.articles?.length}
            emptyText="该大店暂未发布方法论"
            emptyDesc="关注后可第一时间收到更新"
          />

          {(shop.articles ?? []).map((a) => (
            <ArticleCard key={a.id} article={a} onClick={() => Taro.navigateTo({ url: `/pages/info/detail?id=${a.id}` })} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
