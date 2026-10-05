import type { UserConfigExport } from '@tarojs/cli';

export default {
  mini: {},
  h5: {
    /** 生产构建如需分析包体积，打开下列配置 */
    // webpackChain(chain) {
    //   chain.plugin('analyzer').use(require('webpack-bundle-analyzer').BundleAnalyzerPlugin, [])
    // },
  },
} satisfies UserConfigExport<'webpack5'>;
