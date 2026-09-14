/**
 * Barrel export for complete-challenge helpers.
 *
 * These helpers were extracted from complete_challenge.ts (2026-07-17/18) to
 * eliminate duplication between the atomic-RPC path and the fallback
 * 5-step path. Each helper is independently unit-testable.
 *
 * See:
 *   - reward-calc.ts — pure reward calculation (no side effects, deterministic seed)
 *   - companion-effects.ts — fires companion-rpc side effects (clarity/intimacy/message)
 *   - metadata-update.ts — updates active_challenges row with completion metadata
 *   - cas-rollback.ts — rolls back challenge status on applyBuddyStateDelta failure
 *   - messages.ts — builds user-visible AI messages (dedup + completion + failure)
 *   - validation.ts — input validation (UUID / status / amount / locale)
 */

export {
  getBaseRewardsForChallengeType,
  rollVariableReward,
  formatRewardTierMessage,
  type RewardTier,
  type BaseRewards,
  type VariableRewardRoll,
} from './reward-calc';

export {
  fireCompletionCompanionEffects,
  type CompletionStatus,
} from './companion-effects';

export {
  updateChallengeMetadataWithPlatform,
  type ChallengeMetadataUpdateInput,
} from './metadata-update';

export {
  rollbackChallengeStatusOnFailure,
} from './cas-rollback';

export {
  buildAlreadyCompletedMessage,
  buildCompletionMessage,
  buildFailureMessage,
  buildFailedReturn,
  type AlreadyCompletedMessageInput,
  type CompletionMessageInput,
  type FailedReturnInput,
} from './messages';

export {
  validateChallengeId,
  normalizeStatus,
  validateSavedAmount,
  normalizeLocale,
  type ChallengeStatus,
} from './validation';
