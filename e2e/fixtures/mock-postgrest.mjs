/**
 * Mock PostgREST — transparency e2e 的确定性数据源 (batch85-b)
 *
 * 为什么需要它: /transparency 页面与 OG 卡是 RSC 服务端直调 loadTransparencyWeekly() /
 * loadGrowthStats() (supabase-js → PostgREST), 浏览器层 page.route 拦截不到 SSR 数字。
 * 本文件用 Node 内置 http 仿真 PostgREST 最小子集 (GET select / 写入一律成功),
 * dev server 指向它后, SSR 链路吃到固定数字。
 *
 * 用法 (见 e2e/transparency.spec.ts 文件头):
 *   node e2e/fixtures/mock-postgrest.mjs &
 *   E2E_TRANSPARENCY_MOCK=1 \
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 \
 *   SUPABASE_SERVICE_ROLE_KEY=sb_secret_e2e_local_mock \
 *   npx playwright test e2e/transparency.spec.ts --workers=1
 *
 * fail-mode: GET /__e2e/fail-mode?on=1 使所有 /rest/v1/* 返回 500 —
 * 用于验证页面 / OG 的降级分支 (恒 200 不抛 5xx)。?on=0 关闭。
 *
 * 口径锚点 (数字与 transparency.spec.ts 的 EXPECTED 一一对应, 改这里须同步 spec):
 * - health_events:     本周 12 条 + 往周 5 条 (challenge_completed / challenge_failed)
 * - active_challenges: 本周 120+100+120 = $340, 往周 3×220 = $660 (status=passed)
 * - profiles:          42 行 → 守护者 42
 * - invitations:       4 completed + 2 pending, 5 个去重邀请者 → K = 4/5 = 0.8
 * - transparency_snapshots: 读恒空, 写恒成功 (降级阶梯里不劫持页面)
 */

import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_POSTGREST_PORT || 54399);
let failMode = false;

/** 本周时刻 = 本 UTC 周已流逝部分的中点 — 任何时刻请求都严格落在当前周内 */
function timestamps() {
  const now = new Date();
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dow = (now.getUTCDay() + 6) % 7; // Monday=0
  const weekStartMs = dayStart - dow * 86_400_000;
  return {
    week: new Date(weekStartMs + (now.getTime() - weekStartMs) / 2).toISOString(),
    old: new Date(weekStartMs - 10 * 86_400_000).toISOString(),
  };
}

function tableRows(table) {
  const { week, old } = timestamps();
  switch (table) {
    case 'health_events': {
      const weekRows = Array.from({ length: 12 }, (_, i) => ({
        id: `e2e-health-week-${i}`,
        user_id: `user-${i % 4}`,
        event_type: i % 2 === 0 ? 'challenge_completed' : 'challenge_failed',
        trigger_id: `trigger-week-${i}`,
        created_at: week,
      }));
      const oldRows = Array.from({ length: 5 }, (_, i) => ({
        id: `e2e-health-old-${i}`,
        user_id: `user-${i % 4}`,
        event_type: 'challenge_completed',
        trigger_id: `trigger-old-${i}`,
        created_at: old,
      }));
      return [...weekRows, ...oldRows];
    }
    case 'active_challenges': {
      const weekRows = [120, 100, 120].map((amount) => ({ amount, completed_at: week }));
      const oldRows = [220, 220, 220].map((amount) => ({ amount, completed_at: old }));
      return [...weekRows, ...oldRows];
    }
    case 'profiles':
      return Array.from({ length: 42 }, (_, i) => ({
        created_at: i === 41 ? week : old,
      }));
    case 'invitations':
      return [
        { referrer_user_id: 'inviter-a', status: 'completed' },
        { referrer_user_id: 'inviter-a', status: 'completed' },
        { referrer_user_id: 'inviter-b', status: 'completed' },
        { referrer_user_id: 'inviter-c', status: 'completed' },
        { referrer_user_id: 'inviter-d', status: 'pending' },
        { referrer_user_id: 'inviter-e', status: 'pending' },
      ];
    default:
      return [];
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);

  if (url.pathname === '/__e2e/fail-mode') {
    failMode = url.searchParams.get('on') === '1';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ failMode }));
    return;
  }

  if (url.pathname.startsWith('/auth/v1/')) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'mock: no session' }));
    return;
  }

  if (url.pathname.startsWith('/rest/v1/')) {
    if (failMode) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'mock fail-mode: aggregation upstream down' }));
      return;
    }
    if (req.method === 'GET') {
      const table = url.pathname.slice('/rest/v1/'.length).split('/')[0] ?? '';
      const rows = tableRows(table);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Range': rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : '*/0',
      });
      res.end(JSON.stringify(rows));
      return;
    }
    // POST/PATCH/PUT — snapshot 持久化等 upsert 类写入一律成功 (204 = return=minimal)
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: `mock: unmatched ${req.method} ${url.pathname}` }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-postgrest] listening on http://127.0.0.1:${PORT} (transparency e2e fixture)`);
});
