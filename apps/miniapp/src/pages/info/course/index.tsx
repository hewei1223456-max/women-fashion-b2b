import { useEffect, useMemo, useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useQuery } from '@tanstack/react-query';
import type { Course } from '@wfb/shared-types';
import { compactNumber } from '@wfb/shared-utils';
import { api } from '@/services/request';
import ListEmpty from '@/components/ListEmpty';
import LoadMore from '@/components/LoadMore';
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

      <ListEmpty
        loading={query.isLoading && list.length === 0}
        error={query.isError && list.length === 0 ? `课程加载失败：${(query.error as Error)?.message ?? '网络异常'}` : null}
        empty={!query.isLoading && !query.isError && visible.length === 0}
        emptyIcon="🎓"
        emptyText={category === '全部' ? '暂无课程' : `「${category}」分类下暂无课程`}
        emptyDesc="讲师课程持续上新"
        onRetry={() => query.refetch()}
      />

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

      <LoadMore
        loading={query.isFetching && list.length > 0}
        hasMore={query.data?.hasMore}
        count={list.length}
        onLoadMore={() => {
          if (query.isFetching || !query.data?.hasMore) return;
          setPage((p) => p + 1);
        }}
      />
    </View>
  );
}
