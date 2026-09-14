import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../en.json';
import zh from '../zh.json';

const SOURCE_ROOT = join(process.cwd(), 'src');

const DYNAMIC_CALL_EXEMPTIONS = new Set([
  // Dream-fund names and proactive-message keys can be user- or server-generated data.
  'src/lib/demo-data.ts',
  'src/components/buddy/proactive-message-banner.tsx',
  'src/components/buddy/intercept-medal-banner.tsx',
  // These components build keys from finite typed runtime enums; their dictionary segments are asserted below.
  'src/components/buddy/challenge-modal.tsx',
  'src/components/buddy/companion-detail-modal.tsx',
  'src/components/buddy/hero-section.tsx',
  'src/components/buddy/badges-section.tsx',
  'src/components/buddy/daily-tasks-checklist.tsx',
  'src/components/chat/hooks/use-mcp-notifications.ts',
  'src/components/buddy/growth-stage-badge.tsx',
  'src/components/buddy/growth-milestone-overlay.tsx',
  // These data-driven configs provide their keys and localized fallbacks alongside the payload.
  'src/components/chat/variable-reward-overlay.tsx',
  'src/components/chat/parts/intercept-reason-chip.tsx',
  'src/components/share/share-modal.tsx',
  'src/components/share/challenge-card.tsx',
  'src/features/defense/components/inducement-strategies.tsx',
  'src/features/defense/components/daily-reflection.tsx',
  'src/components/common/multi-platform-share.tsx',
  'src/features/defense/components/community-challenge-card.tsx',
  'src/features/defense/components/defense-tab-demo.tsx',
  'src/components/profile/premium-card.tsx',
  'src/components/profile/invite-card.tsx',
  'src/components/share/invite-card.tsx',
  'src/components/daily-green-report.tsx',
  // Guard rank progress keys are built from a finite typed runtime enum; see GuardRankProgressSection CHANNEL_META.
  'src/components/profile-parts/guard-rank-progress-section.tsx',
  // Guard season banner keys are built from a finite typed runtime enum (season.id).
  'src/components/home/guard-season-banner.tsx',
]);

const DYNAMIC_KEY_EXEMPTIONS = new Set([
  // Badge, growth-stage, and personality ids are interpolated from the finite enums asserted below.
  'buddy.badgeNames.',
  'buddy.growthStage.',
  'buddy.growthStageDesc.',
  'buddy.personality.',
  'buddy.personalityDesc.',
]);

function flattenKeys(value: unknown, prefix = ''): Set<string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return new Set(prefix ? [prefix] : []);
  }

  return new Set(
    Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return [...flattenKeys(child, path)];
    }),
  );
}

function findSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) return findSourceFiles(path);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

function findClosingParen(source: string, openingIndex: number): number {
  let depth = 0;
  let quote;

  for (let index = openingIndex; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') quote = character;
    else if (character === '(') depth += 1;
    else if (character === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function findDefaultValueCall(source: string): { key?: string; dynamic: boolean }[] {
  return [...source.matchAll(/\bt\s*\(/g)].map((match) => {
    const openingIndex = match.index ?? 0;
    const closingIndex = findClosingParen(source, openingIndex);
    if (closingIndex < 0) return { dynamic: false };

    const call = source.slice(openingIndex, closingIndex + 1);
    if (!/\bdefaultValue\s*:/.test(call)) return { dynamic: false };

    const key = call.match(/^\s*t\s*\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/)?.[2];
    return { key, dynamic: !key };
  });
}

function findDefaultValueCalls(): Map<string, string[]> {
  const callsByFile = new Map<string, string[]>();

  for (const absolutePath of findSourceFiles(SOURCE_ROOT)) {
    const source = readFileSync(absolutePath, 'utf8');
    const relativePath = absolutePath.slice(process.cwd().length + 1);
    const calls = findDefaultValueCall(source);
    const hasUnlistedDynamicCall = calls.some(({ dynamic }) => dynamic);
    if (hasUnlistedDynamicCall && !DYNAMIC_CALL_EXEMPTIONS.has(relativePath)) {
      throw new Error(`Unlisted dynamic defaultValue t() call: ${relativePath}`);
    }

    const keys = calls
      .map(({ key }) => key)
      .filter((key): key is string => Boolean(key))
      .filter((key) => !key.includes('\${') && ![...DYNAMIC_KEY_EXEMPTIONS].some((prefix) => key.startsWith(prefix)));

    if (keys.length > 0) callsByFile.set(relativePath, keys);
  }

  return callsByFile;
}

describe('defaultValue i18n guard', () => {
  it('defines every static defaultValue key in both dictionaries', () => {
    const english = flattenKeys(en);
    const chinese = flattenKeys(zh);
    const callsByFile = findDefaultValueCalls();

    expect(callsByFile.size).toBeGreaterThan(0);
    for (const [file, keys] of callsByFile) {
      for (const key of keys) {
        expect(english.has(key), `${file}: en missing ${key}`).toBe(true);
        expect(chinese.has(key), `${file}: zh missing ${key}`).toBe(true);
      }
    }
  });

  it('defines the dynamic buddy key segments used by typed runtime enums', () => {
    for (const key of [...DYNAMIC_KEY_EXEMPTIONS]) {
      const path = key.replace(/\.$/, '');
      expect(en, `en segment ${path}`).toHaveProperty(path);
      expect(zh, `zh segment ${path}`).toHaveProperty(path);
    }
  });
});
