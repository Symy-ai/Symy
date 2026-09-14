import 'server-only';
/**
 * 系统设置 — 服务端探测逻辑（共享）
 *
 * 被 /api/admin/settings/* 四个路由复用，避免 env / migration / cron 逻辑重复。
 *
 * ⛔ server-only：读取 process.env / 文件系统，绝不进 client bundle。
 * ⛔ 永不返回 env var 的值，只返回 configured true/false。
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import type {
  EnvVarCheck,
  HealthCheckResult,
  MigrationInfo,
  MigrationsOverview,
} from '@/lib/admin-panel/types';

// ── 环境变量检查 ───────────────────────────────────────────────────

interface EnvSpec {
  key: string;
  group: string;
  required: boolean;
  description?: string;
  /** configured = key 本身或任一 alternate 已设 */
  alternates?: string[];
}

/**
 * 必须检查的 env vars（按分组）。
 * required = true 表示应用核心功能依赖此变量（缺失触发红色告警）。
 */
const ENV_SPECS: EnvSpec[] = [
  // Supabase
  { key: 'NEXT_PUBLIC_SUPABASE_URL', group: 'Supabase', required: true, description: 'Supabase 项目 URL' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', group: 'Supabase', required: true, description: 'Service Role / Secret Key（绕过 RLS）', alternates: ['SUPABASE_SECRET_KEY'] },
  // Letta
  { key: 'LETTA_API_KEY', group: 'Letta', required: true, description: 'Letta Cloud API Key（AI 对话）' },
  { key: 'LETTA_BASE_URL', group: 'Letta', required: false, description: 'Letta API 地址（未设则用 https://api.letta.com）' },
  // AI
  { key: 'LETTA_MODEL', group: 'AI', required: false, description: 'Letta 使用的模型（可选）' },
  { key: 'EMBEDDING_API_KEY', group: 'AI', required: false, description: 'Embedding API Key', alternates: ['AGNES_API_KEY'] },
  { key: 'EMBEDDING_BASE_URL', group: 'AI', required: false, description: 'Embedding API 地址', alternates: ['EMBEDDING_API_BASE'] },
  { key: 'EMBEDDING_MODEL', group: 'AI', required: false, description: 'Embedding 模型名' },
  // Email (IMAP)
  { key: 'IMAP_HOST', group: 'Email', required: false, description: 'IMAP 邮件服务器地址' },
  { key: 'IMAP_PORT', group: 'Email', required: false, description: 'IMAP 端口' },
  { key: 'IMAP_USER', group: 'Email', required: false, description: 'IMAP 账号' },
  { key: 'IMAP_PASS', group: 'Email', required: false, description: 'IMAP 密码 / 应用专用密码' },
  // Push (VAPID)
  { key: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', group: 'Push', required: false, description: 'Web Push 公钥' },
  { key: 'VAPID_PRIVATE_KEY', group: 'Push', required: false, description: 'Web Push 私钥' },
  // Other
  { key: 'ADMIN_API_KEY', group: 'Other', required: true, description: 'Admin 面板访问密钥' },
  { key: 'NEXT_PUBLIC_APP_URL', group: 'Other', required: true, description: '应用公网 URL' },
];

/**
 * 检查所有 env vars 的配置状态。
 * ⛔ 只返回 configured true/false，绝不返回值。
 */
export function checkEnvVars(): EnvVarCheck[] {
  return ENV_SPECS.map((spec) => {
    const configured =
      !!process.env[spec.key] ||
      (spec.alternates?.some((alt) => !!process.env[alt]) ?? false);
    return {
      key: spec.key,
      configured,
      required: spec.required,
      group: spec.group,
      ...(spec.description ? { description: spec.description } : {}),
    };
  });
}

// ── Migration 文件 ─────────────────────────────────────────────────

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

/**
 * 列出 supabase/migrations/ 下所有 migration 文件 + 大小，并检测编号冲突。
 *
 * 编号冲突定义：同一短数字前缀（如 109_）出现多次（老 3 位编号方案的合并冲突）。
 * 8 位日期前缀（20260807_）不在此列 —— 同日多 migration 是正常的。
 */
export async function getMigrationsInfo(): Promise<MigrationsOverview> {
  let filenames: string[];
  try {
    filenames = await fs.readdir(MIGRATIONS_DIR);
  } catch (err) {
    logger.error('[Admin Settings] read migrations dir failed:', err);
    return { migrations: [], duplicates: [] };
  }

  // 只保留 .sql 文件
  const sqlFiles = filenames.filter((f) => f.endsWith('.sql')).sort();

  const migrations: MigrationInfo[] = await Promise.all(
    sqlFiles.map(async (filename) => {
      let size = 0;
      try {
        const stat = await fs.stat(path.join(MIGRATIONS_DIR, filename));
        size = stat.size;
      } catch {
        size = 0;
      }
      return { filename, size };
    }),
  );

  // 检测短数字前缀重复（\d{1,4} 后紧跟 _ —— 匹配 001_/109_，不匹配 20260807_）
  const prefixRe = /^(\d{1,4})_/;
  const prefixCounts = new Map<string, number>();
  for (const f of sqlFiles) {
    const m = f.match(prefixRe);
    if (!m) continue;
    const n = (prefixCounts.get(m[1]) ?? 0) + 1;
    prefixCounts.set(m[1], n);
  }
  const duplicates = [...prefixCounts.entries()]
    .filter(([, n]) => n > 1)
    .map(([k]) => k)
    .sort();

  return { migrations, duplicates };
}

// ── Cron 任务（vercel.json） ──────────────────────────────────────

/**
 * 读取 vercel.json 中的 cron 配置。文件缺失或解析失败返回空数组。
 */
export async function getCronJobs(): Promise<{ path: string; schedule: string }[]> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'vercel.json'), 'utf8');
    const parsed = JSON.parse(raw) as { crons?: { path: string; schedule: string }[] };
    return Array.isArray(parsed.crons) ? parsed.crons : [];
  } catch {
    // 无 vercel.json 或解析失败 —— 视为未配置 cron
    return [];
  }
}

// ── 健康检查 ───────────────────────────────────────────────────────

const HEALTH_TIMEOUT_MS = 5000;

/** 带超时的 fetch（AbortController），超时抛 'timeout'。 */
async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 探测 Supabase：用 admin client 查询 profiles 表一行。 */
async function checkSupabase(): Promise<HealthCheckResult> {
  const start = performance.now();
  const { supabase, error } = createAdminClient();
  if (!supabase) {
    return {
      service: 'Supabase',
      status: 'down',
      latencyMs: 0,
      message: error || 'Admin client not configured',
    };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const queryPromise = supabase.from('profiles').select('id').limit(1);
    const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
      timer = setTimeout(() => resolve({ timedOut: true }), HEALTH_TIMEOUT_MS);
    });
    const res = (await Promise.race([queryPromise, timeoutPromise])) as
      | Awaited<typeof queryPromise>
      | { timedOut: true };
    const latencyMs = Math.round(performance.now() - start);
    if ('timedOut' in res) {
      return { service: 'Supabase', status: 'down', latencyMs, message: `超时 (${HEALTH_TIMEOUT_MS}ms)` };
    }
    if (res.error) {
      return { service: 'Supabase', status: 'down', latencyMs, message: res.error.message };
    }
    return { service: 'Supabase', status: 'healthy', latencyMs };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      service: 'Supabase',
      status: 'down',
      latencyMs,
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 探测 Letta：GET /v1/agents。 */
async function checkLetta(): Promise<HealthCheckResult> {
  const start = performance.now();
  const apiKey = process.env.LETTA_API_KEY || '';
  const baseUrl = (process.env.LETTA_BASE_URL || 'https://api.letta.com').replace(/\/+$/, '');
  if (!apiKey) {
    return { service: 'Letta', status: 'degraded', latencyMs: 0, message: 'LETTA_API_KEY 未配置' };
  }
  try {
    const res = await fetchWithTimeout(`${baseUrl}/v1/agents`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const latencyMs = Math.round(performance.now() - start);
    if (res.ok) return { service: 'Letta', status: 'healthy', latencyMs };
    // 401/403 → 凭证问题；5xx → 服务端问题；其他 → degraded
    return {
      service: 'Letta',
      status: res.status === 401 || res.status === 403 ? 'degraded' : 'down',
      latencyMs,
      message: `HTTP ${res.status}`,
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      service: 'Letta',
      status: 'down',
      latencyMs,
      message: aborted ? `超时 (${HEALTH_TIMEOUT_MS}ms)` : (err instanceof Error ? err.message : String(err)),
    };
  }
}

/** 探测 Embedding API：ping base URL（仅探测可达性，不消耗 embedding 调用）。 */
async function checkEmbedding(): Promise<HealthCheckResult> {
  const start = performance.now();
  const apiKey = process.env.EMBEDDING_API_KEY || process.env.AGNES_API_KEY || '';
  const baseUrl = (
    process.env.EMBEDDING_BASE_URL ||
    process.env.EMBEDDING_API_BASE ||
    'https://open.bigmodel.cn/api/paas/v4'
  ).replace(/\/+$/, '');
  if (!apiKey) {
    return { service: 'Embedding', status: 'degraded', latencyMs: 0, message: 'EMBEDDING_API_KEY 未配置' };
  }
  try {
    const res = await fetchWithTimeout(baseUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const latencyMs = Math.round(performance.now() - start);
    // 任何 HTTP 响应都说明服务可达；仅 5xx 视为 down
    if (res.status < 500) return { service: 'Embedding', status: 'healthy', latencyMs };
    return { service: 'Embedding', status: 'down', latencyMs, message: `HTTP ${res.status}` };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      service: 'Embedding',
      status: 'down',
      latencyMs,
      message: aborted ? `超时 (${HEALTH_TIMEOUT_MS}ms)` : (err instanceof Error ? err.message : String(err)),
    };
  }
}

/**
 * 并行探测各服务连通性（Supabase / Letta / Embedding），每个 5s 超时。
 */
export async function runHealthChecks(): Promise<HealthCheckResult[]> {
  const probes = [checkSupabase(), checkLetta(), checkEmbedding()];
  const settled = await Promise.allSettled(probes);
  return settled.map((s, i) => {
    const fallback: HealthCheckResult = {
      service: ['Supabase', 'Letta', 'Embedding'][i],
      status: 'down',
      latencyMs: 0,
      message: '探测器异常',
    };
    if (s.status === 'fulfilled') return s.value;
    return {
      ...fallback,
      message: s.reason instanceof Error ? s.reason.message : String(s.reason),
    };
  });
}
