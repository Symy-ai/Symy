'use client';

/**
 * 后台共享组件 — API 结果展示
 *
 * 统一展示 admin API 调用的请求参数 + 响应结果 / 错误。
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight } from 'lucide-react';

export interface ActionResult {
  action: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  params?: unknown;
  response?: unknown;
  error?: string | null;
  timestamp?: string;
  /** 执行耗时（毫秒） */
  duration?: number;
}

export function ResultDisplay({ result }: { result: ActionResult }) {
  const [expanded, setExpanded] = useState(false);

  if (result.status === 'idle') return null;

  const isSuccess = result.status === 'success';
  const isError = result.status === 'error';
  const isLoading = result.status === 'loading';

  return (
    <Card className={`mt-3 ${isError ? 'border-rose-500/40' : isSuccess ? 'border-emerald-500/30' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {isSuccess && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            {isError && <XCircle className="h-4 w-4 text-rose-600" />}
            <span>{result.action}</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            {result.timestamp && (
              <span className="text-[10px] text-muted-foreground">{result.timestamp}</span>
            )}
            {result.duration != null && !isLoading && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">
                {result.duration < 1000 ? `${result.duration}ms` : `${(result.duration / 1000).toFixed(1)}s`}
              </span>
            )}
            {isSuccess && <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">成功</Badge>}
            {isError && <Badge variant="destructive">失败</Badge>}
            {isLoading && <Badge variant="outline">执行中</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0 text-xs">
        {result.error && (
          <div className="rounded-md bg-rose-500/5 p-2 font-mono text-rose-600 dark:text-rose-300">
            {result.error}
          </div>
        )}
        {result.response !== undefined && result.response !== null && (
          <div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-muted-foreground"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <ChevronDown className="mr-1 h-3 w-3" /> : <ChevronRight className="mr-1 h-3 w-3" />}
                {expanded ? '收起' : '展开'}响应
              </Button>
              {expanded && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-muted-foreground"
                  onClick={() => {
                    const text = typeof result.response === 'string'
                      ? result.response
                      : JSON.stringify(result.response, null, 2);
                    navigator.clipboard?.writeText(text);
                  }}
                >
                  复制 JSON
                </Button>
              )}
            </div>
            {expanded && (
              <pre className="mt-1 max-h-80 overflow-auto rounded-md bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-300">
                {typeof result.response === 'string'
                  ? result.response
                  : JSON.stringify(result.response, null, 2)}
              </pre>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** 简洁的待开发占位 */
export function TodoPlaceholder({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/30">
        <svg className="h-8 w-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
        </svg>
      </div>
      <h2 className="mb-2 text-xl font-semibold">{title}</h2>
      {description && <p className="mb-4 max-w-md text-sm text-muted-foreground">{description}</p>}
      <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 px-3 py-1 text-amber-600">
        待开发 · Coming Soon
      </Badge>
    </div>
  );
}

/** 从任意值提取展示文本 */
export function safeStringify(v: unknown): string {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
  } catch {
    // safe to ignore: 循环引用或 BigInt 时 fallback 到 String()
    return String(v);
  }
}
