import type { Router } from '../../core/server';
import type { Store } from '../../core/db';
import { getMeetup, listMeetups, createMeetup, joinMeetup, quitMeetup, myMeetups, validateMeetupInput } from './service';

/**
 * 组局模块（参考「闪动」）
 *
 * 用户诉求：组局要有**时间、地点、集合地点、报名方式、报名条件**，
 * 这是它与「拼单」最大的区别 —— 拼单只凑量，组局是线下一起行动。
 * 发布组局时会同步往资讯流写一条内容，让组局也能被首页推荐到。
 */
export function registerMeetupModule(router: Router, store: Store) {
  router.get(
    '/api/meetup/list',
    (ctx) => {
      const { page, pageSize } = ctx.pagination(10);
      return listMeetups(store, {
        kind: ctx.str('kind') || undefined,
        city: ctx.str('city') || undefined,
        status: ctx.str('status') || undefined,
        page,
        pageSize,
        viewerId: ctx.user?.id,
      });
    },
    { auth: false, summary: '组局列表（按类型/城市/状态筛选）' },
  );

  router.get(
    '/api/meetup/detail/:id',
    (ctx) => {
      const id = ctx.num('id', { required: true });
      const meetup = getMeetup(store, id, ctx.user?.id);
      const row = store.meetups.get(id);
      const article = row?.articleId ? store.articles.get(row.articleId) : undefined;
      return {
        ...meetup,
        article: article
          ? {
              id: article.id,
              title: article.title,
              summary: article.summary,
              coverUrl: article.coverUrl,
              contentType: article.contentType,
              type: article.type,
              styleTags: article.styleTags,
              topics: article.topics,
              images: article.images,
              viewCount: article.viewCount,
              likeCount: article.likeCount,
              collectCount: article.collectCount,
              commentCount: article.commentCount,
              cesScore: article.cesScore,
              visibility: article.visibility,
              auditStatus: article.auditStatus,
              createdAt: article.createdAt,
            }
          : undefined,
      };
    },
    { auth: false, summary: '组局详情（含关联资讯）' },
  );

  router.post(
    '/api/meetup/create',
    (ctx) => {
      const user = ctx.auth();
      const input = validateMeetupInput({
        kind: ctx.str('kind', { required: true }),
        title: ctx.str('title', { required: true, max: 50 }),
        description: ctx.str('description'),
        city: ctx.str('city', { required: true }),
        venue: ctx.str('venue', { required: true }),
        gatheringPoint: ctx.str('gatheringPoint', { required: true }),
        startAt: ctx.str('startAt', { required: true }),
        endAt: ctx.str('endAt', { required: true }),
        signupMethod: ctx.str('signupMethod', { required: true }),
        signupRequirement: ctx.str('signupRequirement', { required: true }),
        capacity: ctx.num('capacity', { fallback: 0, min: 0, max: 10000 }),
        fee: ctx.str('fee') || undefined,
        productId: ctx.num('productId', { fallback: 0 }) || undefined,
        market: ctx.str('market') || undefined,
        styleTags: ctx.arr('styleTags'),
        targetAudience: ctx.str('targetAudience') || undefined,
        coverUrl: ctx.str('coverUrl') || undefined,
        publishToFeed: ctx.bool('publishToFeed', true),
      });
      return createMeetup(store, user, input);
    },
    { summary: '发起组局（同时发一条资讯流内容）' },
  );

  router.post(
    '/api/meetup/join/:id',
    (ctx) => joinMeetup(store, ctx.auth(), ctx.num('id', { required: true })),
    { summary: '报名组局' },
  );

  router.post(
    '/api/meetup/quit/:id',
    (ctx) => quitMeetup(store, ctx.auth(), ctx.num('id', { required: true })),
    { summary: '取消报名' },
  );

  router.get(
    '/api/meetup/mine',
    (ctx) => {
      const { page, pageSize } = ctx.pagination(10);
      return myMeetups(store, ctx.auth().id, page, pageSize);
    },
    { summary: '我发起的 / 我报名的组局' },
  );
}
