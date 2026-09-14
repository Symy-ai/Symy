/**
 * 数据库行 → 前端类型映射
 *
 * 所有 butterfly API 路由共享此模块，避免 DRY 违反。
 */

import type { ButterflySession, DecisionType, StoryOutline, StoryTone, StoryChapter, ButterflyChoice } from '../types';
import { parseJsonArray } from '@/lib/json-helpers';
import type { Json } from '@/lib/database.types';

// 🔧 Round 123 audit fix: DB row 类型用 Json (Supabase 实际返回类型)
//    旧代码: outline: StoryOutline | null → TS 报错 (StoryOutline 不赋值给 Json)
//    新代码: outline: Json → dbToSession 内部用 as StoryOutline 转换 (运行时安全)
//    这与 Supabase 的实际行为一致 — JSONB 列返回 Json, 需要业务层 cast
// 🔧 2026-07-17 (migration 118): 加 is_bookmarked + is_example 字段
interface ButterflySessionRow {
  id: string;
  user_id: string;
  decision_type: string;
  decision_description: string;
  amount: number | null;
  platform: string | null;
  context: string | null;
  outline: Json;  // 🔧 Round 123: Json (not StoryOutline) — matches Supabase return type
  current_chapter: number | null;
  chapters: Json;  // 🔧 Round 123: Json (not unknown[]) — matches Supabase return type
  choices: Json;   // 🔧 Round 123: Json (not unknown[]) — matches Supabase return type
  butterfly_effect: string | null;
  final_tone: string | null;
  status: string;
  is_example?: boolean | null;  // 🔧 2026-07-15
  is_bookmarked?: boolean | null;  // 🔧 2026-07-17 (migration 118)
  created_at: string;
  updated_at: string;
}

export function dbToSession(row: ButterflySessionRow): ButterflySession {
  return {
    id: row.id,
    userId: row.user_id,
    decisionType: row.decision_type as DecisionType,
    decisionDescription: row.decision_description,
    amount: row.amount != null ? Math.round(Number(row.amount) * 100) / 100 : null, // Bug 7 fix: ensure 2-decimal precision from DB
    platform: row.platform,
    context: row.context,
    outline: row.outline as StoryOutline | null,
    currentChapter: row.current_chapter ?? 0,
    // 🔧 ARCH fix (Round 78 — JSONB 类型安全): parseJsonArray 替代 `as unknown as`,
    //    确保 chapters/choices 至少是数组 (DB 列损坏时返回 [] 而非运行时 crash)
    chapters: parseJsonArray<StoryChapter>(row.chapters, []),
    choices: parseJsonArray<ButterflyChoice>(row.choices, []),
    butterflyEffect: row.butterfly_effect ?? null,
    finalTone: row.final_tone as StoryTone | null ?? null,
    status: row.status as ButterflySession['status'],
    isExample: row.is_example ?? undefined,
    isBookmarked: row.is_bookmarked ?? false,  // 🔧 2026-07-17 (migration 118)
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
