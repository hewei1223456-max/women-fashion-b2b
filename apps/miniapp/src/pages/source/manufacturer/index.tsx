import { useMemo, useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/request';
import Card from '@/components/Card';
import Tag from '@/components/Tag';
import ListEmpty from '@/components/ListEmpty';
import ProductCard from '@/components/ProductCard';
import SectionTitle from '@/components/SectionTitle';
import ContactButton from '@/components/ContactButton';
import { toast, toastError, toastSuccess } from '@/components/Toast';
import { certBadge, count, errMsg } from '@/components/utils';
import './index.scss';

export default function ManufacturerHome() {
  const router = useRouter();
  const id = Number(router.params?.id ?? 0);
  const queryClient = useQueryClient();

  const detail = useQuery({ queryKey: ['profile-detail', id], queryFn: () => api.profile.detail(id), enabled: !!id });
  const profile = detail.data;

  const productsQuery = useQuery({
    queryKey: ['manufacturer-products', id, profile?.user?.nickname],
    queryFn: () => api.source.feed({ keyword: profile?.user?.nickname, page: 1, pageSize: 20 }),
    enabled: !!profile?.user?.nickname,
  });

  const products = useMemo(
    () => (productsQuery.data?.list ?? []).filter((p) => p.manufacturerId === id),
    [productsQuery.data, id],
  );

  const [following, setFollowing] = useState<boolean | null>(null);
  const followed = following ?? profile?.followed ?? false;

  const toggleFollow = async (next: boolean) => {
    setFollowing(next);
    try {
      const res = next ? await api.interaction.follow({ userId: id }) : await api.interaction.unfollow({ userId: id });
      setFollowing(res.followed);
      toast(next ? '已关注厂家' : '已取消关注');
      queryClient.invalidateQueries({ queryKey: ['profile-detail', id] });
    } catch (e) {
      setFollowing(!next);
      toastError(errMsg(e, '操作失败'));
    }
  };

  const message = async () => {
    try {
      await api.message.send({ receiverId: id, content: '你好，想了解贵厂的最新款和拿货价' });
      toast('已发送私信');
      Taro.navigateTo({ url: '/pages/interaction/message-center' });
    } catch (e) {
      toastError(errMsg(e, '私信发送失败'));
    }
  };

  const copyCompany = (text: string) => {
    Taro.setClipboardData({ data: text }).then(() => toastSuccess('已复制'));
  };

  if (!id) {
    return (
      <View className="page">
        <ListEmpty error="缺少厂家 ID，请从货源列表进入" />
      </View>
    );
  }

  return (
    <View className="page mfr">
      <ListEmpty loading={detail.isLoading} error={detail.isError ? errMsg(detail.error, '厂家信息加载失败') : null} empty={!profile} onRetry={() => detail.refetch()} />

      {profile ? (
        <View>
          <Card>
            <View className="row">
              <Image className="mfr__avatar" src={profile.user.avatarUrl} mode="aspectFill" />
              <View className="col flex-1 mfr__head">
                <View className="row">
                  <Text className="mfr__name bold t1 ellipsis">{profile.user.nickname}</Text>
                  {certBadge(profile.user.certStatus) ? (
                    <View className="tag tag-success mfr__cert">
                      <Text>{certBadge(profile.user.certStatus)}</Text>
                    </View>
                  ) : null}
                </View>
                {profile.user.companyName ? (
                  <Text className="f-xs t3 mfr__company" onClick={() => copyCompany(profile.user.companyName ?? '')}>
                    {profile.user.companyName}（点击复制）
                  </Text>
                ) : null}
                <View className="row wrap mfr__tags">
                  {(profile.user.styleTags ?? []).map((t) => (
                    <Tag key={t} styleTag={t} />
                  ))}
                </View>
              </View>
            </View>

            {profile.user.bio ? <Text className="f-sm t2 mfr__bio">{profile.user.bio}</Text> : null}

            <View className="row mfr__stats">
              <View className="mfr__stat col-center">
                <Text className="mfr__stat-value bold">{profile.productCount ?? products.length}</Text>
                <Text className="f-xs t3">在售款</Text>
              </View>
              <View className="mfr__stat col-center">
                <Text className="mfr__stat-value bold">{((profile.contactRate ?? 0) * 100).toFixed(1)}%</Text>
                <Text className="f-xs t3">加微转化率</Text>
              </View>
              <View className="mfr__stat col-center">
                <Text className="mfr__stat-value bold">{count(profile.followerCount)}</Text>
                <Text className="f-xs t3">粉丝</Text>
              </View>
              <View className="mfr__stat col-center">
                <Text className="mfr__stat-value bold">{count(profile.likeReceived)}</Text>
                <Text className="f-xs t3">获赞</Text>
              </View>
            </View>

            <View className="row mfr__actions">
              <View className={`btn btn-sm ${followed ? 'btn-plain' : 'btn-ghost'} mfr__follow`} onClick={() => toggleFollow(!followed)}>
                <Text>{followed ? '已关注' : '+ 关注'}</Text>
              </View>
              <View className="btn btn-plain btn-sm mfr__msg" onClick={message}>
                <Text>私信</Text>
              </View>
              <View className="flex-1">
                <ContactButton manufacturerId={id} source="manufacturer_page" text="加微信拿货" size="sm" block onLogged={() => detail.refetch()} />
              </View>
            </View>
          </Card>

          <SectionTitle title="在售款" subtitle={products.length ? `匹配到 ${products.length} 款` : '暂无匹配款'} />

          <ListEmpty
            loading={productsQuery.isLoading}
            error={productsQuery.isError ? errMsg(productsQuery.error, '款列表加载失败') : null}
            empty={!products.length}
            emptyText="暂未匹配到该厂家的款"
            emptyDesc="可到货源首页按风格 / 发货地筛选，或直接加微咨询最新款"
            onRetry={() => productsQuery.refetch()}
          />

          {products.length ? (
            <View className="waterfall">
              <View className="waterfall-col">
                {products.filter((_, i) => i % 2 === 0).map((p) => (
                  <ProductCard key={p.id} product={p} onClick={() => Taro.navigateTo({ url: `/pages/source/detail?id=${p.id}` })} />
                ))}
              </View>
              <View className="waterfall-col">
                {products.filter((_, i) => i % 2 === 1).map((p) => (
                  <ProductCard key={p.id} product={p} onClick={() => Taro.navigateTo({ url: `/pages/source/detail?id=${p.id}` })} />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
