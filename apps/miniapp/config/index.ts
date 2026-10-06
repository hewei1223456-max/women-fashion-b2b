import path from 'node:path';
import { defineConfig, type UserConfigExport } from '@tarojs/cli';

/**
 * Taro 运行时（H5BaseConfig.setMinimizer）会读取 `h5.terser`，
 * 但公开的 `IH5Config` 类型没有声明该字段，因此在这里补一个最小声明，
 * 避免为了绕过类型检查而把整个 h5 配置断言成 any（那样会丢掉其余字段的校验）。
 */
interface H5TerserOverride {
  terser: {
    enable: boolean;
    config: Record<string, unknown>;
  };
}

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
      /**
       * 小程序端多页面共享组件样式时的「Conflicting order」是噪声告警：
       * 退出码仍为 0、产物正常，但会淹没真正的错误，所以在 mini 侧也关掉。
       * （H5 侧在 h5.miniCssExtractPluginOption 已设同样的 ignoreOrder）
       */
      miniCssExtractPluginOption: { ignoreOrder: true },
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      /**
       * 注意：不要覆盖 output.filename / chunkFilename。
       * Taro 4.3 的 H5 入口同时包含 `app` 与 `app-origin` 两个 chunk，
       * 一旦自定义 filename（即便写成 '[name].[hash:8].js'），
       * HtmlWebpackPlugin 会因为匹配不到唯一 chunk 而**静默不产出 index.html**，
       * 表现为「Compiled successfully 但 dist/h5 只有 css/ 与 js/」。
       * 结论：保留 Taro 默认值，仅保留 ignoreOrder（解决多页样式顺序告警）。
       */
      miniCssExtractPluginOption: { ignoreOrder: true },
      /**
       * ⚠️ 必须覆盖 Taro 的默认 terser 输出选项。
       *
       * Taro 4.3 的 H5BaseConfig 默认给 terser 传：
       *   output: { comments:false, keep_quoted_props:true, quote_keys:true, beautify:false }
       * 当前安装的 terser@5.51.2 在 quote_keys:true 下会把 **类私有字段名** 也加上引号：
       *   class A { #d }  →  class A { #"d" }   ← 非法语法
       * 而 @tanstack/query-core 大量使用 #private 字段，于是 dist/h5 的 JS
       * 在浏览器里解析就抛 SyntaxError，整个 H5 应用起不来
       * （build 仍然 "Compiled successfully"，属于静默产出坏产物）。
       *
       * 关闭这两个选项即可恢复合法输出（小程序端不受影响，无需修改 mini 配置）。
       * 回归脚本：node --check apps/miniapp/dist/h5/js/app.js
       *
       * 类型说明：Taro 运行时 setMinimizer 确实读取 `h5.terser`，
       * 但 `IH5Config` 未声明该字段，故此处做一次显式断言（不能用 any 之外的松散写法，
       * 否则会丢失其余配置的类型检查）。
       */
      ...({
        terser: {
          enable: true,
          config: {
            keep_fnames: true,
            warnings: false,
            output: { comments: false, keep_quoted_props: false, quote_keys: false, beautify: false },
          },
        },
      } as H5TerserOverride),
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
          // 本机 3000 端口被其它服务（one-api）占用，本项目后端统一用 3100
          '/api': { target: process.env.TARO_APP_API_PROXY || 'http://localhost:3100', changeOrigin: true },
          '/uploads': { target: process.env.TARO_APP_API_PROXY || 'http://localhost:3100', changeOrigin: true },
        },
      },
    },
  };

  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, require('./dev').default);
  }
  return merge({}, baseConfig, require('./prod').default);
});
