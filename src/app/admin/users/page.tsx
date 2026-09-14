'use client';

/**
 * 用户管理页 — /admin/users
 *
 * 功能：用户列表 / 搜索 / 过滤 / 分页 / 批量操作 / 详情 / 封禁 / 改plan / 重置onboarding / GDPR 删除
 * API: GET /api/admin/users, POST /api/admin/users, GET/DELETE /api/admin/users/[id]
 */

import { useEffect, useState, type ReactNode } from 'react';
import { adminGet, adminPost, adminDelete } from '@/lib/admin-panel/api-client';
import type { UserProfile, UserDetail } from '@/lib/admin-panel/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  Search,
  RefreshCw,
  Ban,
  ShieldCheck,
  Crown,
  RotateCcw,
  Trash2,
  Eye,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react';

const PAGE_SIZE = 20;

/** 与 Input 组件视觉一致的 native select 样式 */
const selectCls =
  'h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30';

function initials(name: string | null): string {
  if (!name) return '?';
  return name.trim().slice(0, 2).toUpperCase();
}

export default function AdminUsersPage() {
  // ── 列表 ──
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // ── 过滤 ──
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<'all' | 'free' | 'premium'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'banned'>('all');

  // ── 选择 ──
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── 详情 ──
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  // ── 操作 dialog ──
  const [banTarget, setBanTarget] = useState<string[] | null>(null);
  const [banUntil, setBanUntil] = useState('');
  const [banReason, setBanReason] = useState('');

  const [planTarget, setPlanTarget] = useState<string[] | null>(null);
  const [planValue, setPlanValue] = useState<'free' | 'premium'>('free');

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // ── 加载列表 ──
  async function loadUsers(targetPage = page) {
    setLoading(true);
    const params = new URLSearchParams({ page: String(targetPage), limit: String(PAGE_SIZE) });
    if (appliedSearch) params.set('search', appliedSearch);
    if (planFilter !== 'all') params.set('plan', planFilter);
    if (statusFilter !== 'all') params.set('banned', statusFilter === 'banned' ? 'true' : 'false');

    const res = await adminGet<{
      users: UserProfile[];
      total: number;
      page: number;
      totalPages: number;
    }>(`/api/admin/users?${params}`);

    if (res.ok && res.data) {
      setUsers(res.data.users || []);
      setTotal(res.data.total ?? 0);
      setTotalPages(res.data.totalPages ?? 1);
      setPage(res.data.page ?? targetPage);
    } else {
      setUsers([]);
      setTotal(0);
      setTotalPages(1);
      setFeedback({ type: 'err', msg: res.error || '加载用户列表失败' });
    }
    setLoading(false);
  }

  // 过滤 / 分页变化时重新加载
  useEffect(() => {
    void loadUsers(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSearch, planFilter, statusFilter, page]);

  // 搜索 debounce 300ms
  useEffect(() => {
    const t = setTimeout(() => {
      setAppliedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // feedback 自动消失
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  // ── 详情 ──
  async function openDetail(u: UserProfile) {
    setDetailOpen(true);
    setDetail(null);
    setDetailLoading(true);
    const res = await adminGet<UserDetail>(`/api/admin/users/${u.id}`);
    if (res.ok && res.data) {
      setDetail(res.data);
    } else {
      setFeedback({ type: 'err', msg: res.error || '加载用户详情失败' });
    }
    setDetailLoading(false);
  }

  async function refreshDetail() {
    if (!detail) return;
    const res = await adminGet<UserDetail>(`/api/admin/users/${detail.id}`);
    if (res.ok && res.data) setDetail(res.data);
  }

  // ── 批量操作 ──
  async function runBatch(
    action: 'ban' | 'unban' | 'set_plan' | 'reset_onboarding',
    userIds: string[],
    extra?: Record<string, unknown>,
  ) {
    setBusy(true);
    const res = await adminPost('/api/admin/users', { action, userIds, ...extra });
    setBusy(false);
    if (res.ok) {
      setFeedback({ type: 'ok', msg: `操作完成（${userIds.length} 个用户）` });
      setSelected(new Set());
      if (detailOpen) void refreshDetail();
      void loadUsers(page);
      return true;
    }
    setFeedback({ type: 'err', msg: res.error || '操作失败' });
    return false;
  }

  function closeBan() {
    setBanTarget(null);
    setBanUntil('');
    setBanReason('');
  }

  async function submitBan() {
    if (!banTarget || banTarget.length === 0) return;
    const ok = await runBatch('ban', banTarget, {
      bannedUntil: banUntil || undefined,
      reason: banReason || undefined,
    });
    if (ok) closeBan();
  }

  function closePlan() {
    setPlanTarget(null);
  }

  async function submitPlan() {
    if (!planTarget || planTarget.length === 0) return;
    const ok = await runBatch('set_plan', planTarget, { plan: planValue });
    if (ok) closePlan();
  }

  async function submitDelete() {
    if (!deleteTarget || deleteConfirm !== 'DELETE') return;
    setBusy(true);
    const res = await adminDelete(`/api/admin/users/${deleteTarget.id}`);
    setBusy(false);
    if (res.ok) {
      setFeedback({ type: 'ok', msg: '用户已删除（数据已级联清除）' });
      setDeleteTarget(null);
      setDeleteConfirm('');
      setDetailOpen(false);
      setDetail(null);
      void loadUsers(page);
    } else {
      setFeedback({ type: 'err', msg: res.error || '删除失败' });
    }
  }

  // ── 选择辅助 ──
  const pageIds = users.map((u) => u.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  function toggleSelectAll() {
    const next = new Set(selected);
    if (allOnPageSelected) {
      pageIds.forEach((id) => next.delete(id));
    } else {
      pageIds.forEach((id) => next.add(id));
    }
    setSelected(next);
  }

  function toggleRow(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function isBanned(u: { banned: boolean | null; banned_until: string | null }): boolean {
    if (!u.banned) return false;
    if (u.banned_until) {
      return new Date(u.banned_until).getTime() > Date.now();
    }
    return true; // permanent
  }

  const cur = detail as (UserDetail & { banned?: boolean | null }) | null;

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">用户管理</h2>
          <p className="text-sm text-muted-foreground">注册用户列表 · 封禁 · Plan · GDPR 删除</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadUsers(page)} disabled={loading}>
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
            <AlertCircle className="h-4 w-4 text-rose-600" />
          )}
          <AlertDescription className={feedback.type === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}>
            {feedback.msg}
          </AlertDescription>
        </Alert>
      )}

      {/* 过滤器 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" />
            搜索与过滤
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="user-search" className="text-xs">搜索（邮箱 / 昵称）</Label>
              <Input
                id="user-search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="user@example.com 或 昵称"
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Plan</Label>
              <select
                className={selectCls}
                value={planFilter}
                onChange={(e) => {
                  setPlanFilter(e.target.value as 'all' | 'free' | 'premium');
                  setPage(1);
                }}
              >
                <option value="all">全部</option>
                <option value="free">Free</option>
                <option value="premium">Premium</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">状态</Label>
              <select
                className={selectCls}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as 'all' | 'active' | 'banned');
                  setPage(1);
                }}
              >
                <option value="all">全部</option>
                <option value="active">正常</option>
                <option value="banned">已封禁</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 批量操作栏 */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
            已选 {selected.size} 个用户
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="destructive" onClick={() => setBanTarget(Array.from(selected))}>
              <Ban className="mr-1.5 h-3.5 w-3.5" /> 批量封禁
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void runBatch('unban', Array.from(selected))}
              disabled={busy}
            >
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> 批量解封
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setPlanValue('premium'); setPlanTarget(Array.from(selected)); }}>
              <Crown className="mr-1.5 h-3.5 w-3.5" /> 批量改 Plan
            </Button>
            <Button size="sm" variant="outline" onClick={() => void runBatch('reset_onboarding', Array.from(selected))} disabled={busy}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> 重置 Onboarding
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              <X className="mr-1.5 h-3.5 w-3.5" /> 清除选择
            </Button>
          </div>
        </div>
      )}

      {/* 用户表格 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            用户列表
            <Badge variant="outline" className="ml-2">共 {total} 个</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">暂无用户</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-primary"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAll}
                      aria-label="全选当前页"
                    />
                  </TableHead>
                  <TableHead>用户</TableHead>
                  <TableHead>邮箱</TableHead>
                  <TableHead className="w-24">Plan</TableHead>
                  <TableHead className="w-24">状态</TableHead>
                  <TableHead className="w-40">注册时间</TableHead>
                  <TableHead className="w-20">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const banned = isBanned(u);
                  return (
                    <TableRow key={u.id} className="hover:bg-muted/50">
                      <TableCell>
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-primary"
                          checked={selected.has(u.id)}
                          onChange={() => toggleRow(u.id)}
                          aria-label={`选择 ${u.display_name || u.email || u.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {u.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={u.avatar_url}
                              alt=""
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                              {initials(u.display_name)}
                            </div>
                          )}
                          <span className="font-medium">{u.display_name || '（未命名）'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {u.email || '-'}
                      </TableCell>
                      <TableCell>
                        {u.plan === 'premium' ? (
                          <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-600 hover:bg-amber-500/10">
                            <Crown className="mr-1 h-3 w-3" /> Premium
                          </Badge>
                        ) : (
                          <Badge variant="outline">Free</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {banned ? (
                          <Badge variant="destructive">已封禁</Badge>
                        ) : (
                          <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">
                            正常
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {new Date(u.created_at).toLocaleString('zh-CN', { hour12: false })}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => openDetail(u)}>
                          <Eye className="mr-1 h-3.5 w-3.5" /> 详情
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm text-muted-foreground">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一页
              </Button>
              <span>
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                下一页
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 用户详情 Dialog ── */}
      <Dialog open={detailOpen} onOpenChange={(o) => { setDetailOpen(o); if (!o) setDetail(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> 用户详情
            </DialogTitle>
            <DialogDescription>查看用户完整画像并执行管理操作</DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-2/3" />
            </div>
          ) : cur ? (
            <div className="space-y-4">
              {/* 基本信息 */}
              <div className="flex items-center gap-3">
                {cur.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cur.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm font-medium">
                    {initials(cur.display_name)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{cur.display_name || '（未命名）'}</span>
                    {cur.plan === 'premium' ? (
                      <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-600 hover:bg-amber-500/10">
                        Premium
                      </Badge>
                    ) : (
                      <Badge variant="outline">Free</Badge>
                    )}
                    {isBanned(cur) && <Badge variant="destructive">已封禁</Badge>}
                  </div>
                  <div className="truncate font-mono text-xs text-muted-foreground">{cur.email || '-'}</div>
                </div>
              </div>

              {/* 属性网格 */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Field label="User ID" value={<code className="text-[11px]">{cur.id.slice(0, 8)}…</code>} />
                <Field label="Onboarding" value={cur.onboarding_completed ? '已完成' : '未完成'} />
                <Field label="Locale" value={cur.locale || '-'} />
                <Field label="Timezone" value={cur.timezone || '-'} />
                <Field label="Trial Until" value={cur.trial_until ? new Date(cur.trial_until).toLocaleString('zh-CN', { hour12: false }) : '-'} />
                <Field label="注册时间" value={new Date(cur.created_at).toLocaleString('zh-CN', { hour12: false })} />
                {isBanned(cur) && (
                  <>
                    <Field label="封禁到期" value={cur.banned_until ? new Date(cur.banned_until).toLocaleString('zh-CN', { hour12: false }) : '永久'} />
                    <Field label="封禁原因" value={cur.banned_reason || '-'} />
                  </>
                )}
              </div>

              {/* 关联数据 */}
              <div>
                <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">关联数据</div>
                <div className="grid grid-cols-3 gap-2">
                  <StatTile label="冲动事件" value={cur.impulseCount ?? 0} />
                  <StatTile label="聊天消息" value={cur.chatMessageCount ?? 0} />
                  <StatTile label="蝴蝶会话" value={cur.butterflySessionCount ?? 0} />
                </div>
                {cur.buddyState ? (
                  <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-zinc-950 p-2 text-[10px] text-zinc-300">
                    buddy_state: {JSON.stringify(cur.buddyState, null, 2)}
                  </pre>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">无 buddy_state 记录</p>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex flex-wrap gap-2 border-t pt-4">
                {isBanned(cur) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void runBatch('unban', [cur.id])}
                  >
                    <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> 解封
                  </Button>
                ) : (
                  <Button size="sm" variant="destructive" onClick={() => setBanTarget([cur.id])}>
                    <Ban className="mr-1.5 h-3.5 w-3.5" /> 封禁
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPlanValue(cur.plan === 'premium' ? 'free' : 'premium');
                    setPlanTarget([cur.id]);
                  }}
                >
                  <Crown className="mr-1.5 h-3.5 w-3.5" /> 改 Plan
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void runBatch('reset_onboarding', [cur.id])}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> 重置 Onboarding
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="ml-auto"
                  onClick={() =>
                    setDeleteTarget({ id: cur.id, label: cur.display_name || cur.email || cur.id })
                  }
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> 删除账号
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">加载失败</p>
          )}
        </DialogContent>
      </Dialog>

      {/* ── 封禁 Dialog ── */}
      <Dialog open={banTarget !== null} onOpenChange={(o) => { if (!o) closeBan(); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-rose-600" /> 封禁用户
            </DialogTitle>
            <DialogDescription>
              将封禁 {banTarget?.length || 0} 个用户。被封禁用户将无法登录使用。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">封禁到期时间（留空 = 永久）</Label>
              <Input
                type="datetime-local"
                value={banUntil}
                onChange={(e) => setBanUntil(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">封禁原因（可选）</Label>
              <Textarea
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="记录封禁原因，供其他管理员参考"
                rows={3}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeBan} disabled={busy}>取消</Button>
            <Button variant="destructive" onClick={() => void submitBan()} disabled={busy}>
              {busy ? '处理中…' : '确认封禁'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 改 Plan Dialog ── */}
      <Dialog open={planTarget !== null} onOpenChange={(o) => { if (!o) closePlan(); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-600" /> 调整 Plan
            </DialogTitle>
            <DialogDescription>为 {planTarget?.length || 0} 个用户调整订阅 Plan。</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label className="text-xs">Plan</Label>
            <select
              className={`${selectCls} w-full`}
              value={planValue}
              onChange={(e) => setPlanValue(e.target.value as 'free' | 'premium')}
            >
              <option value="free">Free</option>
              <option value="premium">Premium</option>
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closePlan} disabled={busy}>取消</Button>
            <Button onClick={() => void submitPlan()} disabled={busy}>
              {busy ? '处理中…' : '确认'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 删除账号 Dialog ── */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteConfirm(''); } }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <Trash2 className="h-5 w-5" /> 删除账号（不可恢复）
            </DialogTitle>
            <DialogDescription>
              将永久删除用户 <strong>{deleteTarget?.label}</strong> 及其所有关联数据
              （profiles、聊天、冲动事件、蝴蝶会话等，级联清除）。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Alert className="border-rose-500/40 bg-rose-500/5">
              <AlertCircle className="h-4 w-4 text-rose-600" />
              <AlertDescription className="text-rose-700 dark:text-rose-300">
                请输入 <strong>DELETE</strong> 以确认删除。
              </AlertDescription>
            </Alert>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              className="font-mono"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDeleteTarget(null); setDeleteConfirm(''); }}
              disabled={busy}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => void submitDelete()}
              disabled={busy || deleteConfirm !== 'DELETE'}
            >
              {busy ? '删除中…' : '永久删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm">{value}</div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border px-3 py-2 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}
