import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GREEN_ALTERNATIVES,
  suggestAlternative,
} from '@/lib/green-alternatives';
import {
  buildChallengePrompt,
  CHALLENGE_LENSES,
  selectLens,
} from '../challenge-prompt';

vi.mock('@/lib/green-alternatives', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/green-alternatives')>();
  return {
    ...actual,
    suggestAlternative: vi.fn(actual.suggestAlternative),
  };
});

const GREEN_LENS_RANDOM_VALUE = 0.2;

function forceGreenLens() {
  vi.spyOn(Math, 'random').mockReturnValue(GREEN_LENS_RANDOM_VALUE);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('challenge-prompt green alternatives', () => {
  it('GREEN LENS 命中时注入词库完整话术', () => {
    forceGreenLens();

    const prompt = buildChallengePrompt('我想买件新皮草外套', 299, 30);
    const fur = GREEN_ALTERNATIVES.find((entry) => entry.id === 'fur');
    const suggestion = fur ? `${fur.alternative.zh}${fur.reuse.zh}` : '';

    expect(prompt).toContain('For THIS item, a greener path exists:');
    expect(prompt).toContain(suggestion);
    expect(prompt).toContain(CHALLENGE_LENSES[1]);
  });

  it('一次性塑料与电池类目也能命中词术', () => {
    forceGreenLens();

    const plasticPrompt = buildChallengePrompt('一次性塑料杯子', 5, 20);
    const batteryPrompt = buildChallengePrompt('5号电池', 12, 20);

    expect(plasticPrompt).toContain(
      '不锈钢或玻璃的耐用版能用很多年，摊到每次的使用成本反而更低。',
    );
    expect(batteryPrompt).toContain(
      '充电电池配充电器能循环用几百次，单次成本远低于一次性电池。',
    );
  });

  it('未命中时 GREEN LENS 原文保持不变', () => {
    forceGreenLens();

    const prompt = buildChallengePrompt('xyzabc', 20, 20);

    expect(prompt).not.toContain('greener path exists');
    expect(prompt).toContain(CHALLENGE_LENSES[1]);
  });

  it('selectLens 支持固定索引且五个视角均可选中', () => {
    CHALLENGE_LENSES.forEach((lens, index) => {
      expect(selectLens(CHALLENGE_LENSES, index)).toBe(lens);
    });
  });

  it('保留既有禁编造纪律', () => {
    forceGreenLens();

    const prompt = buildChallengePrompt('皮草', 100, 20);

    expect(prompt).toContain('Do NOT invent');
    expect(prompt).toContain('NO FABRICATION');
  });

  it('词库异常时静默降级', () => {
    forceGreenLens();
    vi.mocked(suggestAlternative).mockImplementation(() => {
      throw new Error('library failure');
    });

    const prompt = buildChallengePrompt('皮草', 100, 20);

    expect(prompt).not.toContain('greener path exists');
    expect(prompt).toContain(CHALLENGE_LENSES[1]);
  });
});
