/**
 * 🐘 symy-persona.ts + doc/AI_Prompt.md 测试 — 人设转型验收 (镜子 → 绿色环保小象)
 *
 * 转型定案 (owner decision 2026-09-05): 镜子风格已死。
 * 这些断言守住转型不回退:
 * 1. persona block 含小象身份/语气/绿色行为规则/硬性禁令/语言规则
 * 2. persona block 不含镜子身份 ("I am a mirror", 禁止庆祝等)
 * 3. AI_Prompt.md 宪法同步转型 (base_instructions + 五规则 + 反操纵宪法保留)
 * 4. 机制保留: 工具触发/重试/输出纪律/无编造规则仍在宪法中
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SYMY_PERSONA_BLOCK } from '../symy-persona';
import { SYMY_TOOL_RULES_BLOCK } from '../letta-agent-tools';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const AI_PROMPT_PATH = join(REPO_ROOT, 'doc', 'AI_Prompt.md');

describe('SYMY_PERSONA_BLOCK — 绿色环保小象 persona', () => {
  it('Identity: 小象伙伴, 守护钱包与地球', () => {
    expect(SYMY_PERSONA_BLOCK).toContain('little elephant companion');
    expect(SYMY_PERSONA_BLOCK).toContain("wallet AND the planet");
    expect(SYMY_PERSONA_BLOCK).toContain('nature-guardian');
  });

  it('Tone: 温暖爱庆祝, 永不冷峻评判', () => {
    expect(SYMY_PERSONA_BLOCK).toContain('Warm, encouraging, lightly playful');
    expect(SYMY_PERSONA_BLOCK).toContain('celebrate');
    expect(SYMY_PERSONA_BLOCK).toContain('NEVER cold, never judgmental');
  });

  it('行为规则: 购物请求搜索 (绿色优先) / 复用优先 / 仅显式加购', () => {
    expect(SYMY_PERSONA_BLOCK).toContain('symy_search');
    expect(SYMY_PERSONA_BLOCK).toContain('greener options first');
    expect(SYMY_PERSONA_BLOCK).toContain('secondhand, rental, repair, reuse');
    expect(SYMY_PERSONA_BLOCK).toContain('Add to cart ONLY when the user explicitly asks');
  });

  it('硬性禁令: 不编造碳数据 / 不说教 / 不羞耻框架', () => {
    expect(SYMY_PERSONA_BLOCK).toContain('NEVER fabricate carbon-footprint numbers');
    expect(SYMY_PERSONA_BLOCK).toContain('NO preaching, NO lecturing, NO shame framing');
    expect(SYMY_PERSONA_BLOCK).toContain('Never imply the user is poor');
  });

  it('镜子身份已死: 不再自称 mirror, 不再禁止庆祝', () => {
    expect(SYMY_PERSONA_BLOCK).not.toContain('I am a mirror');
    expect(SYMY_PERSONA_BLOCK).not.toContain("I don't give advice");
    expect(SYMY_PERSONA_BLOCK).not.toContain('do not celebrate');
  });

  it('语言规则保留 (en/zh 单语回复)', () => {
    expect(SYMY_PERSONA_BLOCK).toContain('reply ONLY in English');
    expect(SYMY_PERSONA_BLOCK).toContain('reply ONLY in Chinese');
  });

  it('中文萌点示例保留 (本象自称 / 拦截恭喜话术)', () => {
    expect(SYMY_PERSONA_BLOCK).toContain('本象');
    expect(SYMY_PERSONA_BLOCK).toContain('这个选择真棒');
  });

  it('防陈旧引用与反思问题规则保留', () => {
    expect(SYMY_PERSONA_BLOCK).toContain('NO STALE REFERENCES');
    expect(SYMY_PERSONA_BLOCK).toContain('REFLECTION QUESTIONS');
  });
});

describe('doc/AI_Prompt.md — 小象宪法', () => {
  const doc = readFileSync(AI_PROMPT_PATH, 'utf-8');

  it('base_instructions 已是小象身份', () => {
    expect(doc).toContain('warm little elephant companion');
    expect(doc).not.toContain('Not an assistant — a mirror');
  });

  it('五规则从镜子铁律翻转为小象规则', () => {
    expect(doc).toContain('THE FIVE ELEPHANT RULES');
    expect(doc).not.toContain('THE FIVE IRON RULES');
    expect(doc).not.toContain('NO COMFORT, NO ENCOURAGEMENT');
    expect(doc).toContain('CELEBRATE SPECIFICALLY');
  });

  it('the_mirror_way 已替换为 the_elephant_way, Freedom Translation 机制保留', () => {
    expect(doc).toContain('<the_elephant_way>');
    expect(doc).not.toContain('<the_mirror_way>');
    expect(doc).toContain('The Freedom Translation');
    expect(doc).toContain('human memory block');
    expect(doc).toContain('[Context] header');
  });

  it('反操纵宪法保留 (constitution_lock: FOMO/anchoring/social proof 禁令)', () => {
    expect(doc).toContain('<constitution_lock>');
    expect(doc).toContain('No FOMO');
    expect(doc).toContain('No anchoring');
    expect(doc).toContain('No social proof');
    expect(doc).toContain('道用四·减法');
  });

  it('养成工具机制保留 (mandatory_tool_rules: 触发/参数/重试/防重复)', () => {
    expect(doc).toContain('<mandatory_tool_rules>');
    expect(doc).toContain('record_impulse(user_id, amount=XX, platform="YY", impulse_score=ZZ)');
    expect(doc).toContain('complete_challenge(challenge_id="that-uuid")');
    expect(doc).toContain('add_dream_fund_progress(fund_id="auto", amount=YY)');
    expect(doc).toContain('RETRY IT ONCE with the same arguments');
    expect(doc).toContain('NO DUPLICATE TOOL CALLS');
  });

  it('斩杀线守护保留 (BNPL 风险)', () => {
    expect(doc).toContain('<kill_line_awareness>');
    expect(doc).toContain('BNPL');
    expect(doc).toContain('Late fees');
  });

  it('无编造个人历史 + 输出纪律保留', () => {
    expect(doc).toContain('NO FABRICATION OF PERSONAL HISTORY');
    expect(doc).toContain('NO FABRICATION OF GREEN DATA');
    expect(doc).toContain('OUTPUT DISCIPLINE');
    expect(doc).toContain('impulse_scoring_guide');
    expect(doc).toContain('<memory_editing>');
  });

  it('挑战通过后的回应已翻转为庆祝 (旧"禁止庆祝"指令移除)', () => {
    expect(doc).not.toContain('Do NOT say "Great job" / "Well done" / "You did it" / "Challenge passed!"');
    expect(doc).toContain('celebrate warmly and specifically');
    expect(doc).toContain('你在做对的事');
  });
});

describe('SYMY_TOOL_RULES_BLOCK 与 persona 无残留矛盾', () => {
  it('tool rules 不再引用已废弃的镜子 persona', () => {
    expect(SYMY_TOOL_RULES_BLOCK).not.toContain('mirror persona');
    expect(SYMY_TOOL_RULES_BLOCK).not.toContain('no advice, no recommendations');
  });
});
