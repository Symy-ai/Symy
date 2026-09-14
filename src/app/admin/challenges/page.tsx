'use client';

/**
 * 每周社区挑战管理页
 *
 * POST /api/admin/create-weekly-challenges body: { weekOffset: number }
 *   weekOffset: -4 ~ 4，0=本周，1=下周，-1=上周
 *
 * 后端已迁移到 verifyAdminAuth（支持 Authorization: Bearer），
 * 前端统一用 adminPost。
 */

import { useState } from 'react';
import { adminPost } from '@/lib/admin-panel/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ResultDisplay, type ActionResult } from '@/components/admin-panel/result-display';
import { Trophy, Play, Calendar } from 'lucide-react';

const OFFSET_LABELS: Record<number, string> = {
  [-4]: '4 周前', [-3]: '3 周前', [-2]: '2 周前', [-1]: '上周',
  0: '本周',
  1: '下周', 2: '2 周后', 3: '3 周后', 4: '4 周后',
};

export default function AdminChallengesPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [result, setResult] = useState<ActionResult>({ action: 'create_weekly_challenges', status: 'idle' });

  async function create() {
    const offset = Math.max(-4, Math.min(4, Math.round(Number(weekOffset) || 0)));
    setResult({ action: 'create_weekly_challenges', status: 'loading' });
    const res = await adminPost('/api/admin/create-weekly-challenges', { weekOffset: offset });
    setResult({
      action: 'create_weekly_challenges',
      status: res.ok ? 'success' : 'error',
      response: res.data,
      error: res.error,
      timestamp: new Date().toLocaleTimeString(),
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">每周社区挑战</h2>
        <p className="text-sm text-muted-foreground">手动触发 create_weekly_challenges RPC · 同时标记过期挑战为 inactive</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4 text-amber-600" />
            创建每周挑战
          </CardTitle>
          <CardDescription>
            POST /api/admin/create-weekly-challenges · body: {`{ weekOffset: number }`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="week-offset" className="flex items-center gap-2 text-xs">
              <Calendar className="h-3.5 w-3.5" />
              Week Offset（-4 ~ 4）
            </Label>
            <div className="flex items-center gap-3">
              <Input
                id="week-offset"
                type="number"
                min={-4}
                max={4}
                value={weekOffset}
                onChange={(e) => setWeekOffset(Number(e.target.value))}
                className="w-32 font-mono text-sm"
              />
              <Badge variant="outline" className="text-sm">
                {OFFSET_LABELS[weekOffset] || '本周'}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              0 = 本周 · 正数 = 未来第 N 周 · 负数 = 过去第 N 周
            </p>
          </div>

          {/* 快捷选择 */}
          <div className="flex flex-wrap gap-2">
            {[-1, 0, 1].map((o) => (
              <Button
                key={o}
                type="button"
                variant={weekOffset === o ? 'default' : 'outline'}
                size="sm"
                onClick={() => setWeekOffset(o)}
              >
                {OFFSET_LABELS[o]}
              </Button>
            ))}
          </div>

          <Button size="sm" onClick={create} disabled={result.status === 'loading'}>
            <Play className="mr-2 h-3 w-3" />
            创建挑战
          </Button>

          <ResultDisplay result={result} />
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">使用说明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>• 本接口调用 Supabase RPC <code className="rounded bg-muted px-1 font-mono">create_weekly_challenges(p_week_offset)</code></p>
          <p>• 若 migration 100 未应用，会自动 fallback 到直接 INSERT</p>
          <p>• 同时标记已过期挑战为 <code className="rounded bg-muted px-1 font-mono">inactive</code></p>
          <p>• 生产环境通常由 Vercel Cron 自动触发，此页面用于手动补建 / 测试</p>
        </CardContent>
      </Card>
    </div>
  );
}
