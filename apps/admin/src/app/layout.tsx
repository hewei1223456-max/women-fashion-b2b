import type { Metadata } from 'next';
import './globals.css';
import { ApiProvider } from '@/lib/api-context';
import { QueryProvider } from '@/lib/query-provider';

export const metadata: Metadata = {
  title: '女装B2B行业平台 · 运营后台',
  description: '内容复审、用户与认证管理、厂家加微看板、推荐策略可视化',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <QueryProvider>
          <ApiProvider>{children}</ApiProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
