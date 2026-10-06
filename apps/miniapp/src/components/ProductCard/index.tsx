import type { ReactNode } from 'react';
import { View, Text, Image } from '@tarojs/components';
import type { ContactLogResult, Product, ProductCapability, StallType, TierPrice } from '@wfb/shared-types';
import { CAPABILITY_LABELS, STALL_TYPE_LABELS } from '@wfb/shared-types';
import { clsx } from '@wfb/shared-utils';
import { count } from '../utils';
import Tag from '../Tag';
import ContactButton from '../ContactButton';
import Badge from '../Badge';
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
  /** 隐藏作者行（厂家自己的款列表等场景） */
  hideAuthor?: boolean;
  /** 底部自定义区域 */
  footer?: ReactNode;
  className?: string;
}

/** 字段缺失时的统一占位（后端灰度期间新字段可能还没下发） */
const TBD = '待完善';

/** 把契约字段当宽松对象读：新字段在旧接口上可能 undefined，直接比较会触发 TS2367 */
function loose(p: Product): Record<string, unknown> {
  return p as unknown as Record<string, unknown>;
}

function positive(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * ① 拿货价：优先 wholesalePrice，其次 priceMin / priceRange 下界（同为拿货价口径），都没有则 undefined。
 */
export function wholesalePriceOf(p: Product): number | undefined {
  const raw = loose(p);
  const fromField = positive(raw.wholesalePrice) ?? positive(raw.priceMin);
  if (fromField !== undefined) return fromField;
  const rangeMin = Number(String(raw.priceRange ?? '').split('-')[0]);
  return Number.isFinite(rangeMin) && rangeMin > 0 ? rangeMin : undefined;
}

/**
 * ② 起提量价：有 tierPrices 用它（升序取前 3 档）；
 * 后端约定「没填阶梯价时按 moq 补一条」，前端同样兜底，保证这一层永远有内容。
 */
export function tierPricesOf(p: Product): TierPrice[] {
  const raw = loose(p);
  const list = Array.isArray(raw.tierPrices) ? (raw.tierPrices as TierPrice[]) : [];
  const valid = list.filter((t) => t && positive(t.minQty) !== undefined && positive(t.price) !== undefined);
  if (valid.length) {
    return [...valid].sort((a, b) => Number(a.minQty) - Number(b.minQty)).slice(0, 3);
  }
  const price = wholesalePriceOf(p);
  const moq = positive(raw.moq);
  return price !== undefined && moq !== undefined ? [{ minQty: moq, price }] : [];
}

/** ③ 是否支持拼单：true / false / undefined（旧接口未下发）三态 */
export function groupBuyOf(p: Product): boolean | undefined {
  const v = loose(p).supportsGroupBuy;
  return v === true ? true : v === false ? false : undefined;
}

/** ④ 档口形态：只认契约里的 4 个枚举值 */
export function stallTypeOf(p: Product): StallType | undefined {
  const v = loose(p).stallType;
  return typeof v === 'string' && v in STALL_TYPE_LABELS ? (v as StallType) : undefined;
}

/** ④ 档口 / 工厂的具体位置描述 */
export function stallAddressOf(p: Product): string {
  const v = loose(p).stallAddress;
  return typeof v === 'string' ? v.trim() : '';
}

/** ⑤ 拿货地（产业带）：新字段 market 优先，回退历史 shipFrom */
export function marketOf(p: Product): string {
  const raw = loose(p);
  const market = typeof raw.market === 'string' ? raw.market.trim() : '';
  if (market) return market;
  return String(raw.shipFrom ?? '').trim();
}

/** ⑥ 实力标签 */
export function capabilitiesOf(p: Product): ProductCapability[] {
  const raw = loose(p);
  const list = Array.isArray(raw.capabilities) ? (raw.capabilities as ProductCapability[]) : [];
  return list.filter((c) => c in CAPABILITY_LABELS);
}

/** 拼单最小成团件数 */
export function groupBuyMinQtyOf(p: Product): number | undefined {
  return positive(loose(p).groupBuyMinQty);
}

/** 代发价（支持一件代发时有值） */
export function dropshipPriceOf(p: Product): number | undefined {
  return positive(loose(p).dropshipPrice);
}

/**
 * 瀑布流款卡片 —— 按店主看货的真实顺序排 7 层信息（REDESIGN-V2 2.1）：
 *   1 款图 + 款名 → 2 拿货价 → 3 起提量价 → 4 是否支持拼单
 *   → 5 档口形态 → 6 拿货地（产业带）→ 7 实力标签，最后才是作者身份标识与互动数据。
 */
export default function ProductCard({ product, collected, onCollect, onClick, onContacted, hideContact, hideAuthor, footer, className }: Props) {
  const raw = loose(product);
  const cover = (product.images ?? [])[0];

  const wholesale = wholesalePriceOf(product);
  const tiers = tierPricesOf(product);
  const groupBuy = groupBuyOf(product);
  const groupBuyMinQty = groupBuyMinQtyOf(product);
  const stallType = stallTypeOf(product);
  const stallAddress = stallAddressOf(product);
  const market = marketOf(product);
  const capabilities = capabilitiesOf(product);
  const shownCaps = capabilities.slice(0, 3);
  const dropshipPrice = dropshipPriceOf(product);
  const supportsDropship = raw.supportsDropship === true;
  const manufacturer = product.manufacturer;

  return (
    <View className={clsx('product-card', className)} onClick={onClick}>
      {/* 1. 款图 */}
      <View className="product-card__cover-wrap">
        <Image className="product-card__cover" src={cover} mode="aspectFill" />
        {product.videoUrl ? (
          <View className="product-card__video-badge">
            <Text className="product-card__video-text">▶ 视频</Text>
          </View>
        ) : null}
      </View>

      <View className="product-card__body">
        {/* 1. 款名 */}
        <Text className="product-card__title t1 ellipsis-2">{product.title}</Text>

        {/* 2. 拿货价（醒目） */}
        <View className="product-card__price-row row">
          <Text className="product-card__layer-label">拿货价</Text>
          {wholesale !== undefined ? (
            <View className="row product-card__price">
              <Text className="product-card__price-value bold">¥{wholesale}</Text>
              <Text className="product-card__price-suffix">起</Text>
            </View>
          ) : (
            <Text className="product-card__tbd">{TBD}</Text>
          )}
          {supportsDropship && dropshipPrice !== undefined ? (
            <Text className="product-card__dropship f-xs t3">代发 ¥{dropshipPrice}</Text>
          ) : null}
        </View>

        {/* 3. 起提量价（阶梯价，最多 3 档） */}
        <View className="product-card__block">
          <Text className="product-card__layer-label">起提量价</Text>
          <View className="product-card__tiers row wrap">
            {tiers.length ? (
              tiers.map((t) => (
                <View key={`${t.minQty}-${t.price}`} className="product-card__tier">
                  <Text className="product-card__tier-text">
                    {t.label ? `${t.label} ` : ''}
                    {t.minQty}件起订 ¥{t.price}
                  </Text>
                </View>
              ))
            ) : (
              <Text className="product-card__tbd">{TBD}</Text>
            )}
          </View>
        </View>

        {/* 4. 是否支持拼单拿货 */}
        <View className="product-card__layer row">
          <Text className="product-card__layer-label">拼单</Text>
          {groupBuy === true ? (
            <View className="product-card__chip product-card__chip--group">
              <Text className="product-card__chip-text">
                可拼单{groupBuyMinQty !== undefined ? ` · ${groupBuyMinQty}件成团` : ''}
              </Text>
            </View>
          ) : (
            <View className="product-card__chip product-card__chip--off">
              <Text className="product-card__chip-text">{groupBuy === false ? '不支持拼单' : TBD}</Text>
            </View>
          )}
        </View>

        {/* 5. 档口形态 */}
        <View className="product-card__layer row">
          <Text className="product-card__layer-label">档口</Text>
          {stallType ? (
            <View className="product-card__chip product-card__chip--stall">
              <Text className="product-card__chip-text">{STALL_TYPE_LABELS[stallType]}</Text>
            </View>
          ) : (
            <Text className="product-card__tbd">{TBD}</Text>
          )}
          {stallAddress ? <Text className="product-card__addr f-xs t3 ellipsis">{stallAddress}</Text> : null}
        </View>

        {/* 6. 拿货地（产业带）—— 不再叫「发货地」 */}
        <View className="product-card__layer row">
          <Text className="product-card__layer-label">拿货地</Text>
          {market ? (
            <Text className="product-card__market f-xs t2 ellipsis">📍{market}</Text>
          ) : (
            <Text className="product-card__tbd">{TBD}</Text>
          )}
        </View>

        {/* 7. 实力标签 */}
        <View className="product-card__block">
          <Text className="product-card__layer-label">实力</Text>
          <View className="product-card__caps row wrap">
            {shownCaps.length ? (
              shownCaps.map((c) => (
                <View key={c} className="product-card__cap">
                  <Text className="product-card__cap-text">{CAPABILITY_LABELS[c]}</Text>
                </View>
              ))
            ) : (
              <Text className="product-card__tbd">{TBD}</Text>
            )}
            {capabilities.length > shownCaps.length ? (
              <Text className="product-card__cap-more f-xs t3">+{capabilities.length - shownCaps.length}</Text>
            ) : null}
          </View>
        </View>

        <View className="product-card__meta row wrap">
          <Tag styleTag={product.styleTag} />
        </View>

        {manufacturer && !hideAuthor ? (
          <View className="product-card__author row">
            <Image className="avatar avatar-sm product-card__author-avatar" src={manufacturer.avatarUrl} mode="aspectFill" />
            <Text className="product-card__author-name f-xs t2 ellipsis">{manufacturer.nickname}</Text>
            <Badge user={manufacturer} max={2} size="xs" />
          </View>
        ) : null}

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
