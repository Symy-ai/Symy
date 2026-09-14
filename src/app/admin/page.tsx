'use client';

/**
 * 后台管理系统 — Dashboard 仪表盘
 *
 * 聚合多个 admin API 展示系统概览：
 * - Agent 总数 + MCP servers  → GET /api/admin/letta
 * - Agent Pool 状态           → GET /api/admin/agent-pool
 * - 审计日志统计               → GET /api/admin/audit?action=stats
 * - Cultivation 统计          → GET /api/admin/cultivation?action=stats
 * - Embeddings 统计           → GET /api/admin/embeddings?action=stats
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminGet } from '@/lib/admin-panel/api-client';
import type { DashboardOverview, LettaOverview, AuditLog } from '@/lib/admin-panel/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Bot,
  Layers,
  ScrollText,
  Sparkles,
  Database,
  RefreshCw,
  ArrowRight,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Crown,
} from 'lucide-react';

export default function AdminDashboardPage() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadOverview(silent = false) {
    if (!silent) setLoading(true);
    setError(null);

    // 并行获取，单个失败不影响其它
    const [lettaRes, poolRes, auditRes, cultivationRes, embeddingRes] = await Promise.allSettled([
      adminGet<LettaOverview>('/api/admin/letta'),
      adminGet<DashboardOverview['poolStatus']>('/api/admin/agent-pool'),
      adminGet<DashboardOverview['auditStats']>('/api/admin/audit?action=stats'),
      adminGet<DashboardOverview['cultivationStats']>('/api/admin/cultivation?action=stats'),
      adminGet<DashboardOverview['embeddingStats']>('/api/admin/embeddings?action=stats'),
    ]);

    const next: DashboardOverview = {
      agents: [],
      agentCount: 0,
      mcpServers: [],
      poolStatus: null,
      auditStats: null,
      cultivationStats: null,
      embeddingStats: null,
    };

    let hasError = false;
    if (lettaRes.status === 'fulfilled' && lettaRes.value.ok && lettaRes.value.data) {
      const d = lettaRes.value.data;
      next.agents = d.agents || [];
      next.agentCount = d.agentCount ?? (d.agents?.length ?? 0);
      next.mcpServers = d.mcpServers || [];
    } else hasError = true;

    if (poolRes.status === 'fulfilled' && poolRes.value.ok && poolRes.value.data) {
      next.poolStatus = poolRes.value.data as DashboardOverview['poolStatus'];
    }
    if (auditRes.status === 'fulfilled' && auditRes.value.ok && auditRes.value.data) {
      next.auditStats = auditRes.value.data as DashboardOverview['auditStats'];
    }
    if (cultivationRes.status === 'fulfilled' && cultivationRes.value.ok && cultivationRes.value.data) {
      next.cultivationStats = cultivationRes.value.data as DashboardOverview['cultivationStats'];
    }
    if (embeddingRes.status === 'fulfilled' && embeddingRes.value.ok && embeddingRes.value.data) {
      next.embeddingStats = embeddingRes.value.data as DashboardOverview['embeddingStats'];
    }

    // 获取最近审计日志（时间线，5 条）
    const recentRes = await adminGet<{ logs: AuditLog[] }>('/api/admin/audit?page=1&limit=5');
    if (recentRes.ok && recentRes.data?.logs) {
      next.recentLogs = recentRes.data.logs;
    }

    setOverview(next);
    setError(hasError ? '部分数据加载失败（可能权限不足或 API 未配置）' : null);
    setLoading(false);
  }

  useEffect(() => {
    loadOverview();
    // 自动刷新：每 60 秒（静默，不闪烁）
    const interval = setInterval(() => loadOverview(true), 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      {/* 标题区 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">系统仪表盘</h2>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            Symy AI 后台管理系统 · 实时概览
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-600">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              每 60s 自动刷新
            </span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadOverview()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {error && (
        <Alert className="border-amber-500/40 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* 概览卡片 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <OverviewCard
          title="Letta Agent"
          value={loading ? null : overview?.agentCount ?? 0}
          icon={<Bot className="h-5 w-5 text-emerald-600" />}
          href="/admin/letta"
          hint={`MCP servers: ${overview?.mcpServers.length ?? 0}`}
          loading={loading}
        />
        <OverviewCard
          title="Agent Pool"
          value={loading ? null : `${overview?.poolStatus?.available ?? '-'} / ${(overview?.poolStatus?.available ?? 0) + (overview?.poolStatus?.assigned ?? 0)}`}
          icon={<Layers className="h-5 w-5 text-sky-600" />}
          href="/admin/agent-pool"
          hint={`poolSize: ${overview?.poolStatus?.poolSize ?? '-'}`}
          loading={loading}
        />
        <OverviewCard
          title="审计日志"
          value={loading ? null : overview?.auditStats?.total ?? 0}
          icon={<ScrollText className="h-5 w-5 text-violet-600" />}
          href="/admin/audit"
          hint="累计记录数"
          loading={loading}
        />
        <OverviewCard
          title="修身评估"
          value={loading ? null : overview?.cultivationStats?.total ?? 0}
          icon={<Sparkles className="h-5 w-5 text-amber-600" />}
          href="/admin/cultivation"
          hint="已评估用户数"
          loading={loading}
        />
        <OverviewCard
          title="RAG 向量"
          value={loading ? null : overview?.embeddingStats?.total ?? 0}
          icon={<Database className="h-5 w-5 text-rose-600" />}
          href="/admin/embeddings"
          hint="向量条数"
          loading={loading}
        />
      </div>

      {/* 系统健康 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-emerald-600" />
              系统健康
            </CardTitle>
            <CardDescription>核心服务可用性</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <HealthRow label="Letta Agent 服务" ok={overview != null && overview.agentCount > 0} loading={loading} />
            <HealthRow label="Agent Pool" ok={overview?.poolStatus != null} loading={loading} />
            <HealthRow label="审计日志服务" ok={overview?.auditStats != null} loading={loading} />
            <HealthRow label="修身评估服务" ok={overview?.cultivationStats != null} loading={loading} />
            <HealthRow label="RAG 向量库" ok={overview?.embeddingStats != null} loading={loading} />
          </CardContent>
        </Card>

        {/* Cultivation 分布 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-amber-600" />
              修身阶段分布
            </CardTitle>
            <CardDescription>用户 cultivation_stage 统计</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : overview?.cultivationStats?.by_cultivation_stage &&
              Object.keys(overview.cultivationStats.by_cultivation_stage).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(overview.cultivationStats.by_cultivation_stage).map(([stage, count]) => (
                  <StageBar key={stage} stage={stage} count={count as number} total={overview.cultivationStats?.total ?? 0} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">暂无数据</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 最近审计操作时间线 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4 text-violet-600" />
            最近审计操作
          </CardTitle>
          <CardDescription>最新 5 条管理员操作记录</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : overview?.recentLogs && overview.recentLogs.length > 0 ? (
            <div className="space-y-2">
              {overview.recentLogs.map((log) => (
                <div key={String(log.id)} className="flex items-center gap-3 rounded-md border px-3 py-2 text-xs">
                  <div className={`h-2 w-2 shrink-0 rounded-full ${log.success ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-[11px] font-medium">{log.route}</span>
                      {log.action && <Badge variant="outline" className="text-[9px]">{log.action}</Badge>}
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {log.actor} · {new Date(log.created_at).toLocaleString('zh-CN', { hour12: false })}
                    </div>
                  </div>
                  {log.success ? (
                    <Badge className="border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-600 hover:bg-emerald-500/10">成功</Badge>
                  ) : (
                    <Badge variant="destructive" className="text-[9px]">{log.status_code || '失败'}</Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">暂无审计记录</p>
          )}
          <div className="mt-3 text-right">
            <Link href="/admin/audit" className="text-xs text-emerald-600 hover:underline">
              查看全部 →
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* 快捷操作 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">快捷操作</CardTitle>
          <CardDescription>常用管理入口</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <QuickAction href="/admin/letta" title="管理 Letta Agent" desc="26 个操作 · prompt / memory / MCP" icon={<Bot className="h-4 w-4" />} />
            <QuickAction href="/admin/agent-pool" title="Agent Pool" desc="查看池子状态 · 手动 refill" icon={<Layers className="h-4 w-4" />} />
            <QuickAction href="/admin/challenges" title="创建每周挑战" desc="手动触发社区挑战生成" icon={<Sparkles className="h-4 w-4" />} />
            <QuickAction href="/admin/embeddings" title="RAG 回填" desc="向量库统计 · 单/全量回填" icon={<Database className="h-4 w-4" />} />
            <QuickAction href="/admin/cultivation" title="修身评估" desc="查看用户画像 · 重新评估" icon={<Sparkles className="h-4 w-4" />} />
            <QuickAction href="/admin/audit" title="审计日志" desc="查询管理员操作记录" icon={<ScrollText className="h-4 w-4" />} />
            <QuickAction href="/admin/vip" title="VIP 管理" desc="候补名单 · 批量开通邮箱接入" icon={<Crown className="h-4 w-4" />} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function OverviewCard({
  title,
  value,
  icon,
  href,
  hint,
  loading,
}: {
  title: string;
  value: number | string | null;
  icon: React.ReactNode;
  href: string;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <Link href={href} className="block">
      <Card className="transition-all hover:shadow-md hover:-translate-y-0.5">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
          {icon}
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <div className="text-2xl font-bold">{value ?? '-'}</div>
          )}
          {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
        </CardContent>
      </Card>
    </Link>
  );
}

function HealthRow({ label, ok, loading }: { label: string; ok: boolean; loading?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      {loading ? (
        <Skeleton className="h-4 w-16" />
      ) : ok ? (
        <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          正常
        </Badge>
      ) : (
        <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/10">
          <AlertTriangle className="mr-1 h-3 w-3" />
          未知
        </Badge>
      )}
    </div>
  );
}

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  zhi_yu: { label: '致知', color: 'bg-sky-500' },
  zhi_zhi: { label: '知至', color: 'bg-emerald-500' },
  cheng_yi: { label: '诚意', color: 'bg-amber-500' },
  zheng_xin: { label: '正心', color: 'bg-rose-500' },
};

function StageBar({ stage, count, total }: { stage: string; count: number; total: number }) {
  const meta = STAGE_LABELS[stage] || { label: stage, color: 'bg-zinc-500' };
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium">{meta.label}</span>
        <span className="text-muted-foreground">{count} ({pct}%)</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${meta.color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function QuickAction({ href, title, desc, icon }: { href: string; title: string; desc: string; icon: React.ReactNode }) {
  return (
    <Link href={href}>
      <div className="group flex items-center gap-3 rounded-lg border p-3 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:bg-emerald-500/10 group-hover:text-emerald-600">
          {icon}
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </Link>
  );
}
