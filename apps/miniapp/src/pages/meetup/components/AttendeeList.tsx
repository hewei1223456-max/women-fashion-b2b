import { View, Text, Image } from '@tarojs/components';
import type { UserBrief } from '@wfb/shared-types';
import { clsx } from '@wfb/shared-utils';
import Badge from '@/components/Badge';
import { attendeeNoteOf, seatHint } from '../meetup-utils';
import ProgressBar from './ProgressBar';
import './AttendeeList.scss';

interface Props {
  attendees: UserBrief[];
  joinedCount: number;
  capacity: number;
  /** 发起人 id：在名单里给发起人单独标出来 */
  initiatorId?: number;
  /** 报名留言（Meetup.attendeeNotes） */
  notes?: { userId: number; note: string }[];
  /** 点某个人（预留：接入 TA 的主页后使用） */
  onUserClick?: (userId: number) => void;
  className?: string;
}

/**
 * 完整报名名单（闪动式）：
 *   头像 + 昵称 + 身份标识 + 报名留言（attendeeNotes 下发时展示），
 *   顶部给出「已报名 X/N · 还剩 Y 个名额」与进度条。
 */
export default function AttendeeList({ attendees, joinedCount, capacity, initiatorId, notes, onUserClick, className }: Props) {
  const list = attendees ?? [];
  const missing = Math.max(0, (joinedCount ?? 0) - list.length);

  return (
    <View className={clsx('mt-attendees', className)}>
      <ProgressBar joined={joinedCount ?? 0} capacity={capacity ?? 0} />

      {list.length ? (
        <View className="mt-attendees__grid row wrap">
          {list.map((a) => {
            const note = attendeeNoteOf(a, notes);
            const isInitiator = !!initiatorId && a.id === initiatorId;
            return (
              <View key={a.id} className="mt-attendees__item col-center" onClick={() => onUserClick?.(a.id)}>
                <View className="mt-attendees__avatar-wrap">
                  <Image className="mt-attendees__avatar" src={a.avatarUrl} mode="aspectFill" />
                  {isInitiator ? (
                    <View className="mt-attendees__crown">
                      <Text className="mt-attendees__crown-text">发起人</Text>
                    </View>
                  ) : null}
                </View>
                <Text className="mt-attendees__name f-xs t1 ellipsis">{a.nickname}</Text>
                <Badge user={a} size="xs" max={1} />
                {note ? <Text className="mt-attendees__note f-xs t3 ellipsis-2">{note}</Text> : null}
              </View>
            );
          })}
        </View>
      ) : (
        <Text className="mt-attendees__empty f-xs t3">还没有人报名，你可以是第一个。</Text>
      )}

      {missing > 0 ? <Text className="mt-attendees__more f-xs t3">另有 {missing} 位已报名同行者暂未展示</Text> : null}

      <Text className="mt-attendees__seat f-xs t3">
        {seatHint({ joinedCount: joinedCount ?? 0, capacity: capacity ?? 0 })}
        {capacity > 0 ? ` · 上限 ${capacity} 人` : ''}
      </Text>
    </View>
  );
}
