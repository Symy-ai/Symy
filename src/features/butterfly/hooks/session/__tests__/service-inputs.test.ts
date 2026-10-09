import { describe, expect, it } from 'vitest';

import type {
  GenerateOutlineInput,
  LoadActiveInput,
  PreloadBranchInput,
  PreloadNextChapterInput,
  RegenerateInput,
  StreamStoryInput,
  SubmitChoiceInput,
  TryClientIllustrationInput,
} from '../service-inputs';
import type { ButterflyEndpoints } from '../butterfly-machine';

const eps: ButterflyEndpoints = {
  session: '/s', story: '/st', choice: '/c', illustration: '/i', preloadBranch: '/pb',
} as never;

/**
 * service-inputs.ts (95行) — XState service input 类型件 (Round 62 拆分)。
 *
 * 纯类型件方法论 (R130/R131): 编译期 import 验证 + satisfies 字段锚定防漂移。
 */
describe('service-inputs 类型锚定', () => {
  it('LoadActiveInput 三字段', () => {
    const input = { userId: 'u', isDemo: false, endpoints: eps } satisfies LoadActiveInput;
    expect(Object.keys(input).sort()).toEqual(['endpoints', 'isDemo', 'userId']);
  });

  it('GenerateOutlineInput 含 CreateSessionParams 包装', () => {
    const input = {
      params: { decisionType: 'bought', decisionDescription: 'd', locale: 'zh' },
      userId: null,
      isDemo: true,
      endpoints: eps,
    } satisfies GenerateOutlineInput;
    expect(input.params.decisionType).toBe('bought');
  });

  it('StreamStoryInput: locale 兜底 + demoOverride 可选', () => {
    const input = {
      session: null, isDemo: false, isLight: true, endpoints: eps,
      locale: 'zh',
      demoOverride: { currentChapter: 2, choices: { 1: 'A' } },
    } satisfies StreamStoryInput;
    expect(input.locale).toBe('zh');
    expect(input.demoOverride?.currentChapter).toBe(2);
  });

  it('SubmitChoiceInput: preloadedBranches 记录形状', () => {
    const input = {
      session: null, chapterIndex: 1, selectedOption: 'A', isDemo: false, isLight: true,
      endpoints: eps,
      preloadedBranches: { A: { chapter: {} as never, outline: null, choice: null } },
      pendingChoice: null,
    } satisfies SubmitChoiceInput;
    expect(Object.keys(input.preloadedBranches)).toEqual(['A']);
  });

  it('Regenerate/Preload 两件/TryClientIllustration 键锚', () => {
    const regen = { session: null, chapterIndex: 1, isDemo: false, endpoints: eps } satisfies RegenerateInput;
    expect(regen.chapterIndex).toBe(1);
    const preloadNext = { session: {} as never, isDemo: true, isLight: false, endpoints: eps } satisfies PreloadNextChapterInput;
    expect(Object.keys(preloadNext).length).toBe(4);
    const preloadBranch = { session: {} as never, optionId: 'A', isDemo: true, isLight: false, endpoints: eps } satisfies PreloadBranchInput;
    expect(preloadBranch.optionId).toBe('A');
    const tryIl = {
      chapterIndex: 1, title: 't', tone: 'hopeful' as const, timeSpan: 'x',
      decisionDescription: 'd', decisionType: 'bought' as const,
    } satisfies TryClientIllustrationInput;
    expect(tryIl.tone).toBe('hopeful');
  });
});
