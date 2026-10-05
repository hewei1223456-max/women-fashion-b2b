export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/source/index',
    'pages/tools/index',
    'pages/profile/index',
  ],
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
