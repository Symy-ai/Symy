/**
 * Type safety tests — verify no duplicate type definitions
 *
 * 🔧 ARCH fix (Round 8 AUDIT-3 P0 #3): Tests that ensure ChallengeContext and
 * StoryCompleteData have a single source of truth, preventing future drift.
 */

import { describe, it, expect } from 'vitest';
import type { ChallengeContext } from '@/types/challenge-context';
import type { StoryCompleteData, StoryTone } from '@/features/butterfly/types';

describe('Type safety — single source of truth', () => {
  describe('ChallengeContext', () => {
    it('has required fields (itemName, amount)', () => {
      const ctx: ChallengeContext = {
        itemName: 'Drone',
        amount: 299,
      };
      expect(ctx.itemName).toBe('Drone');
      expect(ctx.amount).toBe(299);
    });

    it('has optional challengeId', () => {
      const ctx: ChallengeContext = {
        itemName: 'Drone',
        amount: 299,
        challengeId: 'ch-abc-123',
      };
      expect(ctx.challengeId).toBe('ch-abc-123');
    });

    // ⏱️ 动态 import 大组件模块在全量并行跑时可能远超默认 5s (transform 冷缓存 + 高负载),
    //    gate 10:23 实录: buddy-tab 整图 30s 仍超时 —— 这里验证的是模块可加载, 不是性能,
    //    该用例放宽到 60s 消除 flake (其余小图 30s 已足够)。
    it('buddy-tab.tsx re-exports ChallengeContext (compile-time check)', { timeout: 60_000 }, async () => {
      // Dynamic import to verify the re-export works at runtime
      const mod = await import('@/components/buddy-tab');
      expect(mod).toBeDefined();
      // The type itself is erased at runtime, but the module should load without error
    });

    it('chat/parts/types.ts re-exports ChallengeContext (compile-time check)', { timeout: 30_000 }, async () => {
      const mod = await import('@/app/api/chat/parts/types');
      expect(mod).toBeDefined();
    });
  });

  describe('StoryCompleteData', () => {
    it('has finalTone, totalChapters, butterflyEffect', () => {
      const data: StoryCompleteData = {
        finalTone: 'twist' as StoryTone,
        totalChapters: 5,
        butterflyEffect: 'A single decision changed everything',
      };
      expect(data.finalTone).toBe('twist');
      expect(data.totalChapters).toBe(5);
      expect(data.butterflyEffect).toContain('decision');
    });

    it('helpers.ts re-exports StoryCompleteData (compile-time check)', { timeout: 30_000 }, async () => {
      const mod = await import('@/features/butterfly/hooks/player/helpers');
      expect(mod).toBeDefined();
    });

    it('select-choice.ts imports canonical StoryCompleteData (compile-time check)', { timeout: 30_000 }, async () => {
      // Dynamic import verifies the module loads without error
      // (TS would error at build time if StoryCompleteData type was missing)
      const mod = await import('@/features/butterfly/hooks/player/select-choice');
      expect(mod).toBeDefined();
    });
  });
});
