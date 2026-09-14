/**
 * Demo Mode — In-memory session store
 *
 * Stores demo butterfly sessions in memory (no Supabase required).
 * Sessions are identified by a UUID and persist for the lifetime of the server process.
 *
 * Note: In serverless environments, this store resets on cold starts.
 * For demo purposes, this is acceptable — the session only needs to last
 * as long as the user is actively using it.
 */

import type { ButterflySession, CreateSessionParams } from '@/features/butterfly/types';
import { generateDemoOutline } from '@/features/butterfly/lib/demo-content';

// ============================================================
// In-memory store
// ============================================================

const demoSessions = new Map<string, ButterflySession>();

// Auto-cleanup: remove sessions older than 2 hours
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
// 🔧 2026-07-15 (ARCH-3 #11 修复): max-size cap — 防止内存泄漏
//    旧代码: 只有 TTL 清理, 无 max-size → 高流量下 Map 无限增长 (每个 demo session ~5KB)
//    修复: 超过 MAX_SESSIONS 时, 删除最旧的 session (LRU eviction)
const MAX_SESSIONS = 200;
const sessionTimestamps = new Map<string, number>();

function cleanupExpiredSessions() {
  const now = Date.now();
  // 1. 清理过期 session
  for (const [id, timestamp] of sessionTimestamps) {
    if (now - timestamp > SESSION_TTL_MS) {
      demoSessions.delete(id);
      sessionTimestamps.delete(id);
    }
  }
  // 2. 🔧 2026-07-15: 如果超过 MAX_SESSIONS, 删除最旧的 (LRU)
  if (demoSessions.size > MAX_SESSIONS) {
    // 按 timestamp 排序, 删除最旧的直到 size <= MAX_SESSIONS
    const sorted = [...sessionTimestamps.entries()].sort((a, b) => a[1] - b[1]);
    const toDelete = sorted.slice(0, demoSessions.size - MAX_SESSIONS);
    for (const [id] of toDelete) {
      demoSessions.delete(id);
      sessionTimestamps.delete(id);
    }
  }
}

// 🔧 ARCH fix (Round 39 L1 — 模块级 setInterval 全局运行, 已登录用户也启动):
//    旧代码: 任何 import 此模块的页面都启动 10 分钟定时器, 已登录用户不需要 demo session 清理。
//    根因修复: 改为惰性清理 — 每次 getDemoSession 调用时检查并清理过期 session (无需 setInterval)。
//    注: cleanupExpiredSessions 已在 getDemoSession 内调用 (line 82), setInterval 是冗余的。

// ============================================================
// Public API
// ============================================================

/**
 * Create a new demo session and store it in memory.
 */
export function createDemoSession(params: CreateSessionParams): ButterflySession {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const outline = generateDemoOutline(params.decisionType, params.decisionDescription, params.locale);

  const session: ButterflySession = {
    id,
    userId: 'demo-user',
    decisionType: params.decisionType,
    decisionDescription: params.decisionDescription,
    amount: params.amount ?? null,
    platform: params.platform ?? null,
    context: params.context ?? null,
    outline,
    currentChapter: 0,
    chapters: [],
    choices: [],
    butterflyEffect: null,
    finalTone: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  demoSessions.set(id, session);
  sessionTimestamps.set(id, Date.now());

  return session;
}

/**
 * Get a demo session by ID.
 */
export function getDemoSession(sessionId: string): ButterflySession | null {
  cleanupExpiredSessions();
  return demoSessions.get(sessionId) ?? null;
}

// 🔧 TECH-DEBT-H: Narrow update type to prevent overwriting identity fields
type SafeButterflySessionUpdate = Partial<Omit<ButterflySession, 'id' | 'userId' | 'createdAt'>>;

/**
 * Update a demo session in memory.
 * Identity fields (id, userId, createdAt) cannot be overwritten.
 */
export function updateDemoSession(sessionId: string, updates: SafeButterflySessionUpdate): ButterflySession | null {
  const existing = demoSessions.get(sessionId);
  if (!existing) return null;

  const updated: ButterflySession = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  demoSessions.set(sessionId, updated);
  sessionTimestamps.set(sessionId, Date.now());

  return updated;
}

/**
 * Delete a demo session.
 */
export function deleteDemoSession(sessionId: string): boolean {
  sessionTimestamps.delete(sessionId);
  return demoSessions.delete(sessionId);
}
