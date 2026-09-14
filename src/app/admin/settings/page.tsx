'use client';

/**
 * 系统设置页 — /admin/settings
 *
 * 5 个卡片：环境变量概览 / 健康检查 / Migration 状态 / app_config 配置 / Cron 任务
 * API: GET /api/admin/settings, GET /api/admin/settings/migrations, GET /api/admin/settings/health
 */

import { useEffect, useState } from 'react';
import { adminGet } from '@/lib/admin-panel/api-client';
import type {
  AppConfigEntry,
  EnvVarCheck,
  HealthCheckResult,
  MigrationInfo,
} from '@/lib/admin-panel/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Settings,
  KeyRound,
  HeartPulse,
  GitBranch,
  Database,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Play,
} from 'lucide-react';

type CronJob = { path: string; schedule: string };

interface Overview {
  envVars: EnvVarCheck[];
  appConfig: AppConfigEntry[];
  migrationCount: number;
  cronJobs?: CronJob[];
}

const STATUS_STYLE: Record<
  HealthCheckResult['status'],
  { color: string; badge: string; Icon: typeof CheckCircle2 }
> = {
  healthy: {
    color: 'text-emerald-600 dark:text-emerald-400',
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10',
    Icon: CheckCircle2,
  },
  degraded: {
    color: 'text-amber-600 dark:text-amber-400',
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-600 hover:bg-amber-500/10',
    Icon: AlertTriangle,
  },
  down: {
    color: 'text-rose-600 dark:text-rose-400',
    badge: 'border-rose-500/30 bg-rose-500/10 text-rose-600 hover:bg-rose-500/10',
    Icon: XCircle,
  },
};

export default function AdminSettingsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [migrations, setMigrations] = useState<MigrationInfo[]>([]);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // 健康检查
  const [checks, setChecks] = useState<HealthCheckResult[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  async function loadOverview() {
    setLoading(true);
    const [ovRes, migRes] = await Promise.all([
      adminGet<Overview>('/api/admin/settings'),
      adminGet<{ migrations: MigrationInfo[]; duplicates: string[] }>('/api/admin/settings/migrations'),
    ]);
    if (ovRes.ok && ovRes.data) {
      setOverview(ovRes.data);
    } else {
      setFeedback({ type: 'err', msg: ovRes.error || '加载系统设置失败' });
    }
    if (migRes.ok && migRes.data) {
      setMigrations(migRes.data.migrations || []);
      setDuplicates(migRes.data.duplicates || []);
    }
    setLoading(false);
  }

  async function runHealth() {
    setChecking(true);
    setChecks(null);
    setHealthError(null);
    const res = await adminGet<{ checks: HealthCheckResult[] }>('/api/admin/settings/health');
    if (res.ok && res.data) {
      setChecks(res.data.checks || []);
    } else {
      // Set an empty array so the placeholder disappears and the inline
      // error inside the health card becomes visible (the feedback toast
      // auto-dismisses after 4s, which previously left the card stuck on
      // the placeholder with no indication of why nothing rendered).
      setChecks([]);
      setHealthError(res.error || '健康检查失败');
      setFeedback({ type: 'err', msg: res.error || '健康检查失败' });
    }
    setChecking(false);
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  // 按分组聚合 env vars（保持分组首次出现的顺序）
  const envGroups = new Map<string, EnvVarCheck[]>();
  for (const v of overview?.envVars ?? []) {
    const arr = envGroups.get(v.group);
    if (arr) arr.push(v);
    else envGroups.set(v.group, [v]);
  }
  const missingRequired = (overview?.envVars ?? []).filter((v) => v.required && !v.configured);

  // 最近 5 个 migration（按文件名升序后取末 5，再倒序展示）
  const recentMigrations = [...migrations].slice(-5).reverse();

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">系统设置</h2>
          <p className="text-sm text-muted-foreground">环境变量 · 健康检查 · Migration · 配置 · Cron</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadOverview()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* feedback */}
      {feedback && (
        <Alert className={feedback.type === 'ok' ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-rose-500/40 bg-rose-500/5'}>
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-rose-600" />
          )}
          <AlertDescription className={feedback.type === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}>
            {feedback.msg}
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          {/* 5a. 环境变量概览 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4" />
                环境变量概览
                <Badge variant="outline" className="ml-1 text-[10px]">仅名称</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {missingRequired.length > 0 && (
                <Alert className="border-rose-500/40 bg-rose-500/5">
                  <XCircle className="h-4 w-4 text-rose-600" />
                  <AlertDescription className="text-rose-700 dark:text-rose-300">
                    以下必须项未配置：{' '}
                    <code className="font-mono text-xs">{missingRequired.map((v) => v.key).join(', ')}</code>
                  </AlertDescription>
                </Alert>
              )}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[...envGroups.entries()].map(([group, vars]) => (
                  <div key={group} className="rounded-lg border p-3">
                    <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{group}</div>
                    <ul className="space-y-1.5">
                      {vars.map((v) => (
                        <li key={v.key} className="flex items-start justify-between gap-2 text-sm">
                          <div className="min-w-0">
                            <code className="font-mono text-xs break-all">{v.key}</code>
                            {v.required && <span className="ml-1 text-rose-500">*</span>}
                            {v.description && (
                              <div className="text-[11px] text-muted-foreground">{v.description}</div>
                            )}
                          </div>
                          {v.configured ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${v.required ? 'text-rose-500' : 'text-amber-500'}`} />
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                <span className="text-rose-500">*</span> 必须项 · ✅ 已配置 · ⚠️ 未配置 · 永不显示变量值
              </p>
            </CardContent>
          </Card>

          {/* 5b. 健康检查 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HeartPulse className="h-4 w-4" />
                健康检查
                <Button size="sm" className="ml-auto" onClick={() => void runHealth()} disabled={checking}>
                  {checking ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                  {checking ? '检测中…' : '运行检查'}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {checks === null ? (
                <p className="py-6 text-center text-sm text-muted-foreground">点击「运行检查」探测各服务连通性</p>
              ) : checks.length === 0 && healthError ? (
                <Alert className="border-rose-500/40 bg-rose-500/5">
                  <XCircle className="h-4 w-4 text-rose-600" />
                  <AlertDescription className="text-rose-700 dark:text-rose-300">
                    {healthError}
                  </AlertDescription>
                </Alert>
              ) : checks.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">未检测到任何服务</p>
              ) : (
                <ul className="space-y-2">
                  {checks.map((c) => {
                    const s = STATUS_STYLE[c.status];
                    const Icon = s.Icon;
                    return (
                      <li key={c.service} className="flex items-center gap-3 rounded-md border px-3 py-2">
                        <Icon className={`h-4 w-4 ${s.color}`} />
                        <span className="font-medium">{c.service}</span>
                        <Badge className={s.badge}>{c.status}</Badge>
                        <span className="ml-auto font-mono text-xs text-muted-foreground">{c.latencyMs}ms</span>
                        {c.message && (
                          <span className="max-w-[40%] truncate text-xs text-muted-foreground" title={c.message}>
                            {c.message}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* 5c. Migration 状态 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <GitBranch className="h-4 w-4" />
                Migration 状态
                <Badge variant="outline" className="ml-1 text-[10px]">{overview?.migrationCount ?? migrations.length} 个文件</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {duplicates.length > 0 && (
                <Alert className="border-amber-500/40 bg-amber-500/5">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-700 dark:text-amber-300">
                    检测到重复编号前缀：{' '}
                    <code className="font-mono text-xs">{duplicates.join(', ')}</code>
                    {' '}— 请检查是否存在合并冲突。
                  </AlertDescription>
                </Alert>
              )}
              <div>
                <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">最近 5 个</div>
                {recentMigrations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">无 migration 文件</p>
                ) : (
                  <ul className="space-y-1">
                    {recentMigrations.map((m) => (
                      <li key={m.filename} className="flex items-center justify-between gap-2 font-mono text-xs">
                        <span className="truncate">{m.filename}</span>
                        <span className="shrink-0 text-muted-foreground">{(m.size / 1024).toFixed(1)} KB</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 5d. app_config 配置 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4" />
                app_config 配置
                <Badge variant="outline" className="ml-1 text-[10px]">只读</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!overview?.appConfig || overview.appConfig.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">app_config 表无条目</p>
              ) : (
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {overview.appConfig.map((c) => (
                    <li key={c.key} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
                      <code className="truncate font-mono text-xs">{c.key}</code>
                      {c.hasValue ? (
                        <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">已设</Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600">空</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">仅显示 key 与是否已设值，不返回敏感配置内容。</p>
            </CardContent>
          </Card>

          {/* 5e. Cron 任务 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" />
                Cron 任务
                <Badge variant="outline" className="ml-1 text-[10px]">vercel.json</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!overview?.cronJobs || overview.cronJobs.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">未配置 cron 任务</p>
              ) : (
                <ul className="space-y-1.5">
                  {overview.cronJobs.map((c) => (
                    <li key={c.path} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                      <code className="font-mono text-xs">{c.path}</code>
                      <Badge variant="outline" className="ml-auto font-mono text-[10px]">{c.schedule}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Settings className="h-3 w-3" />
            系统设置页 · 所有敏感配置仅显示名称/状态，不返回值
          </p>
        </>
      )}
    </div>
  );
}
