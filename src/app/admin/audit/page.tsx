'use client';

/**
 * 审计日志查询页
 *
 * GET /api/admin/audit?action=stats               — 统计
 * GET /api/admin/audit?page=&limit=&route=&actor= — 分页日志
 */

import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { adminGet } from '@/lib/admin-panel/api-client';
import type { AuditLog, AuditStats } from '@/lib/admin-panel/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ScrollText, RefreshCw, Search, ChevronDown, ChevronRight, Filter } from 'lucide-react';

const PAGE_SIZE = 20;

export default function AdminAuditPage() {
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // 过滤
  const [routeFilter, setRouteFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  // 已应用的过滤（点搜索才生效）
  const [appliedRoute, setAppliedRoute] = useState('');
  const [appliedActor, setAppliedActor] = useState('');
  // 状态过滤（客户端，all/success/failed）
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');

  const [expandedId, setExpandedId] = useState<string | number | null>(null);

  async function loadStats() {
    setStatsLoading(true);
    const res = await adminGet<AuditStats>('/api/admin/audit?action=stats');
    setStats(res.ok && res.data ? res.data : null);
    setStatsLoading(false);
  }

  async function loadLogs(targetPage = page) {
    setLogsLoading(true);
    const params = new URLSearchParams({
      page: String(targetPage),
      limit: String(PAGE_SIZE),
    });
    if (appliedRoute) params.set('route', appliedRoute);
    if (appliedActor) params.set('actor', appliedActor);
    const res = await adminGet<{ logs: AuditLog[]; total: number; page: number; limit: number }>(`/api/admin/audit?${params}`);
    if (res.ok && res.data) {
      setLogs(res.data.logs || []);
      setTotal(res.data.total ?? 0);
      setPage(res.data.page ?? targetPage);
    } else {
      setLogs([]);
      setTotal(0);
    }
    setLogsLoading(false);
  }

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedRoute, appliedActor]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    setAppliedRoute(routeFilter.trim());
    setAppliedActor(actorFilter.trim());
  }

  function handleReset() {
    setRouteFilter('');
    setActorFilter('');
    setAppliedRoute('');
    setAppliedActor('');
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">审计日志</h2>
          <p className="text-sm text-muted-foreground">管理员操作记录 · 暴力破解检测</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadStats} disabled={statsLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${statsLoading ? 'animate-spin' : ''}`} />
          刷新统计
        </Button>
      </div>

      {/* 统计 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4 text-violet-600" />
            审计统计
          </CardTitle>
          <CardDescription>累计审计记录数 + 按 action 分布</CardDescription>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : stats ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-md border bg-muted/30 px-4 py-2">
                <div className="text-[10px] uppercase text-muted-foreground">总数</div>
                <div className="text-2xl font-bold">{stats.total}</div>
              </div>
              {stats.byAction &&
                Object.entries(stats.byAction).map(([action, count]) => (
                  <Badge key={action} variant="outline" className="text-xs">
                    {action}: <span className="ml-1 font-bold">{count as number}</span>
                  </Badge>
                ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">暂无数据</p>
          )}
        </CardContent>
      </Card>

      {/* 过滤器 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            过滤查询
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="filter-route" className="text-xs">Route 包含</Label>
              <Input
                id="filter-route"
                value={routeFilter}
                onChange={(e) => setRouteFilter(e.target.value)}
                placeholder="/api/admin/letta"
                className="font-mono text-sm"
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label htmlFor="filter-actor" className="text-xs">Actor 包含</Label>
              <Input
                id="filter-actor"
                value={actorFilter}
                onChange={(e) => setActorFilter(e.target.value)}
                placeholder="admin@symy"
                className="font-mono text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm">
                <Search className="mr-2 h-3.5 w-3.5" />
                搜索
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={handleReset}>
                重置
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 日志表格 */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">
              日志列表
              <Badge variant="outline" className="ml-2">共 {total} 条</Badge>
            </CardTitle>
            {/* 状态过滤（客户端） */}
            <div className="flex items-center gap-1 rounded-md border p-0.5">
              {(['all', 'success', 'failed'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    statusFilter === s
                      ? s === 'success'
                        ? 'bg-emerald-500/15 text-emerald-600'
                        : s === 'failed'
                          ? 'bg-rose-500/15 text-rose-600'
                          : 'bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {s === 'all' ? '全部' : s === 'success' ? '成功' : '失败'}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">暂无日志记录</p>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead className="w-40">时间</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead className="w-28">Actor</TableHead>
                    <TableHead className="w-24">Action</TableHead>
                    <TableHead className="w-20">状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.filter((log) => {
                    if (statusFilter === 'all') return true;
                    if (statusFilter === 'success') return log.success;
                    return !log.success;
                  }).map((log) => {
                    const id = log.id;
                    const expanded = expandedId === id;
                    return (
                      <Fragment key={id}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setExpandedId(expanded ? null : id)}
                        >
                          <TableCell className="text-muted-foreground">
                            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </TableCell>
                          <TableCell className="font-mono text-[11px] text-muted-foreground">
                            {new Date(log.created_at).toLocaleString('zh-CN', { hour12: false })}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{log.route}</TableCell>
                          <TableCell className="font-mono text-xs">{log.actor}</TableCell>
                          <TableCell className="font-mono text-[11px]">{log.action || '-'}</TableCell>
                          <TableCell>
                            {log.success ? (
                              <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">成功</Badge>
                            ) : (
                              <Badge variant="destructive">{log.status_code || '失败'}</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                        {expanded && (
                          <TableRow className="bg-muted/20">
                            <TableCell colSpan={6} className="p-3">
                              <pre className="max-h-48 overflow-auto rounded-md bg-zinc-950 p-3 text-[11px] text-zinc-300">
                                {JSON.stringify(
                                  {
                                    id: log.id,
                                    created_at: log.created_at,
                                    route: log.route,
                                    method: log.method,
                                    actor: log.actor,
                                    action: log.action,
                                    success: log.success,
                                    status_code: log.status_code,
                                    metadata: log.metadata,
                                  },
                                  null,
                                  2,
                                )}
                              </pre>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}

          {/* 分页 */}
          {total > PAGE_SIZE && (
            <div className="mt-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => page > 1 && loadLogs(page - 1)}
                      className={page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                  <PaginationItem className="px-3 text-sm text-muted-foreground">
                    {page} / {totalPages}
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => page < totalPages && loadLogs(page + 1)}
                      className={page >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
