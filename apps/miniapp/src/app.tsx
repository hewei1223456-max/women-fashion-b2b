import { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLaunch } from '@tarojs/taro';
import { useAppStore } from '@/store/app';
import './app.scss';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function App({ children }: PropsWithChildren) {
  const bumpVisit = useAppStore((s) => s.bumpVisit);

  useLaunch(() => {
    // 冷启动计数：前 3 次访问走探索通道（推荐引擎 Phase 1 冷启动策略）
    bumpVisit();
  });

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export default App;
