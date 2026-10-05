import type { CollectDto, CommentDto, FollowDto, LikeDto, ShareDto, TargetType } from '@wfb/shared-types';
import type { Router } from '../../core/server';
import type { Store } from '../../core/db';
import {
  collectTarget,
  createComment,
  deleteComment,
  followUser,
  likeTarget,
  listComments,
  listLikes,
  shareTarget,
  uncollectTarget,
  unfollowUser,
  unlikeTarget,
} from './service';

/* =========================================================================
 * 互动组件模块（docs/API.md 第 9 节）：点赞 / 评论 / 收藏 / 转发 / 关注
 * 全部写操作幂等：重复点赞不重复计数，重复取消不出现负数。
 * ========================================================================= */

const likeDtoOf = (ctx: import('../../core/server').Ctx): LikeDto => ({
  targetType: ctx.str('targetType', { required: true }) as TargetType,
  targetId: ctx.num('targetId', { required: true }),
});

const collectDtoOf = (ctx: import('../../core/server').Ctx): CollectDto => ({
  targetType: ctx.str('targetType', { required: true }) as CollectDto['targetType'],
  targetId: ctx.num('targetId', { required: true }),
  folderName: ctx.str('folderName') || undefined,
});

const commentDtoOf = (ctx: import('../../core/server').Ctx): CommentDto => ({
  targetType: ctx.str('targetType', { required: true }) as TargetType,
  targetId: ctx.num('targetId', { required: true }),
  content: ctx.str('content', { required: true, max: 500 }),
  images: ctx.arr<string>('images'),
  parentId: ctx.num('parentId') || undefined,
  mentions: ctx.arr<string>('mentions').map((m) => Number(m)).filter((n) => Number.isFinite(n) && n > 0),
});

export function registerInteractionModule(router: Router, store: Store) {
  router.post('/api/interaction/like', (ctx) => likeTarget(store, ctx.auth(), likeDtoOf(ctx)), {
    summary: '点赞（文章/款/评论，幂等）',
  });

  router.del('/api/interaction/like', (ctx) => unlikeTarget(store, ctx.auth(), likeDtoOf(ctx)), {
    summary: '取消点赞（幂等）',
  });

  router.post('/api/interaction/comment', (ctx) => createComment(store, ctx.auth(), commentDtoOf(ctx)), {
    summary: '评论 / 回复（parentId / images / mentions）',
  });

  router.del('/api/interaction/comment/:id', (ctx) => deleteComment(store, ctx.auth(), ctx.num('id', { required: true })), {
    summary: '删除评论（连带二级回复）',
  });

  router.get(
    '/api/interaction/comments/:type/:id',
    (ctx) => {
      const { page, pageSize } = ctx.pagination(20);
      return listComments(store, ctx.auth().id, ctx.str('type'), ctx.num('id', { required: true }), {
        sort: ctx.str('sort'),
        page,
        pageSize,
      });
    },
    { summary: '评论列表（sort=hot|time，二级回复内联）' },
  );

  router.post('/api/interaction/collect', (ctx) => collectTarget(store, ctx.auth(), collectDtoOf(ctx)), {
    summary: '收藏（支持 folderName，幂等）',
  });

  router.del('/api/interaction/collect', (ctx) => uncollectTarget(store, ctx.auth(), collectDtoOf(ctx)), {
    summary: '取消收藏（幂等）',
  });

  router.post(
    '/api/interaction/share',
    (ctx) =>
      shareTarget(store, ctx.auth(), {
        targetType: ctx.str('targetType', { required: true }) as ShareDto['targetType'],
        targetId: ctx.num('targetId', { required: true }),
        channel: ctx.str('channel', { required: true }) as ShareDto['channel'],
      }),
    { summary: '转发记录（channel=wechat|moments|group|link）' },
  );

  router.post('/api/interaction/follow', (ctx) => followUser(store, ctx.auth(), ctx.num('userId', { required: true })), {
    summary: '关注（幂等）',
  });

  router.del('/api/interaction/follow', (ctx) => unfollowUser(store, ctx.auth(), ctx.num('userId', { required: true })), {
    summary: '取消关注（幂等）',
  });

  router.get(
    '/api/interaction/likes/:type/:id',
    (ctx) => {
      const { page, pageSize } = ctx.pagination(20);
      return listLikes(store, ctx.auth().id, ctx.str('type'), ctx.num('id', { required: true }), { page, pageSize });
    },
    { summary: '点赞列表（UserBrief）' },
  );
}
