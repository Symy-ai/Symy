'use client';

/**
 * 修身阶段管理页
 *
 * GET  /api/admin/cultivation?action=stats             — 全平台统计
 * GET  /api/admin/cultivation?action=profile&user_id=  — 单用户画像
 * POST /api/admin/cultivation?action=assess&user_id=   — 手动评估单用户
 * POST /api/admin/cultivation?action=assess_all        — 批量评估（⚠️）
 */

import { useState, type FormEvent } from 'react';
import { adminGet, adminPost } from '@/lib/admin-panel/api-client';
import type { CultivationStats, CultivationProfile } from '@/lib/admin-panel/types';
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
import { Sparkles, RefreshCw, UserSearch, AlertTriangle, Play } from 'lucide-react';

const STAGE_LABELS: Record<string, string> = {
  zhi_yu: '致知',
  zhi_zhi: '知至',
  cheng_yi: '诚意',
  zheng_xin: '正心',
};
const SEVERITY_LABELS: Record<string, string> = {
  severe: '严重',
  moderate: '中度',
  light: '轻度',
};

export default function AdminCultivationPage() {
  const [stats, setStats] = useState<CultivationStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [profileUserId, setProfileUserId] = useState('');
  const [profile, setProfile] = useState<CultivationProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileResult, setProfileResult] = useState<ActionResult>({ action: 'profile', status: 'idle' });

  const [assessUserId, setAssessUserId] = useState('');
  const [assessResult, setAssessResult] = useState<ActionResult>({ action: 'assess', status: 'idle' });

  const [assessAllResult, setAssessAllResult] = useState<ActionResult>({ action: 'assess_all', status: 'idle' });

  async function loadStats() {
    setStatsLoading(true);
    const res = await adminGet<CultivationStats>('/api/admin/cultivation?action=stats');
    setStats(res.ok && res.data ? res.data : null);
    setStatsLoading(false);
  }

  async function loadProfile(e: FormEvent) {
    e.preventDefault();
    if (!profileUserId.trim()) return;
    setProfileLoading(true);
    setProfileResult({ action: 'profile', status: 'loading' });
    const res = await adminGet<{ profile: CultivationProfile }>(`/api/admin/cultivation?action=profile&user_id=${encodeURIComponent(profileUserId.trim())}`);
    if (res.ok && res.data?.profile) {
      setProfile(res.data.profile);
      setProfileResult({ action: 'profile', status: 'success', response: res.data, timestamp: new Date().toLocaleTimeString() });
    } else {
      setProfile(null);
      setProfileResult({ action: 'profile', status: 'error', error: res.error, timestamp: new Date().toLocaleTimeString() });
    }
    setProfileLoading(false);
  }

  async function assessUser() {
    if (!assessUserId.trim()) {
      setAssessResult({ action: 'assess', status: 'error', error: '请输入 user_id', timestamp: new Date().toLocaleTimeString() });
      return;
    }
    setAssessResult({ action: 'assess', status: 'loading' });
    const res = await adminPost(`/api/admin/cultivation?action=assess&user_id=${encodeURIComponent(assessUserId.trim())}`, {});
    setAssessResult({
      action: 'assess',
      status: res.ok ? 'success' : 'error',
      response: res.data,
      error: res.error,
      timestamp: new Date().toLocaleTimeString(),
    });
  }

  async function assessAll() {
    setAssessAllResult({ action: 'assess_all', status: 'loading' });
    const res = await adminPost('/api/admin/cultivation?action=assess_all', {});
    setAssessAllResult({
      action: 'assess_all',
      status: res.ok ? 'success' : 'error',
      response: res.data,
      error: res.error,
      timestamp: new Date().toLocaleTimeString(),
    });
    loadStats(); // 刷新统计
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">修身阶段管理</h2>
          <p className="text-sm text-muted-foreground">severity_tier + cultivation_stage 双维度评估</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadStats} disabled={statsLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${statsLoading ? 'animate-spin' : ''}`} />
          刷新统计
        </Button>
      </div>

      {/* 统计 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">cultivation_stage 分布</CardTitle>
            <CardDescription>东方定风格 · 致知/知至/诚意/正心</CardDescription>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : stats?.by_cultivation_stage && Object.keys(stats.by_cultivation_stage).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(stats.by_cultivation_stage).map(([stage, count]) => (
                  <StatBar key={stage} label={STAGE_LABELS[stage] || stage} count={count as number} total={stats.total ?? 0} color="bg-amber-500" />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">暂无数据</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">severity_tier 分布</CardTitle>
            <CardDescription>西方定强度 · severe/moderate/light</CardDescription>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : stats?.by_severity_tier && Object.keys(stats.by_severity_tier).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(stats.by_severity_tier).map(([sev, count]) => {
                  const color = sev === 'severe' ? 'bg-rose-500' : sev === 'moderate' ? 'bg-amber-500' : 'bg-emerald-500';
                  return <StatBar key={sev} label={SEVERITY_LABELS[sev] || sev} count={count as number} total={stats.total ?? 0} color={color} />;
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">暂无数据</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 单用户画像 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserSearch className="h-4 w-4 text-sky-600" />
            单用户画像
          </CardTitle>
          <CardDescription>GET ?action=profile&user_id=UUID</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={loadProfile} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="profile-uid" className="text-xs">User ID</Label>
              <Input
                id="profile-uid"
                value={profileUserId}
                onChange={(e) => setProfileUserId(e.target.value)}
                placeholder="UUID"
                className="font-mono text-sm"
              />
            </div>
            <Button type="submit" disabled={profileLoading} size="sm">
              <UserSearch className="mr-2 h-3.5 w-3.5" />
              查询
            </Button>
          </form>

          {profile && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ProfileField label="User ID" value={profile.userId} mono />
              <ProfileField label="severity_tier" value={SEVERITY_LABELS[profile.severityTier] || profile.severityTier} badge />
              <ProfileField label="cultivation_stage" value={STAGE_LABELS[profile.cultivationStage] || profile.cultivationStage} badge />
              <ProfileField label="last_reassessed_at" value={profile.lastReassessedAt || '从未'} />
              {profile.weeklyImpulseCount != null && (
                <ProfileField label="weekly_impulse_count" value={String(profile.weeklyImpulseCount)} />
              )}
              {profile.monthlyImpulseCount != null && (
                <ProfileField label="monthly_impulse_count" value={String(profile.monthlyImpulseCount)} />
              )}
              {profile.monthlyChallengePassRate != null && (
                <ProfileField label="monthly_challenge_pass_rate" value={`${(profile.monthlyChallengePassRate * 100).toFixed(0)}%`} />
              )}
            </div>
          )}

          <ResultDisplay result={profileResult} />
        </CardContent>
      </Card>

      {/* 手动评估 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-amber-600" />
              手动评估单用户
            </CardTitle>
            <CardDescription>POST ?action=assess&user_id=UUID</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="assess-uid" className="text-xs">User ID</Label>
                <Input
                  id="assess-uid"
                  value={assessUserId}
                  onChange={(e) => setAssessUserId(e.target.value)}
                  placeholder="UUID"
                  className="font-mono text-sm"
                />
              </div>
              <Button size="sm" onClick={assessUser} disabled={assessResult.status === 'loading'}>
                <Play className="mr-2 h-3 w-3" />
                执行评估
              </Button>
              <ResultDisplay result={assessResult} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-rose-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-rose-600">
              <AlertTriangle className="h-4 w-4" />
              批量评估所有用户
            </CardTitle>
            <CardDescription>POST ?action=assess_all · ⚠️ 耗 DB 查询，慎用</CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <AlertTriangle className="mr-2 h-3.5 w-3.5" />
                  执行批量评估（需确认）
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认批量评估？</AlertDialogTitle>
                  <AlertDialogDescription>
                    将对所有用户重新计算 severity_tier 和 cultivation_stage。处理大量用户时可能耗时较长（最长 5 分钟）。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={assessAll} className="bg-rose-600 text-white hover:bg-rose-500">
                    确认执行
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <ResultDisplay result={assessAllResult} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{count} ({pct}%)</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ProfileField({ label, value, mono, badge }: { label: string; value: string; mono?: boolean; badge?: boolean }) {
  return (
    <div className="rounded-md border p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      {badge ? (
        <Badge variant="outline" className="mt-1">{value}</Badge>
      ) : (
        <div className={`mt-0.5 text-sm ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
      )}
    </div>
  );
}
