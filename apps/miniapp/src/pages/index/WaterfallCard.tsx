import { View, Text, Image } from '@tarojs/components';
import type { ArticleSummary } from '@wfb/shared-types';
import { compactNumber } from '@wfb/shared-utils';
import Badge from '@/components/Badge';
import { coverPaddingOf } from '@/components/Waterfall/ratio';
import { meetupDateTime, seatText } from '@/pages/meetup/meetup-utils';
import './WaterfallCard.scss';

/* =========================================================================
 * 小红书式瀑布流卡片（双列里的一格）
 *
 * 结构：封面图（原始宽高比）→ 标题（≤2 行）→ 作者行（头像+昵称+身份标识）→ 点赞数
 * 类型差异：
 *   review  标题上方 ★ 星级 + 会再拿 / 不再拿
 *   meetup  标题下方时间 / 地点 / 已报名 三个紧凑标记（完整线下要素在详情页）
 *   rant    封面左上角「吐槽」角标
 *   video   封面右上角播放角标（有视频时长时一并显示）
 *
 * 性能：整卡只用 View/Text/Image，唯一阴影都省掉（用 1px 描边），不挂动画；
 *       封面高度用 padding-top 百分比占位，图片加载完不会撑开卡片（CLS=0）。
 * ========================================================================= */

/** 视频时长：契约暂未定义，后端下发 videoDuration/duration 时直接显示，没有就只显示播放角标 */
type VideoRow = ArticleSummary & { videoDuration?: string | number; duration?: string | number };

function videoDurationOf(article: ArticleSummary): string {
  const row = article as VideoRow;
  const raw = row.videoDuration ?? row.duration;
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    const minutes = Math.floor(raw / 60);
    const seconds = Math.round(raw % 60);
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
  return String(raw);
}

export interface WaterfallCardProps {
  article: ArticleSummary;
  onClick?: () => void;
  onUserClick?: (userId: number) => void;
}

export default function WaterfallCard({ article, onClick, onUserClick }: WaterfallCardProps) {
  const cover = article.images?.[0] || article.coverUrl;
  const meetup = article.meetup;
  const isReview = article.contentType === 'review';
  const isRant = article.contentType === 'rant';
  const isMeetup = article.contentType === 'meetup' && !!meetup;
  const isVideo = article.contentType === 'video' || !!article.videoUrl;
  const duration = isVideo ? videoDurationOf(article) : '';
  const stars = isReview && article.rating ? Math.max(1, Math.min(5, Math.round(article.rating))) : 0;
  const imageCount = article.images?.length ?? 0;

  return (
    <View className="wfc" onClick={onClick}>
      {/* 封面：padding-top 百分比 = 原始高宽比，图片按 aspectFill 填满同比例容器 → 不裁切、不跳动 */}
      <View className="wfc__cover-wrap" style={{ paddingTop: coverPaddingOf(cover) }}>
        <Image className="wfc__cover" src={cover} mode="aspectFill" lazyLoad />
        {isRant ? <Text className="wfc__corner wfc__corner--rant">吐槽</Text> : null}
        {isMeetup ? <Text className="wfc__corner wfc__corner--meetup">组局</Text> : null}
        {isVideo ? (
          <View className="wfc__play">
            <Text className="wfc__play-icon">▶</Text>
          </View>
        ) : null}
        {duration ? <Text className="wfc__duration">{duration}</Text> : null}
        {!isVideo && imageCount > 1 ? <Text className="wfc__count">{imageCount} 图</Text> : null}
      </View>

      <View className="wfc__body">
        {isReview && stars ? (
          <View className="wfc__review row">
            <Text className="wfc__stars">
              {'★'.repeat(stars)}
              {'☆'.repeat(5 - stars)}
            </Text>
            {article.wouldRebuy !== undefined ? (
              <Text className={`wfc__rebuy ${article.wouldRebuy ? 'is-on' : ''}`}>{article.wouldRebuy ? '会再拿' : '不再拿'}</Text>
            ) : null}
          </View>
        ) : null}

        <Text className="wfc__title">{article.title}</Text>

        {isMeetup && meetup ? (
          <View className="wfc__meetup">
            <Text className="wfc__meetup-line ellipsis">🕐 {meetupDateTime(meetup.startAt)}</Text>
            <Text className="wfc__meetup-line ellipsis">📍 {[meetup.city, meetup.venue].filter(Boolean).join(' · ')}</Text>
            <Text className="wfc__meetup-line ellipsis">🙋 {seatText(meetup)}</Text>
          </View>
        ) : null}

        <View className="wfc__foot row-between">
          <View
            className="row flex-1 wfc__author"
            onClick={(e) => {
              e.stopPropagation();
              onUserClick?.(article.author?.id ?? 0);
            }}
          >
            <Image className="wfc__avatar" src={article.author?.avatarUrl} mode="aspectFill" lazyLoad />
            <Text className="wfc__name ellipsis">{article.author?.nickname ?? '匿名同行'}</Text>
            {article.author ? <Badge user={article.author} size="xs" max={1} /> : null}
          </View>
          <View className="row wfc__like">
            <Text className="wfc__like-icon">{article.liked ? '❤️' : '🤍'}</Text>
            <Text className="wfc__like-count">{compactNumber(article.likeCount ?? 0)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
