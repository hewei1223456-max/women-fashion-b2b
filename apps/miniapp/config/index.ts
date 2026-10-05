import path from 'node:path';
import { defineConfig, type UserConfigExport } from '@tarojs/cli';

/**
 * 女装B2B行业平台 · Taro 4.3 多端配置
 * 一套代码编译：微信小程序 / 抖音小程序 / 支付宝小程序 / H5（PC Web + 移动 H5）
 */
export default defineConfig<'webpack5'>(async (merge) => {
  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'women-fashion-b2b',
    date: '2026-10-05',
    designWidth: 750,
    deviceRatio: { 640: 2.34 / 2, 750: 1, 828: 1.81 / 2 },
    sourceRoot: 'src',
    outputRoot: `dist/${process.env.TARO_ENV}`,
    plugins: ['@tarojs/plugin-html'],
    defineConstants: {
      // 各端可通过该常量拿到后端地址；H5 默认同源 3000 端口
      'process.env.TARO_APP_API': JSON.stringify(process.env.TARO_APP_API || ''),
    },
    alias: {
      '@': path.resolve(__dirname, '..', 'src'),
    },
    copy: { patterns: [], options: {} },
    framework: 'react',
    compiler: { type: 'webpack5', prebundle: { enable: false } },
    cache: { enable: false },
    mini: {
      postcss: {
        pxtransform: { enable: true, config: {} },
        cssModules: { enable: false },
      },
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      output: { filename: 'js/[name].[hash:8].js', chunkFilename: 'js/[name].[chunkhash:8].js' },
      miniCssExtractPluginOption: { ignoreOrder: true, filename: 'css/[name].[hash].css', chunkFilename: 'css/[name].[chunkhash].css' },
      postcss: {
        autoprefixer: { enable: true, config: {} },
        cssModules: { enable: false },
      },
      // PC Web / H5 演示入口：直接用 dist/h5 静态目录即可
      devServer: {
        port: 10086,
        host: '0.0.0.0',
        allowedHosts: 'all',
        proxy: {
          '/api': { target: process.env.TARO_APP_API_PROXY || 'http://localhost:3000', changeOrigin: true },
          '/uploads': { target: process.env.TARO_APP_API_PROXY || 'http://localhost:3000', changeOrigin: true },
        },
      },
    },
  };

  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, require('./dev').default);
  }
  return merge({}, baseConfig, require('./prod').default);
});
