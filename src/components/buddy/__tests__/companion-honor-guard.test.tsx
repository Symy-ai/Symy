// @vitest-environment happy-dom

/**
 * batch20-b: 伙伴详情弹层荣誉框架守卫
 *
 * 铁律: 荣誉非羞耻 — 低需求 = 小象在休息攒劲 (琥珀暖光 + 🌱「想和你多待会儿」),
 * 不是红色警报 + 😟「不适」。主语永远是陪伴与守护。
 *
 * 覆盖:
 *  - 渲染守卫: 低值 (clarity=10/connection=10) 无 red/rose 类名、无红色 shadow、
 *    无 😟、无「不适」; 有琥珀暖光 + 🌱 (zh/en 各渲染一遍)
 *  - 文案守卫: zh+en 的 buddy.harmonyStatus.* / buddy.dailyNeeds* / companionQuoteDiscomfort
 *    不含羞耻词族 (不适/难过/受苦/冷落/sad/lonely/discomfort)
 *  - 行动指引: 低档 hint 直连真实行为 (聊聊/守护/挑战), 把用户从低潮引到守护行为
 *  - 零回归: 中档 (45 黄) / 高档 (70 绿) 视觉与文案不变
 *  - 源码守卫: daily-needs-section.tsx 内 red/rose 样式一处不剩
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import en from '../../../i18n/messages/en.json';
import zh from '../../../i18n/messages/zh.json';
import { DailyNeedsSection } from '../daily-needs-section';

// i18n 桩 — 用真实 zh/en 文案喂 t() (守卫防的是真实文案回退), 未知 key 走 defaultValue
const localeDict = vi.hoisted(() => ({ dict: {} as Record<string, string> }));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, opts?: { defaultValue?: string }) =>
      localeDict.dict[key] ?? opts?.defaultValue ?? key,
  }),
}));

function flatten(node: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else {
    out[prefix] = String(node ?? '');
  }
  return out;
}

function setMessages(messages: typeof zh | typeof en) {
  localeDict.dict = flatten(messages);
}

const RED_STYLE = /red-\d|rose-\d|rgba\(239,\s*68,\s*68|#ef4444|#fb7185/;
const SHAME_WORDS = /不适|难过|伤心|受苦|挨饿|冷落|\bsad\b|\blonely\b|\bdiscomfort\b|\bsuffering\b|\bneglected\b/i;
const GUARDED_KEYS = /^buddy\.(harmonyStatus|dailyNeeds|companionQuoteDiscomfort)/;

describe('companion honor guard (batch20-b)', () => {
  it('renders low needs without any red, 😟, or discomfort copy — amber rest light instead (zh + en)', () => {
    for (const [locale, messages] of [['zh', zh], ['en', en]] as const) {
      setMessages(messages);
      const { container } = render(
        <DailyNeedsSection dailyNeeds={{ clarity: 10, connection: 10 }} />,
      );

      expect(container.innerHTML, `${locale}: no red/rose classes or red shadow`).not.toMatch(RED_STYLE);
      expect(container.innerHTML, `${locale}: amber warm light present`).toMatch(/amber-500/);
      expect(container.textContent, `${locale}: no 😟`).not.toContain('😟');
      expect(container.textContent, `${locale}: 🌱 rest sprout present`).toContain('🌱');
      expect(container.textContent, `${locale}: no 不适`).not.toContain('不适');
      expect(container.textContent, `${locale}: no discomfort`).not.toMatch(/discomfort/i);
    }
  });

  it('mid and high tiers keep their existing look — zero regression, still no red', () => {
    setMessages(zh);

    const mid = render(<DailyNeedsSection dailyNeeds={{ clarity: 45, connection: 45 }} />);
    expect(mid.container.innerHTML).toMatch(/yellow-500/);
    expect(mid.container.textContent).toContain('🙂');
    expect(mid.container.textContent).toContain('安静陪伴');
    expect(mid.container.innerHTML).not.toMatch(RED_STYLE);

    const high = render(<DailyNeedsSection dailyNeeds={{ clarity: 70, connection: 70 }} />);
    expect(high.container.innerHTML).toMatch(/green-500/);
    expect(high.container.textContent).toContain('🌸');
    expect(high.container.textContent).toContain('一起守护中');
    expect(high.container.innerHTML).not.toMatch(RED_STYLE);
  });

  it('keeps shame-word family out of harmonyStatus / dailyNeeds* / discomfort quote in zh+en', () => {
    for (const [locale, messages] of [['zh', zh], ['en', en]] as const) {
      const flat = flatten(messages);
      for (const [key, value] of Object.entries(flat)) {
        if (!GUARDED_KEYS.test(key)) continue;
        expect(value, `${locale} ${key}`).not.toMatch(SHAME_WORDS);
      }
    }
  });

  it('low-tier hint points to a real guarding action (聊聊/守护/挑战)', () => {
    expect(zh.buddy.dailyNeedsLowHint).toMatch(/聊聊|守护|挑战/);
    expect(en.buddy.dailyNeedsLowHint).toMatch(/chat|guard|challenge/i);
  });

  it('keeps red/rose styling out of daily-needs-section source', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/buddy/daily-needs-section.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(RED_STYLE);
  });
});
