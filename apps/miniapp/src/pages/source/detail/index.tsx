import { useEffect, useState } from 'react';
import { View, Text, Image, Swiper, SwiperItem } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/request';
import Card from '@/components/Card';
import Tag from '@/components/Tag';
import PriceTag from '@/components/PriceTag';
import StatBar from '@/components/StatBar';
import UserRow from '@/components/UserRow';
import ListEmpty from '@/components/ListEmpty';
import ProductCard from '@/components/ProductCard';
import ActionSheet from '@/components/ActionSheet';
import ContactButton from '@/components/ContactButton';
import SectionTitle from '@/components/SectionTitle';
import { toast, toastError, toastSuccess } from '@/components/Toast';
import { count, errMsg } from '@/components/utils';
import './index.scss';

const SHARE_CHANNELS = [
  { key: 'wechat', label: '微信好友' },
  { key: 'moments', label: '朋友圈' },
  { key: 'group', label: '微信群' },
  { key: 'link', label: '复制链接' },
];

export default function SourceDetail() {
  const router = useRouter();
  const id = Number(router.params?.id ?? 0);
  const queryClient = useQueryClient();
  const [liked, setLiked] = useState(false);
  const [collected, setCollected] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);

  const detail = useQuery({
    queryKey: ['source-detail', id],
    queryFn: () => api.source.detail(id),
    enabled: !!id,
  });

  useEffect(() => {
    if (!detail.data) return;
    setLiked(!!detail.data.liked);
    setCollected(!!detail.data.collected);
    setFollowed(!!detail.data.followed);
  }, [detail.data]);

  const product = detail.data;

  const toggleLike = async () => {
    if (!product) return;
    const next = !liked;
    setLiked(next);
    try {
      const res = next
        ? await api.interaction.like({ targetType: 'product', targetId: product.id })
        : await api.interaction.unlike({ targetType: 'product', targetId: product.id });
      setLiked(res.liked);
      queryClient.invalidateQueries({ queryKey: ['source-detail', id] });
    } catch (e) {
      setLiked(!next);
      toastError(errMsg(e, '操作失败'));
    }
  };

  const toggleCollect = async () => {
    if (!product) return;
    const next = !collected;
    setCollected(next);
    try {
      const res = next
        ? await api.interaction.collect({ targetType: 'product', targetId: product.id, folderName: '默认收藏' })
        : await api.interaction.uncollect({ targetType: 'product', targetId: product.id });
      setCollected(res.collected);
      toastSuccess(next ? '已收藏' : '已取消收藏');
    } catch (e) {
      setCollected(!next);
      toastError(errMsg(e, '操作失败'));
    }
  };

  const toggleFollow = async (next: boolean) => {
    if (!product?.manufacturer) return;
    setFollowed(next);
    try {
      const res = next ? await api.interaction.follow({ userId: product.manufacturerId }) : await api.interaction.unfollow({ userId: product.manufacturerId });
      setFollowed(res.followed);
      toast(next ? '已关注厂家' : '已取消关注');
    } catch (e) {
      setFollowed(!next);
      toastError(errMsg(e, '操作失败'));
    }
  };

  const share = async (channel: string) => {
    setShareVisible(false);
    if (!product) return;
    try {
      await api.interaction.share({ targetType: 'product', targetId: product.id, channel: channel as 'wechat' | 'moments' | 'group' | 'link' });
      if (channel === 'link') {
        Taro.setClipboardData({ data: `https://wfb.demo/source/${product.id}` }).then(() => toastSuccess('链接已复制'));
      } else {
        toastSuccess('已记录转发');
      }
    } catch (e) {
      toastError(errMsg(e, '转发失败'));
    }
  };

  if (!id) {
    return (
      <View className="page">
        <ListEmpty error="缺少款 ID，请从列表进入" />
      </View>
    );
  }

  return (
    <View className="page detail">
      <ListEmpty loading={detail.isLoading} error={detail.isError ? errMsg(detail.error, '款详情加载失败') : null} empty={!product} onRetry={() => detail.refetch()} />

      {product ? (
        <View>
          <Swiper className="detail__swiper" indicatorDots circular indicatorActiveColor="#2b4acb">
            {(product.images?.length ? product.images : [product.images?.[0] ?? '']).filter(Boolean).map((src) => (
              <SwiperItem key={src}>
                <Image className="detail__img" src={src} mode="aspectFill" />
              </SwiperItem>
            ))}
          </Swiper>

          <Card>
            <View className="row-between">
              <PriceTag range={product.priceRange} size="lg" />
              <Text className="f-xs t3">{product.moq} 件起订</Text>
            </View>
            <Text className="detail__title f-lg bold t1">{product.title}</Text>
            <View className="row wrap detail__tags">
              <Tag styleTag={product.styleTag} size="md" />
              <View className="tag tag-gray">
                <Text>📍 {product.shipFrom}</Text>
              </View>
              {product.manufacturer?.certStatus === 'approved' ? (
                <View className="tag tag-success">
                  <Text>厂家已认证</Text>
                </View>
              ) : null}
            </View>
            <StatBar view={product.viewCount} like={product.likeCount} collect={product.collectCount} comment={product.commentCount} />
            <View className="divider" />
            <Text className="f-sm t2 detail__desc">{product.description || '厂家暂未填写款说明，可直接加微咨询。'}</Text>
          </Card>

          {product.manufacturer ? (
            <Card title="供货厂家">
              <UserRow
                user={product.manufacturer}
                followed={followed}
                onFollow={toggleFollow}
                onClick={() => Taro.navigateTo({ url: `/pages/source/manufacturer?id=${product.manufacturerId}` })}
                desc={`${product.manufacturer.companyName ?? '厂家'} · 加微转化率 ${(product.contactRate * 100).toFixed(1)}%`}
              />
              <View className="row detail__mfr-actions">
                <Text className="f-xs t3">浏览 {count(product.viewCount)} · 已有 {count(product.contactCount)} 位店主加微</Text>
              </View>
            </Card>
          ) : null}

          {product.toolEntries?.length ? (
            <Card title="一键生成内容" subtitle="货源 → 功能联动">
              <View className="row wrap">
                {product.toolEntries.map((entry) => (
                  <View
                    key={entry.key}
                    className="detail__tool-entry"
                    onClick={() => {
                      const cover = product.images?.[0];
                      const url = entry.key === 'ai-image' && cover ? `${entry.path}?productImageUrl=${encodeURIComponent(cover)}` : entry.path;
                      Taro.navigateTo({ url });
                    }}
                  >
                    <Text className="detail__tool-entry-text f-sm brand">{entry.label}</Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          <Card title="互动" subtitle="喜欢就收藏，方便下次找款">
            <View className="row detail__interactions">
              <View className="detail__action col-center" onClick={toggleLike}>
                <Text className="detail__action-icon">{liked ? '❤️' : '🤍'}</Text>
                <Text className="detail__action-text f-xs t3">{liked ? '已赞' : '点赞'}</Text>
              </View>
              <View className="detail__action col-center" onClick={toggleCollect}>
                <Text className="detail__action-icon">{collected ? '⭐' : '☆'}</Text>
                <Text className="detail__action-text f-xs t3">{collected ? '已收藏' : '收藏'}</Text>
              </View>
              <View className="detail__action col-center" onClick={() => setShareVisible(true)}>
                <Text className="detail__action-icon">↗️</Text>
                <Text className="detail__action-text f-xs t3">转发</Text>
              </View>
              <View className="detail__action col-center" onClick={() => Taro.navigateTo({ url: `/pages/interaction/comment-list?targetType=product&targetId=${product.id}` })}>
                <Text className="detail__action-icon">💬</Text>
                <Text className="detail__action-text f-xs t3">评论 {count(product.commentCount)}</Text>
              </View>
            </View>
          </Card>

          {product.related?.length ? (
            <View>
              <SectionTitle title="相似款推荐" subtitle="同风格 / 同价格带" />
              <View className="waterfall">
                <View className="waterfall-col">
                  {product.related.filter((_, i) => i % 2 === 0).map((p) => (
                    <ProductCard key={p.id} product={p} onClick={() => Taro.redirectTo({ url: `/pages/source/detail?id=${p.id}` })} />
                  ))}
                </View>
                <View className="waterfall-col">
                  {product.related.filter((_, i) => i % 2 === 1).map((p) => (
                    <ProductCard key={p.id} product={p} onClick={() => Taro.redirectTo({ url: `/pages/source/detail?id=${p.id}` })} />
                  ))}
                </View>
              </View>
            </View>
          ) : null}

          <View className="detail__bottom-placeholder" />
          <View className="fixed-bottom row">
            <View className="detail__bottom-btn col-center" onClick={toggleCollect}>
              <Text className="detail__bottom-icon">{collected ? '⭐' : '☆'}</Text>
              <Text className="f-xs t3">收藏</Text>
            </View>
            <View className="flex-1 detail__contact">
              <ContactButton manufacturerId={product.manufacturerId} productId={product.id} source="product_detail" text="加微信拿货" size="lg" block onLogged={() => detail.refetch()} />
            </View>
          </View>
        </View>
      ) : null}

      <ActionSheet
        visible={shareVisible}
        title="转发到"
        options={SHARE_CHANNELS}
        onSelect={share}
        onClose={() => setShareVisible(false)}
      />
    </View>
  );
}
