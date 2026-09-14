/**
 * batch7-c tests — Profile 残留旧哲学清理 (FAQ / Premium 卡 / 候补表单守护化)
 *
 * 覆盖矩阵:
 *  - 旧词清零审计: 三组件源文件 (含注释) + profile 域 faq 段 / premium 段 / waitlist 段 + 顶层 premium 段
 *    双语 grep 不到 mirror / seeing / 生命时长换算话术 (minutes/hours of your life)
 *  - 死 key 防回归: 旧概念 key (faqSeeing/faqReclaim/faqChallenge/faqHourlyRate/premiumDeeperSeeing/
 *    premiumFeatureProactiveSeeing/premiumFeatureDeepBook/premiumCompareSeeIt + 3 个死 key) 双语删除;
 *    新守护 key en/zh 齐全
 *  - 定价锚定: premium.priceTrial 双语 $9.90 + 7 天试用 — 定价 diff 为零
 *  - FAQ 概念接地: 6 条守护概念 → app 内真实功能 i18n key 存在
 *    (守护挑战绿门 / 绿色替代 / 守护勋章 / 梦想基金 / 每日仪式 / Symy 小象)
 *  - 组件渲染: FaqDialog 六条概念齐全; PremiumCard 新标题 + 4 功能行 + 价格 + 无换算行;
 *    WaitlistForm 校验/提交/成功/按钮模式行为与文案 (本批纯文案层, 提交行为零 diff)
 */
// @vitest-environment happy-dom

import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import en from '../../../i18n/messages/en.json';
import zh from '../../../i18n/messages/zh.json';

// ===== i18n mock — 真实 messages JSON 嵌套解析 (缺失 key 原样返回 → 测试能发现漏 key) =====
// i18nState.locale 可切换 en/zh — 双语渲染走查用
const i18nState = vi.hoisted(() => ({
  locale: 'en' as 'en' | 'zh',
  t: null as null | ((key: string, values?: Record<string, string | number> & { defaultValue?: string }) => string),
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => {
    if (!i18nState.t) {
      i18nState.t = (key: string, values?: Record<string, string | number> & { defaultValue?: string }) => {
        const root = (i18nState.locale === 'zh' ? zh : en) as unknown as Record<string, unknown>;
        const resolve = (node: Record<string, unknown>, k: string): string => {
          let cur: unknown = node;
          for (const part of k.split('.')) {
            if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
              cur = (cur as Record<string, unknown>)[part];
            } else {
              return k;
            }
          }
          return typeof cur === 'string' ? cur : k;
        };
        let out = resolve(root, key);
        if (out === key && values?.defaultValue) out = values.defaultValue;
        if (values) {
          for (const [k, v] of Object.entries(values)) {
            if (k !== 'defaultValue') out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
          }
        }
        return out;
      };
    }
    return { t: i18nState.t, locale: i18nState.locale };
  },
}));

// apiFetch / auth — WaitlistForm 行为测试用
const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/components/auth/auth-provider', () => ({ useAuth: () => ({ user: null }) }));

import { FaqDialog } from '../faq-dialog';
import { PremiumCard } from '../premium-card';
import { WaitlistForm } from '../waitlist-form';

// ===== i18n 取词工具 =====
type MsgTree = Record<string, unknown>;
function msg(root: MsgTree, key: string): string {
  let cur: unknown = root;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as MsgTree)) {
      cur = (cur as MsgTree)[part];
    } else {
      throw new Error(`missing i18n key: ${key}`);
    }
  }
  if (typeof cur !== 'string') throw new Error(`non-string i18n value: ${key}`);
  return cur;
}

// ============================================================
// 1. 旧词清零审计 — 三组件源文件 (含注释) + i18n 对应段, 双语
// ============================================================
const SOURCES = [
  'src/components/profile/faq-dialog.tsx',
  'src/components/profile/premium-card.tsx',
  'src/components/profile/waitlist-form.tsx',
];
// 旧哲学词: 镜子隐喻 + "看见/照见" 概念词 + 生命时长换算话术 (含中英形态)
const BANNED = /mirror|seeing|minutes of your life|hours of your life|镜子|照见|镜像|分钟的生命|小时的生命/i;

function collectSegment(tree: MsgTree, keyRe: RegExp, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(tree)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      if (keyRe.test(full)) out[full] = v;
    } else if (v && typeof v === 'object') {
      collectSegment(v as MsgTree, keyRe, full, out);
    }
  }
  return out;
}

// profile 域下 faq / premium / waitlist 三段 (camelCase 前缀) + 顶层 premium 段 (定价)
const SEGMENT_RE = /^profile\.(faq|premium|waitlist)|^premium\./;

describe('batch7-c narrative guard — mirror-era wording zeroed', () => {
  it('three components contain no old-philosophy wording (source files, comments included)', () => {
    for (const rel of SOURCES) {
      const src = readFileSync(join(process.cwd(), rel), 'utf-8');
      const hit = src.match(new RegExp(BANNED.source, 'i'));
      expect(hit, `${rel} still contains old-philosophy wording: ${hit?.[0]}`).toBeNull();
    }
  });

  it('faq / premium / waitlist i18n segments contain no old-philosophy wording (en/zh)', () => {
    for (const tree of [en as MsgTree, zh as MsgTree]) {
      const seg = collectSegment(tree, SEGMENT_RE);
      expect(Object.keys(seg).length).toBeGreaterThan(20);
      for (const [key, value] of Object.entries(seg)) {
        const hit = value.match(new RegExp(BANNED.source, 'i'));
        expect(hit, `${key} still contains old-philosophy wording: ${hit?.[0]}`).toBeNull();
      }
    }
  });

  it('old concept keys are gone from both locales (dead-key regression guard)', () => {
    const deadKeys = [
      'profile.faqSeeingTitle', 'profile.faqSeeingDesc',
      'profile.faqReclaimTitle', 'profile.faqReclaimDesc',
      'profile.faqChallengeTitle', 'profile.faqChallengeDesc',
      'profile.faqHourlyRateTitle', 'profile.faqHourlyRateDesc',
      'profile.premiumDeeperSeeing',
      'profile.premiumFeatureProactiveSeeingTitle', 'profile.premiumFeatureProactiveSeeingDesc',
      'profile.premiumFeatureDeepBookTitle', 'profile.premiumFeatureDeepBookDesc',
      'profile.premiumCompareSeeIt',
      'profile.premiumDesc', 'profile.premiumComingSoonToast', 'profile.premiumStartTrial', // 无人引用的死 key
      'premium.lifeMinutes', 'premium.lifeHours', // 生命换算话术
    ];
    for (const key of deadKeys) {
      expect(() => msg(en as MsgTree, key), `en still has ${key}`).toThrow();
      expect(() => msg(zh as MsgTree, key), `zh still has ${key}`).toThrow();
    }
  });

  it('new guardian keys exist in both locales', () => {
    const liveKeys = [
      'profile.faqGuardTitle', 'profile.faqGuardDesc',
      'profile.faqGreenSwapTitle', 'profile.faqGreenSwapDesc',
      'profile.faqMedalTitle', 'profile.faqMedalDesc',
      'profile.faqDreamFundTitle', 'profile.faqDreamFundDesc',
      'profile.faqRitualTitle', 'profile.faqRitualDesc',
      'profile.faqSymyTitle', 'profile.faqSymyDesc', 'profile.faqFooter',
      'profile.premiumTitle',
      'profile.premiumFeatureActiveGuardTitle', 'profile.premiumFeatureActiveGuardDesc',
      'profile.premiumFeatureDeepReportTitle', 'profile.premiumFeatureDeepReportDesc',
      'profile.premiumFeatureInfiniteSimTitle', 'profile.premiumFeatureInfiniteSimDesc',
      'profile.premiumFeatureRefundTitle', 'profile.premiumFeatureRefundDesc',
      'profile.premiumCompareGuards',
      'profile.waitlistSuccess', 'profile.waitlistInvalidEmail', 'profile.waitlistSubmitFailed',
      'profile.emailMonitorVIPDesc',
    ];
    for (const key of liveKeys) {
      expect(msg(en as MsgTree, key), `en missing ${key}`).toBeTruthy();
      expect(msg(zh as MsgTree, key), `zh missing ${key}`).toBeTruthy();
    }
  });
});

// ============================================================
// 2. 定价锚定 — $9.90/月 + 7 天试用, 双语一字不改 (定价 diff 为零)
// ============================================================
describe('premium pricing stays untouched', () => {
  it('priceTrial: $9.90 + 7-day trial in en and zh', () => {
    expect(msg(en as MsgTree, 'premium.priceTrial')).toContain('$9.90');
    expect(msg(en as MsgTree, 'premium.priceTrial')).toMatch(/7-day free trial/);
    expect(msg(zh as MsgTree, 'premium.priceTrial')).toContain('$9.90');
    expect(msg(zh as MsgTree, 'premium.priceTrial')).toContain('7 天免费试用');
  });

  it('premium section carries only the price key (life-conversion copy fully removed)', () => {
    for (const tree of [en as MsgTree, zh as MsgTree]) {
      expect(Object.keys(collectSegment(tree, /^premium\./))).toEqual(['premium.priceTrial']);
    }
  });
});

// ============================================================
// 3. FAQ 概念接地 — 每条守护概念都能指到 app 内真实功能 key
// ============================================================
describe('FAQ concepts map to real in-app features', () => {
  it('six FAQ entries reference concepts whose feature keys exist (en/zh)', () => {
    // 概念 → app 内真实功能的 i18n key (功能存在的证明)
    const grounding: Array<{ faqKey: string; featureKey: string; matchEn: RegExp; matchZh: RegExp }> = [
      { faqKey: 'profile.faqGuardDesc', featureKey: 'buddy.challengeLib.challenges.daily_green_gate.title', matchEn: /green gate/i, matchZh: /绿门/ },
      { faqKey: 'profile.faqGreenSwapDesc', featureKey: 'landing.step2Desc', matchEn: /greener/i, matchZh: /绿色/ },
      { faqKey: 'profile.faqMedalDesc', featureKey: 'buddy.badgeGroups.guardian', matchEn: /mark|medal|badge/i, matchZh: /勋章/ },
      { faqKey: 'profile.faqDreamFundDesc', featureKey: 'buddy.dreamFund.guardSavedLine', matchEn: /dream/i, matchZh: /梦想/ },
      { faqKey: 'profile.faqRitualDesc', featureKey: 'ritual.guardianIntro', matchEn: /ritual/i, matchZh: /仪式/ },
      { faqKey: 'profile.faqSymyDesc', featureKey: 'metadata.ogDescription', matchEn: /little elephant/i, matchZh: /小象/ },
    ];
    for (const g of grounding) {
      const enVal = msg(en as MsgTree, g.faqKey);
      const zhVal = msg(zh as MsgTree, g.faqKey);
      expect(enVal).toMatch(g.matchEn);
      expect(zhVal).toMatch(g.matchZh);
      // 功能真实存在: en/zh 均可解析
      expect(msg(en as MsgTree, g.featureKey)).toBeTruthy();
      expect(msg(zh as MsgTree, g.featureKey)).toBeTruthy();
    }
  });
});

// ============================================================
// 4. 组件渲染 — FaqDialog 六条概念 / PremiumCard 守护口径
// ============================================================
describe('FaqDialog renders the six guardian concepts', () => {
  it('shows all six questions, no legacy ones', () => {
    render(<FaqDialog open onClose={() => {}} />);
    const text = document.body.textContent ?? '';
    for (const q of [
      'What is a guardian challenge?',
      'What are greener swaps?',
      'What are Guardian Marks?',
      'What are Dream Funds?',
      'What is the daily ritual?',
      'Who is Symy?',
    ]) {
      expect(text).toContain(q);
    }
    expect(text).toMatch(/green gate/i);
    expect(text).toMatch(/little elephant/i);
    expect(text).not.toMatch(BANNED);
  });

  it('renders in zh (双语走查): 六条概念 + 守护口径齐全, 无旧词', () => {
    i18nState.locale = 'zh';
    render(<FaqDialog open onClose={() => {}} />);
    const faqText = document.body.textContent ?? '';
    for (const q of ['「守护挑战」是什么？', '「绿色替代」是什么？', '「守护勋章」是什么？', '什么是「梦想基金」？', '「每日仪式」是什么？', 'Symy 是谁？']) {
      expect(faqText).toContain(q);
    }
    expect(faqText).toContain('绿门');
    expect(faqText).toContain('小象');
    expect(faqText).not.toMatch(BANNED);
  });
});

describe('PremiumCard renders guardian framing (en)', () => {
  it('new title + 4 feature rows + price + waitlist CTA, no life-conversion line, no old wording', () => {
    const { container } = render(<PremiumCard locale="en" />);
    const text = container.textContent ?? '';
    expect(text).toContain('A more devoted guardian');
    expect(text).toContain('Coming Soon');
    expect(text).toContain('You come to Symy when you want a guard');
    expect(text).toContain('Symy reaches you first, before the impulse does');
    for (const feature of ['Proactive intercepts', 'Deep guardian report', 'Unlimited guard plans', 'Refund Assist']) {
      expect(text).toContain(feature);
    }
    expect(text).toContain('$9.90/mo · 7-day free trial');
    expect(text).toContain('5 gate guards/day');
    expect(text).toContain('3 What If/day');
    // BUG-2 复用结构不动: WaitlistForm(button 模式) 挂载在卡内
    expect(text).toContain('Join waitlist');
    // 生命时长换算行已随话术移除, 不应再出现
    expect(text).not.toMatch(/minutes of your life|hours of your life/i);
    expect(text).not.toMatch(BANNED);
  });

  it('renders PremiumCard in zh (双语走查): 守护标题 + 4 功能行 + 定价, 无换算话术', () => {
    i18nState.locale = 'zh';
    const { container } = render(<PremiumCard locale="zh" />);
    const text = container.textContent ?? '';
    expect(text).toContain('更尽职的守护伙伴');
    expect(text).toContain('你主动找小象把关');
    expect(text).toContain('小象先一步找到你，把冲动拦在半路');
    for (const feature of ['主动拦截提醒', '深度守护报告', '无限守护预案', '退款协助']) {
      expect(text).toContain(feature);
    }
    expect(text).toContain('$9.90/月 · 7 天免费试用');
    expect(text).toContain('每天 5 次守门');
    expect(text).toContain('加入候补名单');
    expect(text).not.toMatch(BANNED);
  });
});

// ============================================================
// 5. WaitlistForm 行为钉住 — 本批纯文案层, 提交行为零 diff
// ============================================================
afterEach(() => {
  i18nState.locale = 'en';
});

describe('WaitlistForm behavior (unchanged by batch7-c)', () => {
  it('invalid email → inline error, no API call', () => {
    const { container } = render(<WaitlistForm mode="form" />);
    const input = screen.getByPlaceholderText('your@email.com');
    fireEvent.change(input, { target: { value: 'not-an-email' } });
    fireEvent.submit(container.querySelector('form')!);
    expect(screen.getByText('Please enter a valid email')).toBeTruthy();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('valid email → POST /api/premium/waitlist, guardian-flavored success copy', async () => {
    apiFetchMock.mockResolvedValue(undefined);
    const { container } = render(<WaitlistForm mode="form" />);
    const input = screen.getByPlaceholderText('your@email.com');
    fireEvent.change(input, { target: { value: 'guard@symy.ai' } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/premium/waitlist', {
      method: 'POST',
      body: { email: 'guard@symy.ai' },
    }));
    await waitFor(() => expect(screen.getByText("You're on the list — Symy will come find you when it's ready.")).toBeTruthy());
  });

  it('button mode: closed by default, expands to form on click', () => {
    const { container } = render(<WaitlistForm mode="button" />);
    expect(container.querySelector('form')).toBeNull();
    expect(container.textContent).toContain('Join waitlist'); // 折叠态: 按钮文案即可访问名
    // 折叠态按钮无 aria-label, 直接点它
    fireEvent.click(container.querySelector('button')!);
    expect(container.querySelector('form')).not.toBeNull();
    expect(container.querySelector('input[type="email"]')).not.toBeNull();
  });
});
