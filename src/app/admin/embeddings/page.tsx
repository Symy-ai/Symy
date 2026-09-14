'use client';

/**
 * RAG 向量库管理页
 *
 * GET  /api/admin/embeddings?action=stats                       — 向量库统计
 * GET  /api/admin/embeddings?action=user_stats&user_id=UUID     — 单用户统计
 * POST /api/admin/embeddings?action=backfill_user&user_id=UUID  — 回填单用户
 * POST /api/admin/embeddings?action=backfill_all                — 回填全部 ⚠️
 * GET  /api/admin/embeddings/test                               — Embedding API 连通测试
 */

import { useState, type FormEvent } from 'react';
import { adminGet, adminPost } from '@/lib/admin-panel/api-client';
import type { EmbeddingStats } from '@/lib/admin-panel/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ResultDisplay, type ActionResult } from '@/components/admin-panel/result-display';
import { Database, RefreshCw, Play, AlertTriangle, Wifi, UserSearch } from 'lucide-react';

export default function AdminEmbeddingsPage() {
  const [stats, setStats] = useState<EmbeddingStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [userId, setUserId] = useState('');
  const [userStats, setUserStats] = useState<unknown>(null);
  const [userStatsResult, setUserStatsResult] = useState<ActionResult>({ action: 'user_stats', status: 'idle' });

  const [backfillUserResult, setBackfillUserResult] = useState<ActionResult>({ action: 'backfill_user', status: 'idle' });
  const [backfillAllResult, setBackfillAllResult] = useState<ActionResult>({ action: 'backfill_all', status: 'idle' });
  const [testResult, setTestResult] = useState<ActionResult>({ action: 'embeddings_test', status: 'idle' });

  async function loadStats() {
    setStatsLoading(true);
    const res = await adminGet<EmbeddingStats>('/api/admin/embeddings?action=stats');
    setStats(res.ok && res.data ? res.data : null);
    setStatsLoading(false);
  }

  async function loadUserStats(e: FormEvent) {
    e.preventDefault();
    if (!userId.trim()) return;
    setUserStatsResult({ action: 'user_stats', status: 'loading' });
    const res = await adminGet(`/api/admin/embeddings?action=user_stats&user_id=${encodeURIComponent(userId.trim())}`);
    setUserStats(res.ok ? res.data : null);
    setUserStatsResult({
      action: 'user_stats',
      status: res.ok ? 'success' : 'error',
      response: res.data,
      error: res.error,
      timestamp: new Date().toLocaleTimeString(),
    });
  }

  async function backfillUser() {
    if (!userId.trim()) {
      setBackfillUserResult({ action: 'backfill_user', status: 'error', error: '请输入 user_id', timestamp: new Date().toLocaleTimeString() });
      return;
    }
    setBackfillUserResult({ action: 'backfill_user', status: 'loading' });
    const res = await adminPost(`/api/admin/embeddings?action=backfill_user&user_id=${encodeURIComponent(userId.trim())}`, {});
    setBackfillUserResult({
      action: 'backfill_user',
      status: res.ok ? 'success' : 'error',
      response: res.data,
      error: res.error,
      timestamp: new Date().toLocaleTimeString(),
    });
  }

  async function backfillAll() {
    setBackfillAllResult({ action: 'backfill_all', status: 'loading' });
    const res = await adminPost('/api/admin/embeddings?action=backfill_all', {});
    setBackfillAllResult({
      action: 'backfill_all',
      status: res.ok ? 'success' : 'error',
      response: res.data,
      error: res.error,
      timestamp: new Date().toLocaleTimeString(),
    });
    loadStats();
  }

  async function runTest() {
    setTestResult({ action: 'embeddings_test', status: 'loading' });
    const res = await adminGet('/api/admin/embeddings/test');
    setTestResult({
      action: 'embeddings_test',
      status: res.ok ? 'success' : 'error',
      response: res.data,
      error: res.error,
      timestamp: new Date().toLocaleTimeString(),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">RAG 向量库</h2>
          <p className="text-sm text-muted-foreground">智谱 embedding-3 · 1024 维 · pgvector HNSW</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadStats} disabled={statsLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${statsLoading ? 'animate-spin' : ''}`} />
          刷新统计
        </Button>
      </div>

      {/* 统计 */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>向量总数</CardDescription>
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-8 w-20" /> : <div className="text-3xl font-bold">{stats?.total ?? 0}</div>}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">按 source_type 分布</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : stats?.by_source_type && Object.keys(stats.by_source_type).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.by_source_type).map(([type, count]) => (
                  <Badge key={type} variant="outline" className="text-xs">
                    {type}: <span className="ml-1 font-bold">{count as number}</span>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">暂无数据</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 单用户 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserSearch className="h-4 w-4 text-sky-600" />
            单用户操作
          </CardTitle>
          <CardDescription>输入 user_id 后可查询统计 / 回填历史</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={loadUserStats} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="emb-uid" className="text-xs">User ID</Label>
              <Input
                id="emb-uid"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="UUID"
                className="font-mono text-sm"
              />
            </div>
            <Button type="submit" size="sm" variant="outline">
              <UserSearch className="mr-2 h-3.5 w-3.5" />
              查询统计
            </Button>
          </form>

          {userStats != null && userStatsResult.status === 'success' && (
            <div className="rounded-md border bg-muted/30 p-3">
              <pre className="max-h-48 overflow-auto text-xs">{JSON.stringify(userStats, null, 2)}</pre>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={backfillUser} disabled={backfillUserResult.status === 'loading'}>
              <Database className="mr-2 h-3.5 w-3.5" />
              回填该用户历史
            </Button>
          </div>

          <ResultDisplay result={userStatsResult} />
          <ResultDisplay result={backfillUserResult} />
        </CardContent>
      </Card>

      {/* 全量 + 测试 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-rose-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-rose-600">
              <AlertTriangle className="h-4 w-4" />
              批量回填全部用户
            </CardTitle>
            <CardDescription>POST ?action=backfill_all · ⚠️ 耗 token，慎用</CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <AlertTriangle className="mr-2 h-3.5 w-3.5" />
                  执行批量回填（需确认）
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认批量回填？</AlertDialogTitle>
                  <AlertDialogDescription>
                    将为所有用户的历史记录（impulse_events / email_receipts / chat_messages）生成 embedding。
                    处理大量用户时消耗较多 token 且耗时较长（最长 5 分钟）。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={backfillAll} className="bg-rose-600 text-white hover:bg-rose-500">
                    确认执行
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <ResultDisplay result={backfillAllResult} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wifi className="h-4 w-4 text-emerald-600" />
              Embedding API 连通测试
            </CardTitle>
            <CardDescription>GET /api/admin/embeddings/test · 返回可用模型列表</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" onClick={runTest} disabled={testResult.status === 'loading'}>
              <Play className="mr-2 h-3 w-3" />
              运行测试
            </Button>
            <ResultDisplay result={testResult} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
