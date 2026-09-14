/**
 * 后台管理系统 — 侧边栏导航配置
 */

import {
  LayoutDashboard,
  Bot,
  Sparkles,
  Database,
  ScrollText,
  Layers,
  Trophy,
  Users,
  Settings,
  Crown,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** 是否待开发（显示徽标） */
  todo?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: '概览',
    items: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'AI 与 Agent',
    items: [
      { href: '/admin/letta', label: 'Letta Agent', icon: Bot },
      { href: '/admin/agent-pool', label: 'Agent Pool', icon: Layers },
      { href: '/admin/cultivation', label: '修身阶段', icon: Sparkles },
      { href: '/admin/embeddings', label: 'RAG 向量库', icon: Database },
    ],
  },
  {
    title: '运营',
    items: [
      { href: '/admin/audit', label: '审计日志', icon: ScrollText },
      { href: '/admin/challenges', label: '每周挑战', icon: Trophy },
      { href: '/admin/vip', label: 'VIP 管理', icon: Crown },
    ],
  },
  {
    title: '其他',
    items: [
      { href: '/admin/users', label: '用户管理', icon: Users },
      { href: '/admin/settings', label: '系统设置', icon: Settings },
    ],
  },
];
