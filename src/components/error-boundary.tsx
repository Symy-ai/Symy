'use client';

import React from 'react';
import { useI18n } from '@/i18n/provider';
import { logger } from '@/lib/logger';

// Bug #14: 全局错误边界，防止单个组件崩溃导致整页白屏
// BUG-119 fix: "Try Again" increments resetKey to force remount of children
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  resetKey: number;
}

class ErrorBoundaryInner extends React.Component<ErrorBoundaryProps & { t: (key: string) => string }, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps & { t: (key: string) => string }) {
    super(props);
    this.state = { hasError: false, resetKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = () => {
    // BUG-119 fix: Increment resetKey to force children remount via key change.
    // The key only changes on client-side user interaction (clicking "Try Again"),
    // so it won't cause hydration mismatches during initial SSR/hydration (key starts at 0).
    this.setState((prev) => ({ hasError: false, error: undefined, resetKey: prev.resetKey + 1 }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { t } = this.props;

      return (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <p className="text-text-secondary text-sm font-medium">{t('errorBoundary.somethingWentWrong')}</p>
          <p className="text-text-tertiary text-xs mt-1 max-w-[240px]">
            {this.state.error?.message || t('errorBoundary.unexpectedError')}
          </p>
          <button
            onClick={this.handleReset}
            className="mt-4 px-4 py-2 rounded-xl bg-glass-fill-strong border border-glass-border text-text-secondary text-xs font-medium hover:bg-glass-hover transition-colors" // BUG-302 fix: 使用语义化 token
          >
            {t('common.tryAgain')}
          </button>
        </div>
      );
    }

    // BUG-119 fix: Use key to force remount of children after error recovery.
    // React.Fragment with key avoids adding extra DOM nodes while still
    // triggering unmount/remount of children when resetKey changes.
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}

// Wrapper that provides i18n to the class component
export function ErrorBoundary({ children, fallback }: ErrorBoundaryProps) {
  const { t } = useI18n();
  return <ErrorBoundaryInner t={t} fallback={fallback}>{children}</ErrorBoundaryInner>;
}
