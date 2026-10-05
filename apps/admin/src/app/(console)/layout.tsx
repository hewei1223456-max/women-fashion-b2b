import { AdminShell } from '@/components/AdminShell';

/** 已登录区域：统一挂侧边导航 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
