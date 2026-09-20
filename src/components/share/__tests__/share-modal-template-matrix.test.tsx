/**
 * batch104-a — ShareModal 模板渲染矩阵补全 (纯测试, 与既有 share 测试零重叠)
 *
 * 新覆盖面 (既有文件点名):
 *   1. weekly / dream / invite 三模板首次在 modal 装配层挂载断言 —
 *      share-modal-templates.test.tsx 从未挂载三者; share-modal-redline.test.tsx
 *      挂载了但只查无钱不查内容 (空渲染即假绿)。本文件 9 模板逐一断言
 *      标题 / 主数字 / 操作区 (Share + Save) 三件套。
 *   2. 金额红线从正常值扩到边界参数 — batch77-a 红线只扫正常值组合;
 *      card-templates.test.tsx 的红线套件对 dream / guardian-stats / invite
 *      因 baseData 缺专属数据是 null 渲染 (空串扫过 = 盲区)。本文件在
 *      零值 / 亚小时 / 大数三组边界数据下全 9 模板扫 en+zh 真词典。
 *   3. interceptCount / streakDays / savedHours 三参数 0 / 大数 / 缺失边界
 *      首次在装配层钉住 — 特别是 count=0 时 chip 仍出现 (判据是 != null
 *      非 truthy, 防改回 truthy 判断让 0 次用户丢里程碑入口)。
 *   4. weekly / dream / invite 的 initialTemplate 缺数据回落 intercept —
 *      templates 文件只有 challenge / guardian-stats 两条回落。
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { ShareModal } from '../share-modal';
import type { ShareTemplateId } from '../card-templates';
import type { BadgeDef } from '@/components/buddy/constants';
import type { GuardianChallenge } from '@/components/buddy/challenge-definitions';
import type { InterceptMedalData } from '@/types/intercept-medal';

// en/zh 生产词典 — 断言打在用户真实可见文案上
const zhMsgs = JSON.parse(readFileSync('src/i18n/messages/zh.json', 'utf-8'));
const enMsgs = JSON.parse(readFileSync('src/i18n/messages/en.json', 'utf-8'));

function flat(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') Object.assign(out, flat(v as Record<string, unknown>, `${prefix}${k}.`));
    else out[`${prefix}${k}`] = String(v);
  }
  return out;
}

let locale: 'en' | 'zh' = 'en';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => {
    const translations = locale === 'zh' ? flat(zhMsgs) : flat(enMsgs);
    return {
      t: (key: string, params?: Record<string, unknown>) => {
        let result = translations[key] ?? key;
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            result = result.replace(`{${k}}`, String(v));
          }
        }
        return result;
      },
      locale,
    };
  },
}));

// toPng 直接成功 — 不真加载 CDN
const toPngMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/html-to-image-loader', () => ({
  loadHtmlToImage: () => Promise.resolve({ toPng: toPngMock }),
}));
vi.mock('@/hooks/use-hourly-rate', () => ({ useHourlyRate: () => ({ hourlyRate: 20 }) }));
vi.mock('@/lib/api-client', () => ({ apiFetch: () => Promise.reject(new Error('skip in test')) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

const badgeDef: BadgeDef = {
  id: 'green_guardian_10',
  emoji: '🌿',
  color: 'bg-green-500/10 border-green-500/20',
  unlockConditionKey: 'buddy.badgeUnlock.green_guardian_10',
  progressTarget: 10,
  progressType: 'challenge_wins',
  group: 'guardian',
};

const challengeDef = {
  id: 'daily_green_gate',
  period: 'daily',
  titleKey: 'buddy.challengeLib.challenges.daily_green_gate.title',
  descKey: 'buddy.challengeLib.challenges.daily_green_gate.desc',
  doneTitleKey: 'buddy.challengeLib.challenges.daily_green_gate.done',
  progressSource: 'today_see_it',
  target: 1,
  rewardBadgeId: 'impulse_shield',
} as unknown as GuardianChallenge;

/** 正常值满配 — 9 款 chip 全部出现的基准场景 (rate 20, 8900¢ → 4.5h) */
const fullProps = {
  medal: { itemTitle: 'Air Fryer', savedCents: 8900 } as InterceptMedalData,
  streakDays: 12,
  interceptCount: 23,
  badgeCard: { badge: badgeDef, progressValue: 23 },
  challengeCard: { challenge: challengeDef },
  weeklyCard: { guardDays: 5, intercepts: 3, streakDays: 2, savedHours: 12.4 },
  dreamFund: { name: 'Camera', savedCents: 9000, streakDays: 3 },
  guardRank: { name: 'Green Guardian', level: 2, emoji: '🛡️' },
  inviteCard: { refCode: 'GREEN2026', completedCount: 4 },
};

/** 零值 / 亚小时边界 — count 0, streak 0, 99¢ (<0.1h 走兜底), weekly 亚小时走兜底 */
const zeroEdgeProps = {
  ...fullProps,
  medal: { itemTitle: 'Air Fryer', savedCents: 99 } as InterceptMedalData,
  streakDays: 0,
  interceptCount: 0,
  badgeCard: { badge: badgeDef, progressValue: 0 },
  weeklyCard: { guardDays: 0, intercepts: 0, streakDays: 0, savedHours: 0.04 },
  dreamFund: { name: 'Camera', savedCents: 9000, streakDays: 0 },
  inviteCard: { refCode: 'GREEN2026', completedCount: 0 },
};

/** 大数边界 — 千位小时 / 千级天数 / 12 万次, 渲染不炸且不出小数形态 */
const largeProps = {
  ...fullProps,
  medal: { itemTitle: 'Air Fryer', savedCents: 12_345_678 } as InterceptMedalData,
  streakDays: 3650,
  interceptCount: 123_456,
  badgeCard: { badge: badgeDef, progressValue: 123_456 },
  weeklyCard: { guardDays: 900, intercepts: 8000, streakDays: 3650, savedHours: 9999 },
  dreamFund: { name: 'Camera', savedCents: 12_345_678, streakDays: 3650 },
  guardRank: { name: 'Green Guardian', level: 6, emoji: '🛡️' },
  inviteCard: { refCode: 'GREEN2026', completedCount: 12_000 },
};

const MONEY_PATTERNS: Array<[RegExp, string]> = [
  [/[$¥€£]/, 'currency symbol'],
  [/\b(?:USD|CNY|RMB)\b/, 'currency code'],
  [/\d+\.\d{2}\b/, '2-decimal money format'],
  [/\d+(?:\.\d+)?\s*(?:元|块)/, 'CNY colloquial amount'],
  [/金额|总额/, 'money-field noun (zh)'],
  [/省了.{0,12}元|省下/, 'saved-amount phrasing (zh)'],
  [/saved.*\$/i, 'saved-amount phrasing (en)'],
];

/** id → 卡 testid / modal 标题 / 卡面子锚点 (en 词典值) */
const MATRIX: Array<{ id: string; testid: string; title: string; anchors: string[] }> = [
  {
    id: 'intercept',
    testid: 'intercept-card',
    title: 'Your intercept medal',
    anchors: ['Resisted: Air Fryer', 'You won back', '4.5 hours won back'],
  },
  {
    id: 'streak',
    testid: 'streak-card',
    title: 'Your intercept medal',
    anchors: ['Consecutive guards', '12', '4.5 hours won back'],
  },
  {
    id: 'milestone',
    testid: 'milestone-card',
    title: 'Your intercept medal',
    anchors: ['Guard #23', '23/50'],
  },
  {
    id: 'badge',
    testid: 'badge-card',
    title: 'Share your green honor',
    anchors: ['Green Guardian', '23 guards won', '4.5 hours won back'],
  },
  {
    id: 'challenge',
    testid: 'challenge-card',
    title: 'Share your challenge win',
    anchors: ['Guard the green gate once today', "Today's gatekeeper", '23 guards won', '12 days in a row'],
  },
  {
    id: 'weekly',
    testid: 'weekly-card',
    title: 'Share your weekly report',
    anchors: ['Seven days, quietly held', '12 hours won back', 'Days guarded'],
  },
  {
    id: 'dream',
    testid: 'dream-card',
    title: 'Share your dream moment',
    anchors: ['Camera', '4.5 hours won back', '3 days guarded together'],
  },
  {
    id: 'guardian-stats',
    testid: 'guardian-stats-card',
    title: 'Guardian Record',
    anchors: ['Green Guardian', 'Rank L2', 'Intercepts', 'Hours won back', '4.5'],
  },
  {
    id: 'invite',
    testid: 'invite-share-card',
    title: 'Your intercept medal',
    anchors: ['Fellow Guardian', 'Your companion', 'symy.ai/?ref=GREEN2026', 'Join me'],
  },
];

const TEMPLATE_IDS = MATRIX.map((m) => m.id);

beforeEach(() => {
  locale = 'en';
  toPngMock.mockReset();
  toPngMock.mockResolvedValue('data:image/png;base64,AAA');
});

describe('9-template render matrix (title / face number / action bar)', () => {
  it.each(MATRIX.map((m) => [m.id, m] as const))('template "%s" mounts with title, face anchors and action bar', async (_id, m) => {
    render(<ShareModal open onClose={() => {}} {...fullProps} initialTemplate={m.id as ShareTemplateId} />);

    const chip = await waitFor(() => {
      const el = getChip(m.id);
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(toPngMock).toHaveBeenCalled());

    // 标题 (modal 层) 与卡面主数字锚点 (卡子树内查 — 防空渲染假绿);
    // getAllByText: 'Guardian Record' 同文出现在 modal 标题与 chip, 多匹配合法
    expect(screen.getAllByText(m.title).length).toBeGreaterThan(0);
    const card = getCard(m.testid);
    expect(card).not.toBeNull();
    for (const anchor of m.anchors) {
      expect(card?.textContent ?? '', `[${m.id}] anchor "${anchor}"`).toContain(anchor);
    }

    // 操作区三态齐备: 分享 (生成完成后可点) + 保存
    const shareButton = await screen.findByText('Share');
    expect((shareButton.closest('button') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText('Save image')).toBeTruthy();
  });
});

describe('money red line at edge params (zero / sub-hour / large), all 9 templates', () => {
  const assertNoMoney = (scope: Element | null, label: string) => {
    const text = scope?.textContent ?? '';
    for (const [re, name] of MONEY_PATTERNS) {
      const hit = text.match(re);
      expect(hit, `${label} renders money (${name}): "${hit?.[0]}"`).toBeNull();
    }
  };

  it.each(TEMPLATE_IDS.map((id) => [id, 'en'] as const))('template "%s" renders zero money at zero-edge params (%s)', async (id) => {
    locale = 'en';
    render(<ShareModal open onClose={() => {}} {...zeroEdgeProps} initialTemplate={id as ShareTemplateId} />);
    await waitFor(() => expect(toPngMock).toHaveBeenCalled());

    // 假绿防护: 卡真挂载 + 操作区在 (小时/次数/天数是面子, 允许; 金额不允许)
    expect(getCardByTemplate(id)).not.toBeNull();
    expect(document.body.textContent ?? '').toContain('Share');
    assertNoMoney(document.body, `ShareModal[${id}]/en/zero-edge portal`);
    assertNoMoney(getCardByTemplate(id), `ShareModal[${id}]/en/zero-edge card`);
  });

  it.each(TEMPLATE_IDS.map((id) => [id, 'zh'] as const))('template "%s" renders zero money at zero-edge params (%s)', async (id) => {
    locale = 'zh';
    render(<ShareModal open onClose={() => {}} {...zeroEdgeProps} initialTemplate={id as ShareTemplateId} />);
    await waitFor(() => expect(toPngMock).toHaveBeenCalled());

    expect(getCardByTemplate(id)).not.toBeNull();
    expect(document.body.textContent ?? '').toContain('保存图片');
    assertNoMoney(document.body, `ShareModal[${id}]/zh/zero-edge portal`);
    assertNoMoney(getCardByTemplate(id), `ShareModal[${id}]/zh/zero-edge card`);
  });

  it.each(TEMPLATE_IDS.map((id) => [id] as const))('template "%s" renders zero money at huge params (en)', async (id) => {
    render(<ShareModal open onClose={() => {}} {...largeProps} initialTemplate={id as ShareTemplateId} />);
    await waitFor(() => expect(toPngMock).toHaveBeenCalled());

    expect(getCardByTemplate(id)).not.toBeNull();
    expect(document.body.textContent ?? '').toContain('Share');
    assertNoMoney(document.body, `ShareModal[${id}]/en/large portal`);
    assertNoMoney(getCardByTemplate(id), `ShareModal[${id}]/en/large card`);
  });

  it('keeps huge won-back hours integer on the face — no decimal money shape', async () => {
    render(<ShareModal open onClose={() => {}} {...largeProps} initialTemplate="intercept" />);
    await waitFor(() => expect(toPngMock).toHaveBeenCalled());

    const card = getCard('intercept-card');
    // 12345678¢ / 100 / 20 = 6172.839h → ≥10 取整 — 整数形态, 不是两位小数金额形态
    expect(card?.textContent).toContain('6173 hours won back');
    expect(card?.textContent).not.toMatch(/\d+\.\d/);
  });
});

describe('interceptCount / streakDays / savedHours edges at assembly level', () => {
  it('keeps the milestone chip visible at count 0 — zero is known, not unknown', async () => {
    render(<ShareModal open onClose={() => {}} {...fullProps} interceptCount={0} />);

    // 判据是 != null 非 truthy: 0 次用户不丢里程碑入口 (防回潮断言)
    await waitFor(() => expect(getChip('milestone')).not.toBeNull());
    fireEvent.click(getChip('milestone') as HTMLElement);
    const card = getCard('milestone-card');
    expect(card?.textContent).toContain('Almost there');
    expect(card?.textContent).toContain('0/10');
    expect(card?.textContent).toContain('10 more guards to unlock');
  });

  it('renders the legend state at a huge count without breaking', () => {
    render(<ShareModal open onClose={() => {}} {...fullProps} interceptCount={123_456} />);

    fireEvent.click(getChip('milestone') as HTMLElement);
    const card = getCard('milestone-card');
    expect(card?.textContent).toContain('Guard #123456');
    expect(card?.textContent).toContain('All milestones reached');
  });

  it('missing count hides only the milestone chip — the other eight stay', async () => {
    const { interceptCount: _omitted, ...propsWithoutCount } = fullProps;
    render(<ShareModal open onClose={() => {}} {...propsWithoutCount} />);

    // fetch 拒绝 → fetchedCount null → 里程碑 chip 诚实降级 (不猜数)
    await waitFor(() => expect(screen.queryByTestId('template-chip-milestone')).toBeNull());
    for (const id of TEMPLATE_IDS.filter((tp) => tp !== 'milestone')) {
      expect(getChip(id), `chip ${id} should stay`).not.toBeNull();
    }
  });

  it.each([
    ['explicit zero', 0],
    ['missing (undefined)', undefined],
  ] as Array<[string, number | undefined]>)('streakDays %s lands on the encouraging state, never zero-shame', (_name, streakDays) => {
    render(<ShareModal open onClose={() => {}} {...fullProps} streakDays={streakDays} initialTemplate="streak" />);

    const card = getCard('streak-card');
    expect(card?.textContent).toContain('Your streak starts today');
    expect(card?.textContent).toContain('4.5 hours won back');
    expect(card?.textContent).not.toMatch(/\b0\b\s*days/);
  });

  it('streakDays 0 keeps the streak row off the intercept card; huge streak renders the count', () => {
    const { unmount } = render(
      <ShareModal open onClose={() => {}} {...fullProps} streakDays={0} initialTemplate="intercept" />
    );
    expect(getCard('intercept-card')?.textContent).not.toContain('intercept streak');
    unmount();

    render(<ShareModal open onClose={() => {}} {...fullProps} streakDays={3650} initialTemplate="streak" />);
    expect(getCard('streak-card')?.textContent).toContain('3650');
  });

  it('savedCents zero hides the private hint and falls back to a green choice', async () => {
    render(
      <ShareModal
        open
        onClose={() => {}}
        {...fullProps}
        medal={{ itemTitle: 'Air Fryer', savedCents: 0 }}
      />
    );
    await waitFor(() => expect(toPngMock).toHaveBeenCalled());

    expect(document.body.querySelector('[data-testid="private-saved-hint"]')).toBeNull();
    expect(getCard('intercept-card')?.textContent).toContain('a green choice');
  });

  it('sub-hour save renders minutes on both face channels (card + private hint)', async () => {
    render(
      <ShareModal
        open
        onClose={() => {}}
        {...fullProps}
        medal={{ itemTitle: 'Air Fryer', savedCents: 400 }}
      />
    );
    await waitFor(() => expect(toPngMock).toHaveBeenCalled());

    // 400¢ / 100 / 20 = 0.2h (≥0.1h 才出分钟) → 12 min (卡面与私密行同向, 两面数字一致);
    // <0.1h (如 99¢) 直接走 a green choice 兜底, 由 savedCents zero 用例钉住
    expect(getCard('intercept-card')?.textContent).toContain('12 min won back');
    const hint = document.body.querySelector('[data-testid="private-saved-hint"]');
    expect(hint?.textContent).toContain('12 min');
  });

  it('weekly hero falls back below 0.1h without rendering a 0.0 shape', async () => {
    render(
      <ShareModal
        open
        onClose={() => {}}
        {...fullProps}
        weeklyCard={{ guardDays: 1, intercepts: 1, streakDays: 1, savedHours: 0.04 }}
        initialTemplate="weekly"
      />
    );
    await waitFor(() => expect(toPngMock).toHaveBeenCalled());

    const card = getCard('weekly-card');
    expect(card?.textContent).toContain('a green choice');
    expect(card?.textContent).not.toContain('0.0');
  });
});

describe('initialTemplate fallback for the three never-mounted templates', () => {
  it.each(['weekly', 'dream', 'invite'] as const)('falls back to intercept when initialTemplate is "%s" without its data', (id) => {
    const props = { ...fullProps } as Record<string, unknown>;
    delete props[`${id}Card`];
    if (id === 'dream') delete props.dreamFund;
    if (id === 'invite') delete props.inviteCard;

    render(<ShareModal open onClose={() => {}} {...(props as typeof fullProps)} />);

    // 缺数据不出现空卡 — 诚实落回拦截卡, 对应 chip 不出现
    expect(getCard('intercept-card')).not.toBeNull();
    expect(getCardByTemplate(id)).toBeNull();
    expect(getChip(id)).toBeNull();
  });
});

/** portal 渲染在 document.body — chip / 卡都从 body 里找 */
function getChip(id: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="template-chip-${id}"]`);
}

function getCard(testid: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${testid}"]`);
}

function getCardByTemplate(id: string): HTMLElement | null {
  const entry = MATRIX.find((m) => m.id === id);
  return entry ? getCard(entry.testid) : null;
}
