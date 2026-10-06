export default defineAppConfig({
  /**
   * 主包：资讯首页 + 4 个 tab 页 + 登录
   * 其余页面尽量下沉到分包；源码目录必须与分包 root 一致（Taro 按 `src/<root>/<page>` 解析）。
   *
   * 注意：微信规定「主包页面不能位于分包 root 目录内」，
   * 因此 pages/source、pages/tools、pages/profile、pages/auth 这些
   * 含主包页面的目录只能留在主包（pages/source/index、pages/tools/index、
   * pages/profile/index、pages/auth/login 都在其中）。
   */
  pages: [
    'pages/index/index',
    'pages/source/index',
    'pages/tools/index',
    'pages/profile/index',
    'pages/auth/login',
    'pages/auth/certify',
    // 登录后引导：基础信息 → 营业执照 → 滑块验证 → 偏好四选（任务 task-7 提供页面）
    'pages/auth/onboarding',
    'pages/profile/edit',
    'pages/profile/settings',
    'pages/profile/collection',
    // 货源板块二级页
    'pages/source/detail',
    'pages/source/search',
    'pages/source/groupbuy',
    'pages/source/groupbuy-create',
    'pages/source/groupbuy-detail',
    'pages/source/ordering-fair',
    'pages/source/manufacturer',
    // 功能板块 10 个工具页
    'pages/tools/rewrite',
    'pages/tools/watermark',
    'pages/tools/trending',
    'pages/tools/account-analysis',
    'pages/tools/account-diagnosis',
    'pages/tools/teleprompter',
    'pages/tools/ai-image',
    'pages/tools/video-edit',
    'pages/tools/remove-bg',
    'pages/tools/operation-advice',
  ],

  subPackages: [
    {
      root: 'pages/info',
      name: 'info',
      pages: ['detail', 'distillation', 'course', 'course-detail'],
    },
    {
      root: 'pages/content',
      name: 'content',
      pages: ['publish', 'publish-success', 'draft', 'my-content', 'content-manage', 'content-analytics', 'comment-manage'],
    },
    {
      root: 'pages/interaction',
      name: 'interaction',
      pages: ['message-center', 'conversation', 'comment-list', 'like-list', 'follower-list'],
    },
    {
      root: 'pages/topic',
      name: 'topic',
      pages: ['index', 'detail'],
    },
    {
      root: 'pages/landmark',
      name: 'landmark',
      pages: ['list', 'detail'],
    },
    {
      root: 'pages/meetup',
      name: 'meetup',
      pages: ['list', 'detail', 'create'],
    },
    {
      root: 'pages/manufacturer',
      name: 'manufacturer',
      pages: ['admin', 'publish', 'contact-list', 'sub-account', 'workbench'],
    },
  ],

  /** 进入资讯首页后预下载资讯 / 组局分包，减少点击「资讯」「组局」时的等待 */
  preloadRule: {
    'pages/index/index': {
      network: 'all',
      packages: ['pages/info', 'pages/meetup'],
    },
  },

  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: '女装B2B',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f5f6f8',
  },
  // 小程序端不启用原生 tabBar，使用自定义 TabBar 组件保证三端一致
  permission: {
    'scope.userLocation': {
      desc: '用于展示附近的厂家、大店与订货会',
    },
  },
  requiredPrivateInfos: ['getLocation'],
});
