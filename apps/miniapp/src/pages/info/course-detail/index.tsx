import { useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { compactNumber } from '@wfb/shared-utils';
import { api } from '@/services/request';
import './index.scss';

export default function CourseDetail() {
  const router = useRouter();
  const id = Number(router.params.id ?? 0);
  const queryClient = useQueryClient();
  const [followed, setFollowed] = useState(false);

  const query = useQuery({ queryKey: ['course-detail', id], queryFn: () => api.info.courseDetail(id), enabled: id > 0 });

  const follow = useMutation({
    mutationFn: (on: boolean) => (on ? api.interaction.follow({ userId: query.data!.lecturerId }) : api.interaction.unfollow({ userId: query.data!.lecturerId })),
    onSuccess: (_res, on) => {
      setFollowed(on);
      void queryClient.invalidateQueries({ queryKey: ['course-detail', id] });
    },
    onError: (e: Error) => Taro.showToast({ title: e.message || '操作失败', icon: 'none' }),
  });

  const course = query.data;
  const lessons = course ? Array.from({ length: Math.max(course.lessonCount, 1) }, (_, i) => i + 1) : [];

  if (!id) {
    return (
      <View className="page">
        <View className="empty">缺少课程 id</View>
      </View>
    );
  }

  return (
    <View className="page cd-page">
      {query.isLoading ? <View className="loading">加载中…</View> : null}

      {query.isError ? (
        <View className="card" onClick={() => query.refetch()}>
          <Text className="f-md t2">课程加载失败（{(query.error as Error)?.message ?? '网络异常'}）</Text>
          <Text className="f-sm brand mt-xs">点击重试</Text>
        </View>
      ) : null}

      {course ? (
        <View>
          <Image className="cd-cover" src={course.coverUrl} mode="aspectFill" />

          <View className="card">
            <Text className="cd-title">{course.title}</Text>
            <Text className="cd-meta">
              {course.category} · {course.duration} · {course.lessonCount} 节 · {compactNumber(course.studentCount)} 人学过
            </Text>
            <View className="row-between mt-xs">
              {course.free ? <Text className="cd-price">免费</Text> : <Text className="cd-price">¥{course.price}</Text>}
              <Text className="tag tag-accent">{course.free ? '限时免费' : '讲师精选'}</Text>
            </View>

            <View className="divider" />

            <View className="cd-lecturer">
              <Image className="cd-lecturer__avatar" src={course.lecturer?.avatarUrl} mode="aspectFill" />
              <View className="flex-1">
                <Text className="cd-lecturer__name">{course.lecturer?.nickname ?? '讲师'}</Text>
                <Text className="cd-lecturer__bio">{course.lecturer?.bio ?? '大店实战讲师'}</Text>
              </View>
              <Text className="cd-follow" onClick={() => follow.mutate(!followed)}>
                {followed ? '已关注' : '+ 关注讲师'}
              </Text>
            </View>
          </View>

          <View className="card">
            <Text className="f-md bold">课程介绍</Text>
            <Text className="cd-intro">{course.intro}</Text>
          </View>

          <View className="card">
            <Text className="f-md bold">课程目录（{course.lessonCount} 节）</Text>
            {lessons.map((n) => (
              <View key={n} className="cd-lesson">
                <Text className="cd-lesson__title">
                  第 {n} 讲 · {course.title}（{n}）
                </Text>
                <Text className="cd-lesson__lock">{n === 1 ? '可试听' : '报名后解锁'}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {course ? (
        <View className="fixed-bottom">
          <View className="cd-buy">
            <View className="cd-buy__info">
              <Text>{course.free ? '免费课程' : `¥${course.price}`}</Text>
              <Text className="f-xs t3"> · 支持回放</Text>
            </View>
            <View
              className="cd-buy__btn"
              onClick={() =>
                Taro.showModal({
                  title: '报名确认',
                  content: `确认报名《${course.title}》？报名后可在「我的-课程」继续学习。`,
                  success: (res) => {
                    if (res.confirm) Taro.showToast({ title: '报名成功，请联系讲师', icon: 'success' });
                  },
                })
              }
            >
              <Text>{course.free ? '立即学习' : '立即报名'}</Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
