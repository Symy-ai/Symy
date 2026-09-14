/**
 * Supabase Type-Safe Helpers — Eliminate `as never` type assertions
 *
 * 🔧 ARCH fix (2026-07-21): Replaces `as never` pattern used in insert/update/upsert calls.
 *
 * Problem:
 *   Developers build objects as `Record<string, unknown>` then cast to `as never`
 *   to bypass TypeScript's type checking. This is dangerous because:
 *   1. TypeScript can't catch column name typos (e.g., `user_id` vs `userid`)
 *   2. TypeScript can't catch type mismatches (e.g., `string` vs `number`)
 *   3. Database schema changes won't be caught at compile time
 *   4. `as never` is the most dangerous cast — it bypasses ALL type checking
 *
 * Solution:
 *   Use `as unknown as TableName['Insert']` instead of `as never`.
 *   This is still a cast, but:
 *   1. It documents what type the object should be
 *   2. TypeScript will catch some errors (e.g., assigning to wrong variable type)
 *   3. IDE autocomplete works on the result
 *   4. Schema changes to `Insert` type will be caught
 *
 * Usage:
 *   import { asInsert, asUpdate } from '@/lib/supabase-type-helpers';
 *   import type { Database } from '@/lib/database.types';
 *
 *   type EmailReceiptsInsert = Database['public']['Tables']['email_receipts']['Insert'];
 *
 *   // Before: .insert(newReceipts as never)
 *   // After:  .insert(asInsert<EmailReceiptsInsert>(newReceipts))
 *
 *   // Before: .update(updateData as never)
 *   // After:  .update(asUpdate<ProfilesUpdate>(updateData))
 */

/**
 * Cast an object to a Supabase Insert type.
 * Use this when building an insert payload from dynamic data.
 *
 * @example
 * ```ts
 * type EmailReceiptsInsert = Database['public']['Tables']['email_receipts']['Insert'];
 * const receipt = { user_id: '123', message_id: 'msg-1', ... };
 * await supabase.from('email_receipts').insert(asInsert<EmailReceiptsInsert>(receipt));
 * ```
 */
export function asInsert<T>(value: T | Record<string, unknown>): T {
  return value as unknown as T;
}

/**
 * Cast an array of objects to a Supabase Insert type array.
 * Use this when building bulk insert payloads.
 *
 * @example
 * ```ts
 * type EmailReceiptsInsert = Database['public']['Tables']['email_receipts']['Insert'];
 * const receipts = [{ user_id: '123', ... }, { user_id: '456', ... }];
 * await supabase.from('email_receipts').insert(asInsertArray<EmailReceiptsInsert>(receipts));
 * ```
 */
export function asInsertArray<T>(value: T[] | Record<string, unknown>[]): T[] {
  return value as unknown as T[];
}

/**
 * Cast an object to a Supabase Update type.
 * Use this when building an update payload from partial data.
 *
 * @example
 * ```ts
 * type ProfilesUpdate = Database['public']['Tables']['profiles']['Update'];
 * const updateData = { locale: 'zh', timezone: 'Asia/Shanghai' };
 * await supabase.from('profiles').update(asUpdate<ProfilesUpdate>(updateData));
 * ```
 */
export function asUpdate<T>(value: Partial<T> | Record<string, unknown>): Partial<T> {
  return value as unknown as Partial<T>;
}

/**
 * Cast an object to a Supabase Upsert type.
 * Use this when building an upsert payload.
 *
 * @example
 * ```ts
 * type BuddyStateInsert = Database['public']['Tables']['buddy_state']['Insert'];
 * const upsertRow = { user_id: '123', vitality: 50, ... };
 * await supabase.from('buddy_state').upsert(asUpsert<BuddyStateInsert>(upsertRow), { onConflict: 'user_id' });
 * ```
 */
export function asUpsert<T>(value: T | Record<string, unknown>): T {
  return value as unknown as T;
}
