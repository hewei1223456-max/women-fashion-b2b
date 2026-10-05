import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/request';
import Tabs from '@/components/Tabs';
import ListEmpty from '@/components/ListEmpty';
import ArticleCard from '@/components/ArticleCard';
import ProductCard from '@/components/ProductCard';
import Card from '@/components/Card';
import { count, errMsg } from '@/components/utils';
import './index.scss';

const TABS = [
  { key: 'article', label: '资讯' },
  { key: 'product', label: '货源' },
];

export default function TopicDetail() {
  const router = useRouter();
  const tag = decodeURIComponent(String(router.params?.tag ?? ''));
  const [tab, setTab] = useState('article');

  const detail = useQuery({ queryKey: ['topic-detail', tag], queryFn: () => api.topic.detail(tag), enabled: !!tag });

  const topic = detail.data?.topic;
  const articles = detail.data?.articles ?? [];
  const products = detail.data?.products ?? [];

  if (!tag) {
    return (
      <View className="page">
        <ListEmpty error="缺少话题参数" />
      </View>
    );
  }

  return (
    <View className="page">
      <Card>
        <Text className="topic-detail__name bold t1">#{topic?.name ?? tag}</Text>
        <View className="row topic-detail__stats">
          <Text className="f-xs t3">{count(topic?.contentCount ?? 0)} 条内容</Text>
          <Text className="f-xs t3 topic-detail__dot">·</Text>
          <Text className="f-xs t3">{count(topic?.viewCount ?? 0)} 浏览</Text>
          <Text className="f-xs t3 topic-detail__dot">·</Text>
          <Text className="f-xs accent">🔥 {count(topic?.heat ?? 0)}</Text>
        </View>
        <View className="topic-detail__actions row">
          <View className="btn btn-sm btn-ghost" onClick={() => Taro.navigateTo({ url: '/pages/source/search' })}>
            <Text>搜同款</Text>
          </View>
          <View className="btn btn-sm btn-plain topic-detail__publish" onClick={() => Taro.navigateTo({ url: '/pages/content/publish' })}>
            <Text>带话题发布</Text>
          </View>
        </View>
      </Card>

      <Tabs items={TABS} current={tab} onChange={setTab} />

      <ListEmpty
        loading={detail.isLoading}
        error={detail.isError ? errMsg(detail.error, '话题内容加载失败') : null}
        empty={tab === 'article' ? !articles.length : !products.length}
        emptyText={tab === 'article' ? '该话题暂无资讯' : '该话题暂无货源'}
        onRetry={() => detail.refetch()}
      />

      {tab === 'article'
        ? articles.map((a) => <ArticleCard key={a.id} article={a} onClick={() => Taro.navigateTo({ url: `/pages/info/detail?id=${a.id}` })} />)
        : null}

      {tab === 'product' && products.length ? (
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
  );
}
