import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { View, Text, Input } from '@tarojs/components';
import { clsx } from '@wfb/shared-utils';
import './index.scss';

interface Props {
  value?: string;
  placeholder?: string;
  onInput?: (v: string) => void;
  /** 回车 / 点击搜索图标触发 */
  onSearch?: (v: string) => void;
  onClear?: () => void;
  /** 右侧追加节点（如「取消」「筛选」） */
  extra?: ReactNode;
  autoFocus?: boolean;
  /** 只读：整块可点击，用于跳转独立搜索页 */
  readonly?: boolean;
  onClick?: () => void;
  className?: string;
}

/** 搜索框：受控 / 非受控皆可，H5 与小程序行为一致 */
export default function SearchBar({ value = '', placeholder = '搜索款式、厂家、资讯', onInput, onSearch, onClear, extra, autoFocus, readonly, onClick, className }: Props) {
  const [inner, setInner] = useState(value);

  useEffect(() => {
    setInner(value);
  }, [value]);

  const emit = (v: string) => {
    setInner(v);
    onInput?.(v);
  };

  if (readonly) {
    return (
      <View className={clsx('search-bar row', className)} onClick={onClick}>
        <View className="search-bar__box row flex-1">
          <Text className="search-bar__icon">🔍</Text>
          <Text className="search-bar__placeholder f-sm t3 flex-1 ellipsis">{placeholder}</Text>
        </View>
        {extra}
      </View>
    );
  }

  return (
    <View className={clsx('search-bar row', className)}>
      <View className="search-bar__box row flex-1">
        <Text className="search-bar__icon" onClick={() => onSearch?.(inner)}>
          🔍
        </Text>
        <Input
          className="search-bar__input flex-1"
          value={inner}
          placeholder={placeholder}
          placeholderClass="search-bar__placeholder"
          confirmType="search"
          focus={autoFocus}
          onInput={(e) => emit(e.detail.value)}
          onConfirm={() => onSearch?.(inner)}
        />
        {inner ? (
          <Text
            className="search-bar__clear"
            onClick={() => {
              emit('');
              onClear?.();
            }}
          >
            ✕
          </Text>
        ) : null}
      </View>
      {extra}
    </View>
  );
}
