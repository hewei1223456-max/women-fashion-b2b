import { View, Text, Image } from '@tarojs/components';
import type { Comment } from '@wfb/shared-types';
import { clsx, timeAgo } from '@wfb/shared-utils';
import MediaGrid from '../MediaGrid';
import Badge from '../Badge';
import './index.scss';

interface Props {
  comment: Comment;
  /** 最多内联展示的二级回复条数 */
  maxReplies?: number;
  /** 是否为二级回复（缩进、去掉头像） */
  isReply?: boolean;
  /** 当前用户可删除 */
  canDelete?: boolean;
  /** 身份标识最多展示几个 */
  maxBadges?: number;
  onLike?: (comment: Comment) => void;
  onReply?: (comment: Comment) => void;
  onDelete?: (comment: Comment) => void;
  onUserClick?: (userId: number) => void;
  className?: string;
}

/** 评论项：头像 + 昵称 + 身份标识 + 内容，支持二级回复内联展示 */
export default function CommentItem({
  comment,
  maxReplies = 3,
  isReply,
  canDelete,
  maxBadges = 2,
  onLike,
  onReply,
  onDelete,
  onUserClick,
  className,
}: Props) {
  const replies = comment.replies ?? [];
  const shown = replies.slice(0, maxReplies);

  const head = (
    <View className="comment-item__head row-between">
      <View className="row flex-1" onClick={() => onUserClick?.(comment.userId)}>
        <Image className={clsx(isReply ? 'avatar avatar-sm' : 'avatar', 'comment-item__avatar')} src={comment.user.avatarUrl} mode="aspectFill" />
        <View className="col">
          <View className="row comment-item__name-row">
            <Text className="comment-item__name f-sm bold t1">{comment.user.nickname}</Text>
            <Badge user={comment.user} max={maxBadges} size="xs" />
          </View>
          <Text className="comment-item__time f-xs t3">{timeAgo(comment.createdAt)}</Text>
        </View>
      </View>
      {canDelete ? (
        <Text className="comment-item__delete f-xs t3" onClick={() => onDelete?.(comment)}>
          删除
        </Text>
      ) : null}
    </View>
  );

  const body = (
    <View className="comment-item__body">
      <Text className="comment-item__content f-sm t1">{comment.content}</Text>
      {comment.images?.length ? <MediaGrid images={comment.images} max={3} /> : null}
      <View className="comment-item__actions row">
        <View className="comment-item__action row" onClick={() => onLike?.(comment)}>
          <Text className={clsx('comment-item__action-icon', comment.liked && 'is-liked')}>{comment.liked ? '❤️' : '🤍'}</Text>
          <Text className="comment-item__action-text f-xs t3">{comment.likeCount || ''}</Text>
        </View>
        <View className="comment-item__action row" onClick={() => onReply?.(comment)}>
          <Text className="comment-item__action-icon">💬</Text>
          <Text className="comment-item__action-text f-xs t3">回复</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View className={clsx('comment-item', isReply && 'comment-item--reply', className)}>
      {head}
      {body}
      {shown.length ? (
        <View className="comment-item__replies">
          {shown.map((r) => (
            <CommentItem
              key={r.id}
              comment={r}
              isReply
              canDelete={canDelete}
              maxBadges={maxBadges}
              onLike={onLike}
              onReply={onReply}
              onDelete={onDelete}
              onUserClick={onUserClick}
            />
          ))}
          {replies.length > shown.length ? <Text className="comment-item__more f-xs t3">共 {replies.length} 条回复</Text> : null}
        </View>
      ) : null}
    </View>
  );
}
