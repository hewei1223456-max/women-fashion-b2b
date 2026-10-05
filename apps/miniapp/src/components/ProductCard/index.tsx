import type { ReactNode } from 'react';
import { View, Text, Image } from '@tarojs/components';
import type { ContactLogResult, Product } from '@wfb/shared-types';
import { clsx } from '@wfb/shared-utils';
import { count } from '../utils';
import Tag from '../Tag';
import PriceTag from '../PriceTag';
import ContactButton from '../ContactButton';
import './index.scss';

interface Props {
  product: Product;
  /** 收藏态 */
  collected?: boolean;
  onCollect?: (product: Product) => void;
  onClick?: () => void;
  /** 加微成功回调 */
  onContacted?: (result: ContactLogResult) => void;
  /** 隐藏加微按钮（自己的款列表等场景） */
  hideContact?: boolean;
  /** 底部自定义区域 */
  footer?: ReactNode;
  className?: string;
}

/** 瀑布流款卡片：款图 + 标题 + 价格带 + 起订量 + 发货地 + 加微按钮 */
export default function ProductCard({ product, collected, onCollect, onClick, onContacted, hideContact, footer, className }: Props) {
  const cover = (product.images ?? [])[0];

  return (
    <View className={clsx('product-card', className)} onClick={onClick}>
      <View className="product-card__cover-wrap">
        <Image className="product-card__cover" src={cover} mode="aspectFill" />
        {product.videoUrl ? (
          <View className="product-card__video-badge">
            <Text className="product-card__video-text">▶ 视频</Text>
          </View>
        ) : null}
      </View>

      <View className="product-card__body">
        <Text className="product-card__title t1 ellipsis-2">{product.title}</Text>

        <View className="product-card__price row-between">
          <PriceTag range={product.priceRange} size="md" />
          <Text className="product-card__moq f-xs t3">{product.moq} 件起订</Text>
        </View>

        <View className="product-card__meta row wrap">
          <Tag styleTag={product.styleTag} />
          <View className="product-card__ship row">
            <Text className="product-card__ship-text f-xs t3">📍{product.shipFrom}</Text>
          </View>
        </View>

        <View className="product-card__stats row-between">
          <Text className="product-card__stat f-xs t3">
            浏览 {count(product.viewCount)} · 加微 {count(product.contactCount)}
          </Text>
          {onCollect ? (
            <Text
              className={clsx('product-card__collect', collected && 'is-active')}
              onClick={(e) => {
                e.stopPropagation();
                onCollect(product);
              }}
            >
              {collected ? '⭐' : '☆'}
            </Text>
          ) : null}
        </View>

        {!hideContact ? (
          <View className="product-card__foot row">
            <ContactButton
              manufacturerId={product.manufacturerId}
              productId={product.id}
              source="product_card"
              text="加微信"
              size="sm"
              block
              onLogged={onContacted}
            />
          </View>
        ) : null}

        {footer}
      </View>
    </View>
  );
}
