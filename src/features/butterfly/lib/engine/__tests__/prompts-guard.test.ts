import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

describe('butterfly prompt guardian guard', () => {
  const source = readFileSync(join(process.cwd(), 'src/features/butterfly/lib/engine/prompts.ts'), 'utf8');
  const zh = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/messages/zh.json'), 'utf8')) as {
    butterfly: Record<string, string>;
  };
  const en = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/messages/en.json'), 'utf8')) as {
    butterfly: Record<string, string>;
  };

  it('keeps the guardian novelist voice and story-mode safeguards', () => {
    expect(source).not.toMatch(new RegExp(['mischievous', 'trickster', 'sick sense of humor', 'NOT a moralist'].join('|'), 'i'));
    expect(source).toContain('guardian elephant');
    expect(source).toContain('GUARDIAN ECHO');
    expect(source).toContain('STORY GENERATION MODE');
    expect(source).toContain('LANGUAGE REQUIREMENT');
  });

  it('keeps the guardian i18n anchor values', () => {
    expect(zh.butterfly.futureGachaDesc).toContain('守护');
    expect(en.butterfly.yourFutureUnlocked).toBe('Your What If story');
    expect(zh.butterfly.yourFutureUnlocked).toBe('你的「如果呢」故事');
  });
});
