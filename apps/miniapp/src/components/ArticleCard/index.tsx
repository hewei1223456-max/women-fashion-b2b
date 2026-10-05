import type { ReactNode } from 'react';
import { View, Text, Image } from '@tarojs/components';
import type { ArticleSummary } from '@wfb/shared-types';
import { ARTICLE_TYPE_LABELS } from '@wfb/shared-types';
import { clsx, timeAgo } from '@wfb/shared-utils';
import Tag from '../Tag';
import StatBar from '../StatBar';
import { count } from '../utils';
import './index.scss';

interface Props {
  article: ArticleSummary;
  /** row：左文右图（列表）；cover：大图在上（推荐流） */
  layout?: 'row' | 'cover';
  /** 展示推荐理由气泡 */
  showReason?: boolean;
  onClick?: () => void;
  onUserClick?: (userId: number) => void;
  /** 右侧/底部自定义操作区 */
  footer?: ReactNode;
  className?: string;
}

/** 资讯卡片：封面 + 标题 + 作者 + 互动数 */
export default function ArticleCard({ article, layout = 'row', showReason, onClick, onUserClick, footer, className }: Props) {
  const typeLabel = ARTICLE_TYPE_LABELS[article.type] ?? '内容';
  const tags = (article.styleTags ?? []).slice(0, 3);

  return (
    <View className={clsx('article-card', `article-card--${layout}`, className)} onClick={onClick}>
      {layout === 'cover' ? (
        <View className="article-card__cover-wrap">
          <Image className="article-card__cover" src={article.coverUrl} mode="aspectFill" />
          <View className="article-card__badge">
            <Text className="article-card__badge-text">{typeLabel}</Text>
          </View>
        </View>
      ) : null}

      <View className={clsx('article-card__main', layout === 'row' && 'row')}>
        <View className="article-card__body col flex-1">
          <Text className="article-card__title bold t1 ellipsis-2">{article.title}</Text>
          {showReason && article.reason ? (
            <View className="article-card__reason">
              <Text className="article-card__reason-text f-xs">{article.reason}</Text>
            </View>
          ) : (
            <Text className="article-card__summary f-xs t3 ellipsis-2">{article.summary}</Text>
          )}
          <View className="article-card__tags row wrap">
            {layout === 'row' ? (
              <View className="tag tag-gray tag--plain">
                <Text>{typeLabel}</Text>
              </View>
            ) : null}
            {tags.map((t) => (
              <Tag key={t} styleTag={t} />
            ))}
          </View>
          <View className="article-card__foot row-between">
            <View className="row flex-1" onClick={() => onUserClick?.(article.author?.id ?? 0)}>
              <Image className="avatar avatar-sm article-card__avatar" src={article.author?.avatarUrl} mode="aspectFill" />
              <Text className="article-card__author f-xs t2 ellipsis">{article.author?.nickname ?? '匿名'}</Text>
              <Text className="article-card__dot f-xs t3">·</Text>
              <Text className="article-card__time f-xs t3">{timeAgo(article.createdAt)}</Text>
            </View>
            <StatBar show={['view', 'like', 'comment']} view={article.viewCount} like={article.likeCount} comment={article.commentCount} />
          </View>
          {footer}
        </View>

        {layout === 'row' ? (
          <View className="article-card__thumb-wrap">
            <Image className="article-card__thumb" src={article.coverUrl} mode="aspectFill" />
            {article.images?.length > 1 ? (
              <View className="article-card__thumb-count">
                <Text className="article-card__thumb-count-text">{count(article.images.length)} 图</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
