/**
 * Challenge business rules — single source of truth for challenge type calculation.
 *
 * 🔧 ARCH fix (Round 56 R56-Bug8 — challengeType 业务规则散布 6 个文件):
 *    旧代码: `amount > 200 ? 'boss' : amount > 30 ? 'standard' : 'quick_pass'` 重复在:
 *      - chat-banners.tsx (2 处, 用 i18n key)
 *      - use-challenge-actions.ts (用 'Boss'/'Standard'/'Quick Pass')
 *      - chat-tab.tsx (同上)
 *      - context-builder.ts + chat/route.ts (用小写)
 *      - challenge/complete/route.ts
 *      - complete_challenge.ts
 *      - calculate_challenge_type() SQL trigger (migration 031)
 *    问题: 若阈值变化 (e.g. 200→500), 需改 8 处 + SQL, 容易漏改 → 数据不一致。
 *    根因修复: 提取共享 helper, 业务规则只在 1 处定义。
 *
 * 复杂度转移: 业务规则从各组件/route 转移到架构层, 改阈值只改 1 处。
 * 高内聚低耦合: challenge 相关规则内聚到 challenge-rules.ts, 其他文件只依赖接口。
 */

export type ChallengeType = 'quick_pass' | 'standard' | 'boss';

/** Challenge type 阈值 (与 migration 031 calculate_challenge_type() 一致) */
export const CHALLENGE_THRESHOLDS = {
  QUICK_PASS_MAX: 30,
  STANDARD_MAX: 200,
} as const;

/**
 * 根据 amount 计算 challenge type。
 *
 * - amount ≤ 30 → quick_pass
 * - 30 < amount ≤ 200 → standard
 * - amount > 200 → boss
 *
 * 与 SQL trigger calculate_challenge_type() (migration 031) 保持一致。
 *
 * 🔧 ARCH fix (Round 57 REVIEW-A-7): NaN/负数 guard — 返回 'quick_pass' (最保守)
 */
export function getChallengeType(amount: number): ChallengeType {
  // 🔧 ARCH fix (Round 57 REVIEW-A-7): NaN/负数/非有限数 → quick_pass (最保守, 不给 boss 奖励)
  if (!Number.isFinite(amount) || amount <= 0) return 'quick_pass';
  if (amount <= CHALLENGE_THRESHOLDS.QUICK_PASS_MAX) return 'quick_pass';
  if (amount <= CHALLENGE_THRESHOLDS.STANDARD_MAX) return 'standard';
  return 'boss';
}

/**
 * Get display label for challenge type (English, for logging/internal use).
 * For UI display, use i18n keys: chat.challengeTiers.quickPass / standard / boss
 */
export function getChallengeTypeLabel(type: ChallengeType): string {
  switch (type) {
    case 'quick_pass': return 'Quick Pass';
    case 'standard': return 'Standard';
    case 'boss': return 'Boss';
  }
}

/**
 * Convenience: amount → display label (English).
 */
export function getChallengeTypeLabelByAmount(amount: number): string {
  return getChallengeTypeLabel(getChallengeType(amount));
}

/**
 * Get i18n key suffix for challenge type (for use with t() function).
 *
 * @example
 * ```tsx
 * const tierKey = getChallengeTypeI18nKey(amount);
 * // tierKey = 'boss' | 'standard' | 'quickPass'
 * return t(`chat.challengeTiers.${tierKey}`);
 * ```
 */
export function getChallengeTypeI18nKey(amount: number): 'quickPass' | 'standard' | 'boss' {
  const type = getChallengeType(amount);
  switch (type) {
    case 'quick_pass': return 'quickPass';
    case 'standard': return 'standard';
    case 'boss': return 'boss';
  }
}
