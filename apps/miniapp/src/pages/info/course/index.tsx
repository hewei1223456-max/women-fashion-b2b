import { useEffect, useMemo, useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useQuery } from '@tanstack/react-query';
import type { Course } from '@wfb/shared-types';
import { compactNumber } from '@wfb/shared-utils';
import { api } from '@/services/request';
import './index.scss';

export default function CourseList() {
  const [category, setCategory] = useState('全部');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<Course[]>([]);

  const query = useQuery({
    queryKey: ['course-list', page],
    queryFn: () => api.info.courseList({ page, pageSize: 20 }),
  });

  useEffect(() => {
    if (!query.data) return;
    const rows = query.data.list ?? [];
    setList((prev) => (page <= 1 ? rows : [...prev, ...rows]));
  }, [query.data, page]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    list.forEach((c) => c.category && set.add(c.category));
    return ['全部', ...Array.from(set)];
  }, [list]);

  const visible = category === '全部' ? list : list.filter((c) => c.category === category);

  return (
    <View className="page">
      <View className="card">
        <Text className="f-lg bold">讲师课程</Text>
        <Text className="f-sm t3">大店实战派讲师：组货 / 陈列 / 直播 / 私域</Text>
      </View>

      <View className="ds-chips">
        {categories.map((c) => (
          <Text key={c} className={`ds-chip ${category === c ? 'is-active' : ''}`} onClick={() => setCategory(c)}>
            {c}
          </Text>
        ))}
      </View>

      {query.isLoading && list.length === 0 ? <View className="loading">课程加载中…</View> : null}

      {query.isError && list.length === 0 ? (
        <View className="card" onClick={() => query.refetch()}>
          <Text className="f-md t2">课程加载失败（{(query.error as Error)?.message ?? '网络异常'}）</Text>
          <Text className="f-sm brand mt-xs">点击重试</Text>
        </View>
      ) : null}

      {!query.isLoading && !query.isError && visible.length === 0 ? <View className="empty">该分类下暂无课程</View> : null}

      {visible.map((c) => (
        <View
          key={c.id}
          className="cs-item"
          onClick={() =>
            Promise.resolve(Taro.navigateTo({ url: `/pages/info/course-detail?id=${c.id}` })).catch(() =>
              Taro.showToast({ title: '页面开发中', icon: 'none' }),
            )
          }
        >
          <Image className="cs-item__cover" src={c.coverUrl} mode="aspectFill" />
          <View className="cs-item__body">
            <View>
              <Text className="cs-item__title ellipsis-2">{c.title}</Text>
              <Text className="cs-item__meta">
                {c.lecturer?.nickname ?? '讲师'} · {c.duration} · {c.lessonCount} 节
              </Text>
            </View>
            <View className="cs-item__bottom">
              {c.free ? <Text className="cs-item__free">免费</Text> : <Text className="cs-item__price">¥{c.price}</Text>}
              <Text className="cs-item__count">{compactNumber(c.studentCount)}人学过</Text>
            </View>
          </View>
        </View>
      ))}

      {list.length > 0 ? (
        <View className="loading" onClick={() => (query.data?.hasMore && !query.isFetching ? setPage((p) => p + 1) : undefined)}>
          {query.isFetching ? '加载中…' : query.data?.hasMore ? '点击加载更多' : '没有更多了'}
        </View>
      ) : null}
    </View>
  );
}
