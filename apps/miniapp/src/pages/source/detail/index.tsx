import { useEffect, useState } from 'react';
import { View, Text, Image, Swiper, SwiperItem } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CAPABILITY_LABELS, STALL_TYPE_LABELS } from '@wfb/shared-types';
import { api } from '@/services/request';
import Card from '@/components/Card';
import Tag from '@/components/Tag';
import StatBar from '@/components/StatBar';
import UserRow from '@/components/UserRow';
import ListEmpty from '@/components/ListEmpty';
import ProductCard, {
  capabilitiesOf,
  dropshipPriceOf,
  groupBuyMinQtyOf,
  groupBuyOf,
  marketOf,
  stallAddressOf,
  stallTypeOf,
  tierPricesOf,
  wholesalePriceOf,
} from '@/components/ProductCard';
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

/** 新字段缺失时的统一占位 */
const TBD = '待完善';

/** 上新时间：只展示到日，避免时区歧义 */
function listedText(iso?: string): string {
  if (!iso) return TBD;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return TBD;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
  const rawProduct = (product ?? {}) as unknown as Record<string, unknown>;
  const wholesale = product ? wholesalePriceOf(product) : undefined;
  const tiers = product ? tierPricesOf(product) : [];
  const groupBuy = product ? groupBuyOf(product) : undefined;
  const groupBuyMinQty = product ? groupBuyMinQtyOf(product) : undefined;
  const stallType = product ? stallTypeOf(product) : undefined;
  const stallAddress = product ? stallAddressOf(product) : '';
  const market = product ? marketOf(product) : '';
  const capabilities = product ? capabilitiesOf(product) : [];
  const dropshipPrice = product ? dropshipPriceOf(product) : undefined;
  const supportsDropship = rawProduct.supportsDropship === true;
  const fabric = typeof rawProduct.fabric === 'string' ? rawProduct.fabric : '';
  const sizes = Array.isArray(rawProduct.sizes) ? (rawProduct.sizes as string[]) : [];
  const colorCount = Number(rawProduct.colorCount) > 0 ? Number(rawProduct.colorCount) : undefined;
  const listedAt = typeof rawProduct.listedAt === 'string' ? rawProduct.listedAt : '';

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

          {/* 批发交易信息：① 拿货价 ② 起提量价 ③ 是否支持拼单 ④ 档口形态 ⑤ 拿货地 ⑥ 实力标签 */}
          <Card>
            <Text className="detail__title f-lg bold t1">{product.title}</Text>

            <View className="detail__price-row row">
              <Text className="detail__price-label">拿货价</Text>
              {wholesale !== undefined ? (
                <View className="row detail__price">
                  <Text className="detail__price-value bold">¥{wholesale}</Text>
                  <Text className="detail__price-suffix">起</Text>
                </View>
              ) : (
                <Text className="detail__tbd">{TBD}</Text>
              )}
              <Text className="f-xs t3 detail__moq">{product.moq} 件起订</Text>
            </View>

            <View className="detail__spec-row">
              <Text className="detail__price-label">起提量价</Text>
              <View className="row wrap flex-1">
                {tiers.length ? (
                  tiers.map((t) => (
                    <View key={`${t.minQty}-${t.price}`} className="detail__tier">
                      <Text className="detail__tier-text">
                        {t.label ? `${t.label} ` : ''}
                        {t.minQty}件起订 ¥{t.price}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text className="detail__tbd">{TBD}</Text>
                )}
                {supportsDropship && dropshipPrice !== undefined ? (
                  <View className="detail__tier detail__tier--plain">
                    <Text className="detail__tier-text">一件代发 ¥{dropshipPrice}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View className="detail__spec-row">
              <Text className="detail__price-label">拼单拿货</Text>
              <View className="row flex-1">
                {groupBuy === true ? (
                  <View className="detail__chip detail__chip--ok">
                    <Text className="detail__chip-text">可拼单{groupBuyMinQty !== undefined ? ` · ${groupBuyMinQty}件成团` : ''}</Text>
                  </View>
                ) : (
                  <View className="detail__chip">
                    <Text className="detail__chip-text">{groupBuy === false ? '不支持拼单' : TBD}</Text>
                  </View>
                )}
                {groupBuy === true ? (
                  <Text className="f-xs brand" onClick={() => Taro.navigateTo({ url: '/pages/source/groupbuy' })}>
                    去拼单广场 ›
                  </Text>
                ) : null}
              </View>
            </View>

            <View className="detail__spec-row">
              <Text className="detail__price-label">档口形态</Text>
              <View className="row flex-1 wrap">
                {stallType ? (
                  <View className="detail__chip detail__chip--brand">
                    <Text className="detail__chip-text">{STALL_TYPE_LABELS[stallType]}</Text>
                  </View>
                ) : (
                  <Text className="detail__tbd">{TBD}</Text>
                )}
                {stallAddress ? <Text className="f-xs t3 detail__addr">{stallAddress}</Text> : null}
              </View>
            </View>

            <View className="detail__spec-row">
              <Text className="detail__price-label">拿货地</Text>
              <Text className="f-sm t2 flex-1">{market ? `📍${market}（产业带）` : TBD}</Text>
            </View>

            <View className="detail__spec-row">
              <Text className="detail__price-label">实力标签</Text>
              <View className="row wrap flex-1">
                {capabilities.length ? (
                  capabilities.map((c) => (
                    <View key={c} className="detail__cap">
                      <Text className="detail__cap-text">{CAPABILITY_LABELS[c]}</Text>
                    </View>
                  ))
                ) : (
                  <Text className="detail__tbd">{TBD}</Text>
                )}
              </View>
            </View>

            <View className="detail__spec-row">
              <Text className="detail__price-label">款信息</Text>
              <View className="col flex-1">
                <Text className="f-xs t3 detail__spec-line">面料：{fabric || TBD}</Text>
                <Text className="f-xs t3 detail__spec-line">尺码：{sizes.length ? sizes.join(' / ') : TBD}</Text>
                <Text className="f-xs t3 detail__spec-line">
                  颜色数：{colorCount !== undefined ? `${colorCount} 色` : TBD} · 上新：{listedText(listedAt)}
                </Text>
              </View>
            </View>

            <View className="row wrap detail__tags">
              <Tag styleTag={product.styleTag} size="md" />
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
                desc={`${product.manufacturer.companyName ?? '厂家'} · 加微转化率 ${(Number(product.contactRate || 0) * 100).toFixed(1)}%`}
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
