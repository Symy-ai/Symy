/**
 * ToastNotification — 顶部 Toast 提示（从 monitor-tab.tsx 抽出，C3 拆分）
 *
 * 🔧 ARCH fix (Round 13 BUG-2 — 删除 ref+empty deps 反模式):
 *    旧代码: useRef(onDismiss) + useEffect([], []) 绕过父组件每秒重渲染
 *    根因修复: 用 React.memo + onDismiss 用 useCallback (父组件保证 stable ref)
 *    → useEffect([onDismiss]) 自然只跑一次 (onDismiss 引用不变)
 *    → 删除 ref 镜像, 回归 React 单一数据源
 *
 *    父组件 (monitor-tab.tsx) 需保证 onDismiss 是 useCallback (见下方调用处)。
 */

'use client';

import { memo, useEffect } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ToastNotificationProps } from './types';

export const ToastNotification = memo(function ToastNotification({ toast, onDismiss }: ToastNotificationProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className={`fixed top-16 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg backdrop-blur-sm animate-in slide-in-from-top fade-in duration-300 ${
        toast.type === 'success'
          ? 'bg-green-500/90 text-white'
          : 'bg-glass-fill-strong text-text-secondary'
      }`}
    >
      {toast.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
      {toast.type === 'info' && <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
      {toast.message}
    </div>
  );
});
