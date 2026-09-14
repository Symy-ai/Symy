'use client';

/**
 * VIP 管理 — 候补名单 + 批量开通
 *
 * 功能:
 * 1. 查看候补名单 (premium_waitlist 表)
 * 2. 批量开通 VIP (设 profiles.plan='premium')
 * 3. 查看 VIP 用户列表
 * 4. 撤销 VIP (设 profiles.plan='free')
 */

import { useEffect, useState } from 'react';
import { adminGet, adminPost } from '@/lib/admin-panel/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, Crown, RefreshCw, CheckCircle2, XCircle, Clock, Shield } from 'lucide-react';

interface WaitlistEntry {
  user_id: string;
  email: string;
  created_at: string;
  isActivated: boolean;
}

interface PremiumUser {
  id: string;
  email: string | null;
  display_name: string | null;
  plan: string;
  created_at: string;
}

interface VipStats {
  waitlistTotal: number;
  activatedCount: number;
  pendingCount: number;
  premiumTotal: number;
}

interface VipData {
  waitlist: WaitlistEntry[];
  premiumUsers: PremiumUser[];
  stats: VipStats;
}

export default function AdminVipPage() {
  const [data, setData] = useState<VipData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedVipIds, setSelectedVipIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    const res = await adminGet<VipData>('/api/admin/vip');
    if (res.ok && res.data) {
      setData(res.data);
    } else {
      setError(res.error || '加载失败');
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function toggleSelect(userId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function selectAllPending() {
    if (!data) return;
    const pending = data.waitlist.filter(w => !w.isActivated);
    setSelectedIds(new Set(pending.map(w => w.user_id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function batchActivate() {
    if (selectedIds.size === 0) return;
    setActionLoading(true);
    setActionResult(null);
    const res = await adminPost<{ success: boolean; affected: number }>('/api/admin/vip', {
      userIds: Array.from(selectedIds),
      action: 'activate',
    });
    if (res.ok && res.data?.success) {
      setActionResult(`✅ 已开通 ${res.data.affected} 位用户的 VIP`);
      setSelectedIds(new Set());
      await loadData();
    } else {
      setActionResult(`❌ 开通失败: ${res.error || '未知错误'}`);
    }
    setActionLoading(false);
  }

  function toggleVipSelect(userId: string) {
    setSelectedVipIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function selectAllVip() {
    if (!data) return;
    setSelectedVipIds(new Set(data.premiumUsers.map(u => u.id)));
  }

  async function batchDeactivate() {
    if (selectedVipIds.size === 0) return;
    setActionLoading(true);
    setActionResult(null);
    const res = await adminPost<{ success: boolean; affected: number }>('/api/admin/vip', {
      userIds: Array.from(selectedVipIds),
      action: 'deactivate',
    });
    if (res.ok && res.data?.success) {
      setActionResult(`✅ 已撤销 ${res.data.affected} 位用户的 VIP`);
      setSelectedVipIds(new Set());
      await loadData();
    } else {
      setActionResult(`❌ 撤销失败: ${res.error || '未知错误'}`);
    }
    setActionLoading(false);
  }

  async function deactivateUser(userId: string) {
    setActionLoading(true);
    setActionResult(null);
    const res = await adminPost<{ success: boolean; affected: number }>('/api/admin/vip', {
      userIds: [userId],
      action: 'deactivate',
    });
    if (res.ok && res.data?.success) {
      setActionResult(`✅ 已撤销 VIP`);
      await loadData();
    } else {
      setActionResult(`❌ 撤销失败: ${res.error || '未知错误'}`);
    }
    setActionLoading(false);
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Crown className="h-6 w-6 text-amber-500" />
            VIP 管理
          </h2>
          <p className="text-sm text-muted-foreground">
            邮箱接入功能内测管理 · 候补名单 + 开通 VIP
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadData()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {error && (
        <Alert className="border-red-500/40 bg-red-500/5">
          <XCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-700 dark:text-red-300">{error}</AlertDescription>
        </Alert>
      )}

      {actionResult && (
        <Alert className="border-emerald-500/40 bg-emerald-500/5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertDescription>{actionResult}</AlertDescription>
        </Alert>
      )}

      {/* 统计卡片 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="候补总数"
          value={loading ? null : data?.stats.waitlistTotal ?? 0}
          icon={<Mail className="h-5 w-5 text-sky-600" />}
          loading={loading}
        />
        <StatCard
          title="待开通"
          value={loading ? null : data?.stats.pendingCount ?? 0}
          icon={<Clock className="h-5 w-5 text-amber-600" />}
          loading={loading}
        />
        <StatCard
          title="已开通"
          value={loading ? null : data?.stats.activatedCount ?? 0}
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          loading={loading}
        />
        <StatCard
          title="VIP 用户"
          value={loading ? null : data?.stats.premiumTotal ?? 0}
          icon={<Crown className="h-5 w-5 text-amber-600" />}
          loading={loading}
        />
      </div>

      {/* 候补名单 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-4 w-4 text-sky-600" />
                候补名单
              </CardTitle>
              <CardDescription>提交邮箱申请内测的用户</CardDescription>
            </div>
            {data && data.waitlist.filter(w => !w.isActivated).length > 0 && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={selectAllPending}>
                  全选待开通
                </Button>
                <Button size="sm" variant="outline" onClick={clearSelection} disabled={selectedIds.size === 0}>
                  清除选择
                </Button>
                <Button
                  size="sm"
                  onClick={batchActivate}
                  disabled={selectedIds.size === 0 || actionLoading}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                >
                  <Crown className="mr-1 h-3 w-3" />
                  批量开通 ({selectedIds.size})
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : data && data.waitlist.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {data.waitlist.map((entry) => (
                <div
                  key={entry.user_id}
                  className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
                    entry.isActivated ? 'border-emerald-500/30 bg-emerald-500/5' : 'hover:bg-muted/50'
                  }`}
                >
                  {!entry.isActivated && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(entry.user_id)}
                      onChange={() => toggleSelect(entry.user_id)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{entry.email}</span>
                      {entry.isActivated ? (
                        <Badge className="border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-600 hover:bg-emerald-500/10">
                          <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
                          已开通
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[9px] text-amber-600 hover:bg-amber-500/10">
                          <Clock className="mr-1 h-2.5 w-2.5" />
                          待开通
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {entry.user_id.substring(0, 8)}... · {new Date(entry.created_at).toLocaleString('zh-CN', { hour12: false })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">暂无候补名单</p>
          )}
        </CardContent>
      </Card>

      {/* VIP 用户列表 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Crown className="h-4 w-4 text-amber-500" />
                VIP 用户
              </CardTitle>
              <CardDescription>已开通 plan='premium' 的用户</CardDescription>
            </div>
            {data && data.premiumUsers.length > 0 && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={selectAllVip}>
                  全选
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedVipIds(new Set())} disabled={selectedVipIds.size === 0}>
                  清除选择
                </Button>
                <Button
                  size="sm"
                  onClick={batchDeactivate}
                  disabled={selectedVipIds.size === 0 || actionLoading}
                  className="bg-red-500 hover:bg-red-600 text-white"
                >
                  <XCircle className="mr-1 h-3 w-3" />
                  批量撤销 ({selectedVipIds.size})
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : data && data.premiumUsers.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {data.premiumUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedVipIds.has(user.id)}
                    onChange={() => toggleVipSelect(user.id)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{user.display_name || user.email || user.id.substring(0, 8)}</span>
                      <Badge className="border-amber-500/30 bg-amber-500/10 text-[9px] text-amber-600 hover:bg-amber-500/10">
                        VIP
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {user.email} · {new Date(user.created_at).toLocaleDateString('zh-CN')}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deactivateUser(user.id)}
                    disabled={actionLoading}
                    className="text-red-500 hover:bg-red-500/10 hover:text-red-600"
                  >
                    撤销
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">暂无 VIP 用户</p>
          )}
        </CardContent>
      </Card>

      {/* 开通说明 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">开通流程</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>1. 用户在 App Settings 看到 "📧 Email Monitor (VIP Beta)" 入口</p>
          <p>2. 用户点击 → 提示加入候补名单 → 滚动到 Premium 卡片</p>
          <p>3. 用户提交邮箱 → 写入 premium_waitlist 表</p>
          <p>4. 管理员在此页面勾选用户 → 点 "批量开通" → 设 profiles.plan='premium'</p>
          <p>5. 用户重新加载 App → 邮箱入口变为正常连接</p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  loading,
}: {
  title: string;
  value: number | null;
  icon: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <Card>
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
      </CardContent>
    </Card>
  );
}
