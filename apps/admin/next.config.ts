import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // workspace 内的 TS 包（@wfb/shared-*）需要参与编译
  transpilePackages: ['@wfb/shared-api', '@wfb/shared-types', '@wfb/shared-utils'],
  typescript: { ignoreBuildErrors: false },
  async rewrites() {
    // 浏览器直连后端 3100，避免开发期跨域配置
    const api = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3100';
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
};

export default nextConfig;
