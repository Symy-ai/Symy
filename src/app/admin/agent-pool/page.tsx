'use client';

/**
 * Agent Pool 管理页
 *
 * GET  /api/admin/agent-pool — 查看池子状态
 * POST /api/admin/agent-pool — 手动 refill (可选 body: {setPoolSize: N})
 *
 * 后端已迁移到 verifyAdminAuth（支持 Authorization: Bearer），
 * 前端统一用 adminGet/adminPost，不再需要单独的 x-admin-api-key 封装。
 */

import { useEffect, useState } from 'react';
import { adminGet, adminPost } from '@/lib/admin-panel/api-client';
import type { AgentPoolStatus } from '@/lib/admin-panel/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ResultDisplay, type ActionResult } from '@/components/admin-panel/result-display';
import { Layers, RefreshCw, Zap, Settings2 } from 'lucide-react';

export default function AdminAgentPoolPage() {
  const [status, setStatus] = useState<AgentPoolStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [poolSize, setPoolSize] = useState('');
  const [refillResult, setRefillResult] = useState<ActionResult>({ action: 'refill', status: 'idle' });
  const [setSizeResult, setSetSizeResult] = useState<ActionResult>({ action: 'set_pool_size', status: 'idle' });

  async function loadStatus(silent = false) {
    if (!silent) setLoading(true);
    const res = await adminGet<AgentPoolStatus>('/api/admin/agent-pool');
    if (res.ok && res.data) {
      setStatus(res.data);
      setPoolSize(String(res.data.poolSize ?? ''));
    } else if (!silent) {
      setStatus(null);
    }
    if (!silent) setLoading(false);
  }

  useEffect(() => {
    loadStatus();
    // 自动刷新：每 30 秒（池子状态变化快）
    const interval = setInterval(() => loadStatus(true), 30_000);
    return () => clearInterval(interval);
  }, []);

  async function refill() {
    setRefillResult({ action: 'refill', status: 'loading' });
    const res = await adminPost<unknown>('/api/admin/agent-pool');
    setRefillResult({
      action: 'refill',
      status: res.ok ? 'success' : 'error',
      response: res.data,
      error: res.error,
      timestamp: new Date().toLocaleTimeString(),
    });
    loadStatus();
  }

  async function setPoolSizeAction() {
    const n = Number(poolSize);
    if (!Number.isFinite(n) || n < 0) {
      setSetSizeResult({ action: 'set_pool_size', status: 'error', error: '请输入有效数字 (≥0)', timestamp: new Date().toLocaleTimeString() });
      return;
    }
    setSetSizeResult({ action: 'set_pool_size', status: 'loading' });
    const res = await adminPost<unknown>('/api/admin/agent-pool', { setPoolSize: Math.round(n) });
    setSetSizeResult({
      action: 'set_pool_size',
      status: res.ok ? 'success' : 'error',
      response: res.data,
      error: res.error,
      timestamp: new Date().toLocaleTimeString(),
    });
    loadStatus();
  }

  const available = status?.available ?? 0;
  const assigned = status?.assigned ?? 0;
  const total = available + assigned; // 后端无 total 字段，available+assigned 即总数
  const currentSize = status?.poolSize ?? 0;
  const creating = status?.creating ?? 0;
  const failed = status?.failed ?? 0;
  const healthPct = currentSize > 0 ? Math.round((available / currentSize) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Agent Pool</h2>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            Letta per-user agent 预热池 · 高可用保障
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-600">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              每 30s 自动刷新
            </span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadStatus()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新状态
        </Button>
      </div>

      {/* 状态卡片 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>可用 Agent</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold text-emerald-600">{available}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>已分配</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold text-violet-600">{assigned}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>总数（可用+已分配）</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold">{total}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pool Size（目标）</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold text-sky-600">{currentSize}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>创建中 / 失败</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="flex items-center gap-2 text-2xl font-bold">
                <span className="text-amber-600">{creating}</span>
                <span className="text-muted-foreground">/</span>
                <span className={failed > 0 ? 'text-rose-600' : 'text-muted-foreground'}>{failed}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 健康度 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4" />
            池子健康度
          </CardTitle>
          <CardDescription>available / poolSize</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-6 w-full" />
          ) : (
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span>{available} / {currentSize}</span>
                <Badge variant={healthPct >= 80 ? 'outline' : 'destructive'} className={healthPct >= 80 ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' : ''}>
                  {healthPct >= 80 ? '健康' : healthPct >= 40 ? '紧张' : '危险'}
                </Badge>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full transition-all ${healthPct >= 80 ? 'bg-emerald-500' : healthPct >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                  style={{ width: `${healthPct}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 最近活动 */}
      {status && !loading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">最近活动</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 text-xs sm:grid-cols-3">
              <ActivityField label="上次 Cron 检查" value={status.lastCronCheck} />
              <ActivityField label="上次 Refill" value={status.lastRefillAt} />
              <ActivityField label="上次翻倍 Pool Size" value={status.lastDoubledAt} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* 操作 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-amber-600" />
              手动 Refill
            </CardTitle>
            <CardDescription>POST /api/admin/agent-pool · 触发 checkAndRefill</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" onClick={refill} disabled={refillResult.status === 'loading'}>
              <Zap className="mr-2 h-3.5 w-3.5" />
              立即补充
            </Button>
            <ResultDisplay result={refillResult} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-4 w-4 text-sky-600" />
              设置 Pool Size
            </CardTitle>
            <CardDescription>POST body: {`{ setPoolSize: N }`}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor="pool-size" className="text-xs">Pool Size</Label>
                <Input
                  id="pool-size"
                  type="number"
                  min={0}
                  value={poolSize}
                  onChange={(e) => setPoolSize(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <Button size="sm" onClick={setPoolSizeAction} disabled={setSizeResult.status === 'loading'}>
                应用
              </Button>
            </div>
            <ResultDisplay result={setSizeResult} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ActivityField({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return (
      <div className="rounded-md border p-2.5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-sm text-muted-foreground">从未</div>
      </div>
    );
  }
  const date = new Date(value);
  const relative = getRelativeTime(date);
  return (
    <div className="rounded-md border p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium" title={value}>{relative}</div>
      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
        {date.toLocaleString('zh-CN', { hour12: false })}
      </div>
    </div>
  );
}

function getRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return date.toLocaleDateString('zh-CN');
}
