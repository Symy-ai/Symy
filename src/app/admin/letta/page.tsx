'use client';

/**
 * Letta Agent 管理页
 *
 * 上半部分：Agent 列表 + MCP Servers 列表（GET /api/admin/letta）
 * 下半部分：26 个 action 分组面板（POST /api/admin/letta）
 */

import { useEffect, useMemo, useState } from 'react';
import { adminGet } from '@/lib/admin-panel/api-client';
import { LETTA_ACTION_GROUPS, LETTA_ACTION_COUNT, ALL_LETTA_ACTIONS } from '@/lib/admin-panel/letta-actions';
import type { LettaOverview, LettaActionMeta } from '@/lib/admin-panel/types';
import { LettaActionPanel } from '@/components/admin-panel/letta-action-panel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Plug, RefreshCw, Search, X, Copy } from 'lucide-react';

export default function AdminLettaPage() {
  const [overview, setOverview] = useState<LettaOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);

  // 收藏持久化到 localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('symy_admin_letta_favorites');
      if (saved) setFavorites(JSON.parse(saved));
    } catch {
      // safe to ignore: localStorage 不可用时用默认空数组
    }
  }, []);
  useEffect(() => {
    localStorage.setItem('symy_admin_letta_favorites', JSON.stringify(favorites));
  }, [favorites]);

  function toggleFavorite(action: string) {
    setFavorites((prev) =>
      prev.includes(action) ? prev.filter((a) => a !== action) : [...prev, action],
    );
  }

  const favoriteActions = useMemo(
    () => ALL_LETTA_ACTIONS.filter((a) => favorites.includes(a.action)),
    [favorites],
  );

  // 搜索过滤：匹配 action / label / description
  const searchLower = search.trim().toLowerCase();
  const isSearching = searchLower.length > 0;
  const filteredActions = useMemo<LettaActionMeta[]>(() => {
    if (!isSearching) return [];
    return ALL_LETTA_ACTIONS.filter(
      (a) =>
        a.action.toLowerCase().includes(searchLower) ||
        a.label.toLowerCase().includes(searchLower) ||
        a.description.toLowerCase().includes(searchLower),
    );
  }, [isSearching, searchLower]);

  async function loadOverview() {
    setLoading(true);
    setError(null);
    const res = await adminGet<LettaOverview>('/api/admin/letta');
    if (res.ok && res.data) {
      setOverview(res.data);
    } else {
      setError(res.error || '加载失败');
    }
    setLoading(false);
  }

  useEffect(() => {
    loadOverview();
  }, []);

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Letta Agent 管理</h2>
          <p className="text-sm text-muted-foreground">
            {LETTA_ACTION_COUNT} 个管理操作 · Agent / Memory / MCP / 模型 / Sleeptime
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadOverview} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新概览
        </Button>
      </div>

      {error && (
        <Alert className="border-rose-500/40 bg-rose-500/5">
          <AlertDescription className="text-rose-700 dark:text-rose-300">{error}</AlertDescription>
        </Alert>
      )}

      {/* 概览区 */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Agent 列表 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4 text-emerald-600" />
              Agent 列表
              <Badge variant="outline" className="ml-1">
                {overview?.agentCount ?? 0}
              </Badge>
            </CardTitle>
            <CardDescription>per-user agent（从 profiles 表查询，最多 50 个）</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : overview?.agents?.length ? (
              <ScrollArea className="h-72">
                <div className="space-y-1.5">
                  {overview.agents.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{a.name}</div>
                        <button
                          onClick={() => navigator.clipboard?.writeText(a.id)}
                          className="group flex items-center gap-1 truncate font-mono text-[10px] text-muted-foreground hover:text-emerald-600"
                          title="点击复制 Agent ID"
                        >
                          <span className="truncate">{a.id}</span>
                          <Copy className="h-2.5 w-2.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                        </button>
                        {a.user_id && (
                          <button
                            onClick={() => navigator.clipboard?.writeText(a.user_id!)}
                            className="group mt-0.5 flex items-center gap-1 truncate font-mono text-[9px] text-muted-foreground/70 hover:text-sky-600"
                            title="点击复制 User ID"
                          >
                            <span className="truncate">user: {a.user_id}</span>
                            <Copy className="h-2 w-2 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                          </button>
                        )}
                      </div>
                      <Badge variant="outline" className="ml-2 shrink-0 text-[10px]">{a.model}</Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-sm text-muted-foreground">暂无 Agent</p>
            )}
          </CardContent>
        </Card>

        {/* MCP Servers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plug className="h-4 w-4 text-sky-600" />
              MCP Servers
              <Badge variant="outline" className="ml-1">
                {overview?.mcpServers?.length ?? 0}
              </Badge>
            </CardTitle>
            <CardDescription>已注册的 MCP server</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : overview?.mcpServers?.length ? (
              <ScrollArea className="h-72">
                <div className="space-y-1.5">
                  {overview.mcpServers.map((s) => (
                    <div key={s.id} className="rounded-md border px-3 py-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{s.name}</span>
                        <Badge variant="outline" className="text-[10px]">{s.server_type}</Badge>
                      </div>
                      <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{s.server_url}</div>
                      <button
                        onClick={() => navigator.clipboard?.writeText(s.id)}
                        className="group mt-0.5 flex items-center gap-1 truncate font-mono text-[10px] text-muted-foreground hover:text-emerald-600"
                        title="点击复制 ID"
                      >
                        <span className="truncate">{s.id}</span>
                        <Copy className="h-2.5 w-2.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-sm text-muted-foreground">暂无 MCP Server</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Action 操作区 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" />
            管理操作
            <Badge variant="outline">{LETTA_ACTION_COUNT} actions</Badge>
          </CardTitle>
          <CardDescription>按功能分组，点击「执行」调用 POST /api/admin/letta</CardDescription>
        </CardHeader>
        <CardContent>
          {/* 搜索框 */}
          <div className="mb-4 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索 action（名称/标签/描述）…"
                className="pl-9 pr-9"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="清除搜索"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {isSearching && (
              <Badge variant="secondary" className="shrink-0">
                {filteredActions.length} / {LETTA_ACTION_COUNT}
              </Badge>
            )}
          </div>

          {/* 收藏区（非搜索时且有收藏时显示） */}
          {!isSearching && favoriteActions.length > 0 && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>
                收藏 ({favoriteActions.length})
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {favoriteActions.map((meta) => (
                  <LettaActionPanel
                    key={meta.action}
                    meta={meta}
                    isFavorite
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </div>
            </div>
          )}

          {isSearching ? (
            // 搜索模式：跨分组平铺
            filteredActions.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                未找到匹配的 action
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {filteredActions.map((meta) => (
                  <LettaActionPanel
                    key={meta.action}
                    meta={meta}
                    isFavorite={favorites.includes(meta.action)}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </div>
            )
          ) : (
            // 分组模式
            <Tabs defaultValue={LETTA_ACTION_GROUPS[0].group}>
              <TabsList className="flex h-auto flex-wrap gap-1">
                {LETTA_ACTION_GROUPS.map((g) => (
                  <TabsTrigger key={g.group} value={g.group} className="text-xs">
                    <span className="mr-1">{g.icon}</span>
                    {g.group}
                    <Badge variant="secondary" className="ml-1.5 text-[9px]">{g.actions.length}</Badge>
                  </TabsTrigger>
                ))}
              </TabsList>

              {LETTA_ACTION_GROUPS.map((g) => (
                <TabsContent key={g.group} value={g.group} className="mt-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    {g.actions.map((meta) => (
                      <LettaActionPanel
                        key={meta.action}
                        meta={meta}
                        isFavorite={favorites.includes(meta.action)}
                        onToggleFavorite={toggleFavorite}
                      />
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
