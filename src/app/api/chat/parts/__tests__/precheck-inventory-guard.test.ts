/**
 * precheck-inventory-guard — Wave 1 UnifiedPrecheckGate 重构的「安全网点」
 *
 * 关联文档: doc/jev-wave1-recon-result.md（19 预检器合并可行性侦察结果）
 * 方案出处: doc/Jev-引入方案-v2.md §2/§3 — Wave 1 把 chat/parts/ 的预检器
 *           合并为单次 Jev 调用（一条消息 = 一个 state，N 个问题打包）。
 *
 * 本文件只做「现状固化」，零行为改动：
 *   1. 断言 parts/ 下的 detector 文件清单与本文件内的冻结清单逐一对应
 *      —— 防静默增删（Wave 1 迁移期间有人加了新 detector 或删了旧的但没更新本文件）
 *   2. 断言每个冻结清单内的文件存在 + 主检测导出可 import（防移动/删除/改名）
 *   3. 断言 parts/ 模块文件总数（完整基线快照，含非 detector 的 turn/context/基础设施文件）
 *
 * 不测功能正确性（那是对照 evals 的事），只测「清单没被悄悄改过」。
 * 迁移期间文件被移动/删除 → 本测试红，Wave 1 的 diff 必须同步更新冻结清单。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const PARTS_DIR = join(process.cwd(), 'src', 'app', 'api', 'chat', 'parts');

/**
 * Wave 1 侦察期冻结的预检器清单（2026-09-27，基线 7ab904c）。
 *
 * `file`        — parts/ 下的模块文件
 * `exported`    — 承担「判定」职责的主导出（Wave 1 要转 Jev 的那一个）
 * `kind`        — parts/ 内 ('detector') / lib 级 ('lib') —— lib 级的真实实现
 *                 在 src/lib/ 下，parts/ 这层是 turn 包装或薄封装
 *
 * 多退少补原则：v2 方案 §1.1 列 19 项，实际是 19 个「判定单元」，
 * 但只有 12 个住在 parts/ 目录（7 个判定器实现在 src/lib/），
 * 另有 1 个 parts/ detector 派生的 route 级短路块（retro gate）。
 * 详见 doc/jev-wave1-recon-result.md §1。
 */
const FROZEN_INVENTORY: ReadonlyArray<{
  file: string;
  exported: string;
  kind: 'detector' | 'lib';
}> = [
  // ── parts/ 目录内 detector（12 个判定器）──
  { file: 'green-alt-detect.ts', exported: 'detectGreenAltCard', kind: 'detector' },
  { file: 'reuse-detect.ts', exported: 'detectReuseHint', kind: 'detector' },
  { file: 'micro-challenge-detector.ts', exported: 'detectMicroChallenge', kind: 'detector' },
  { file: 'emotion-shopping-detector.ts', exported: 'detectEmotionShopping', kind: 'detector' },
  { file: 'guard-pulse-detector.ts', exported: 'detectGuardPulseQuery', kind: 'detector' },
  { file: 'impulse-forecast-detector.ts', exported: 'detectForecastQuery', kind: 'detector' },
  { file: 'impulse-time-query-detector.ts', exported: 'detectImpulseTimeQuery', kind: 'detector' },
  { file: 'list-triage-detector.ts', exported: 'detectListTriage', kind: 'detector' },
  { file: 'reflection-detector.ts', exported: 'isReflectionQuestion', kind: 'detector' },
  { file: 'savings-query-detector.ts', exported: 'detectSavingsQuery', kind: 'detector' },
  { file: 'category-query-detector.ts', exported: 'detectCategoryQuery', kind: 'detector' },
  { file: 'duplicate-purchase-detect.ts', exported: 'detectDuplicatePurchase', kind: 'detector' },
  // ── parts/ 目录内但主判定实现在 src/lib/ 的薄封装（薄封装归 thin-wrapper，Wave 1 迁移本体在 lib/）──
  { file: 'prepurchase-turn.ts', exported: 'buildPrepurchaseTurn', kind: 'lib' },
  { file: 'cooldown-turn.ts', exported: 'buildCooldownTurn', kind: 'lib' },
  { file: 'commitment-turn.ts', exported: 'buildCommitmentTurn', kind: 'lib' },
  { file: 'compare-turn.ts', exported: 'buildCompareTurn', kind: 'lib' },
  { file: 'shopping-clarify-turn.ts', exported: 'buildShoppingClarifyTurn', kind: 'lib' },
  { file: 'green-knowledge-context.ts', exported: 'buildGreenKnowledge', kind: 'lib' },
  { file: 'alt-adoption-context.ts', exported: 'loadAltAdoptionContext', kind: 'lib' },
  { file: 'context-signal-turn.ts', exported: 'buildContextSignalTurn', kind: 'lib' },
  { file: 'green-alt-retro-gate.ts', exported: 'shouldDeferGreenAltRetro', kind: 'lib' },
];

/** parts/ 目录完整模块基线（含 turn / context / SSE 包装 / 基础设施，非仅 detector） */
const FROZEN_PARTS_MODULES = [
  // 🔧 拆相位第22刀 (2026-09-30): no-agent 503 出口自 route.ts 拆出
  'agent-unavailable-response.ts',
  'alt-adoption-context.ts',
  'category-query-detector.ts',
  'category-query-turn.ts',
  'chat-validation.ts',
  'cooldown-turn.ts',
  'compare-turn.ts',
  'commitment-turn.ts',
  'context-builder.ts',
  'context-signal-turn.ts',
  'context-trust-evidence.ts',
  'daily-limit-guard.ts',
  'duplicate-purchase-detect.ts',
  'duplicate-purchase-turn.ts',
  'emotion-guard-turn.ts',
  'emotion-shopping-detector.ts',
  'follow-up-query.ts',
  'follow-up-turn.ts',
  'green-alt-detect.ts',
  'green-alt-preference-context.ts',
  'green-alt-retro-context.ts',
  'green-alt-retro-gate.ts',
  'green-alt-retro-persist.ts',
  'green-alt-retro-turn.ts',
  'green-commitment-context.ts',
  'green-knowledge-context.ts',
  // 🔧 拆相位第19刀 (2026-09-29): guest 限流门 + 用户消息提取自 route.ts 拆出
  'guest-gate.ts',
  'guard-pulse-context.ts',
  'guard-pulse-detector.ts',
  'guard-pulse-turn.ts',
  'guard-style-context.ts',
  'impulse-forecast-context.ts',
  'impulse-forecast-detector.ts',
  'impulse-forecast-turn.ts',
  'impulse-profile-context.ts',
  'impulse-time-query-detector.ts',
  'impulse-time-query-turn.ts',
  'index.ts',
  'letta-response.ts',
  'letta-turn-context.ts',
  // 🔧 拆相位第20刀 (2026-09-29): isLettaConfigured 门外兜底出口自 route.ts 拆出
  'letta-unavailable.ts',
  'list-triage-detector.ts',
  'list-triage-turn.ts',
  'micro-challenge-detector.ts',
  'prepurchase-turn.ts',
  'prompt-sanitizer.ts',
  'query-window-range.ts',
  'rate-guard.ts',
  'recent-wins-context.ts',
  'reflection-detector.ts',
  'refund-challenge-quota.ts',
  'reuse-detect.ts',
  'savings-query-context.ts',
  'savings-query-detector.ts',
  'savings-query-turn.ts',
  'shopping-clarify-turn.ts',
  'spending-cap-context.ts',
  'stream-audit.ts',
  'types.ts',
  'user-history-context.ts',
  'user-message-extract.ts',
  'websearch-wait-stream.ts',
];

function listPartsModules(): string[] {
  return readdirSync(PARTS_DIR)
    .filter((entry) => entry.endsWith('.ts') && statSync(join(PARTS_DIR, entry)).isFile())
    .sort();
}

function readPartsFile(file: string): string {
  const full = join(PARTS_DIR, file);
  if (!existsSync(full)) throw new Error(`File not found: ${full}`);
  return readFileSync(full, 'utf-8');
}

/** 提取 `export function X` / `export const X` / `export async function X` 的名字 */
function exportedNames(source: string): string[] {
  const names = new Set<string>();
  const re = /^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z0-9_$]+)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) names.add(m[1]);
  return [...names];
}

/** 提取 `export interface X` / `export type X` 的名字 */
function exportedTypeNames(source: string): string[] {
  const names = new Set<string>();
  const re = /^export\s+(?:interface|type)\s+([A-Za-z0-9_$]+)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) names.add(m[1]);
  return [...names];
}

describe('Wave 1 预检器清单 — 文件集合', () => {
  it('parts/ 目录当前模块文件与冻结基线逐字一致（防静默增删）', () => {
    expect(listPartsModules()).toEqual([...FROZEN_PARTS_MODULES].sort());
  });

  it('冻结基线自身无重复条目（防清单里同一个文件写两遍）', () => {
    const modules = listPartsModules();
    const unique = new Set(FROZEN_PARTS_MODULES);
    expect(unique.size).toBe(FROZEN_PARTS_MODULES.length);
    // 重复写法会凭空多出条目，与真实目录对不上
    for (const name of FROZEN_PARTS_MODULES) {
      expect(modules.filter((m) => m === name).length).toBeLessThanOrEqual(1);
    }
  });

  it('每个冻结清单内的文件都真实存在（迁移期移动/删除 → 红）', () => {
    for (const entry of FROZEN_INVENTORY) {
      expect(
        existsSync(join(PARTS_DIR, entry.file)),
        `Wave 1 冻结清单里的 ${entry.file} 不存在了 — 迁移删/移了文件? 同步更新 FROZEN_INVENTORY 与 doc/jev-wave1-recon-result.md`,
      ).toBe(true);
    }
  });
});

describe('Wave 1 预检器清单 — 判定导出签名', () => {
  it.each(FROZEN_INVENTORY)(
    '$file 仍导出 $exported（主判定入口被改名/删掉 → 红）',
    ({ file, exported }) => {
      const names = exportedNames(readPartsFile(file));
      expect(
        names,
        `${file} 不再导出 ${exported}（现有导出: ${names.join(', ') || '（无）'}）`,
      ).toContain(exported);
    },
  );

  it('预检器清单条目数冻结为 21（12 parts-detector + 9 lib-backed 薄封装）', () => {
    expect(FROZEN_INVENTORY.length).toBe(21);
    expect(FROZEN_INVENTORY.filter((e) => e.kind === 'detector').length).toBe(12);
    expect(FROZEN_INVENTORY.filter((e) => e.kind === 'lib').length).toBe(9);
  });
});

describe('Wave 1 预检器清单 — 主判定导出可 import（无循环依赖/语法损坏）', () => {
  // parts/ 判定器在 node 环境全为纯函数（零 IO / 零 store 写），
  // 静态 import 成功即证明「现状固化」成立。若将来某天改成有副作用的，
  // 这个断言会提醒：它已不再是可直接打包进 Jev 的纯判定器。
  it.each(FROZEN_INVENTORY)('$file 可静态 import', async ({ file, exported }) => {
    const mod = (await import(join(PARTS_DIR, file))) as Record<string, unknown>;
    expect(typeof mod[exported], `${file}#${exported} 不是函数/值`).toBe('function');
  });
});

describe('Wave 1 预检器清单 — 富对象输出形状（需 choice/score 型问题的那些）', () => {
  // 这些检测器返回富对象（Noul 是非题问不出）→ Wave 1 必须走 choice/score 或留在规则层。
  // 类型名消失 = 输出形状可能被改，evals 对照基准失效 → 红。
  const RICH_OUTPUT_TYPES: ReadonlyArray<[string, string]> = [
    ['category-query-detector.ts', 'CategoryQueryIntent'],
    ['duplicate-purchase-detect.ts', 'DuplicatePurchaseIntent'],
    ['emotion-shopping-detector.ts', 'EmotionShoppingDetection'],
    ['impulse-time-query-detector.ts', 'ImpulseTimeQueryIntent'],
    ['list-triage-detector.ts', 'ListTriageIntent'],
    ['savings-query-detector.ts', 'SavingsQueryIntent'],
    ['prepurchase-turn.ts', 'PrepurchaseTurn'],
    ['cooldown-turn.ts', 'CooldownTurn'],
    ['commitment-turn.ts', 'CommitmentTurn'],
    ['follow-up-query.ts', 'FollowUpQueryIntent'],
  ];

  it.each(RICH_OUTPUT_TYPES)('$file 仍导出类型 $type', (file, type) => {
    expect(exportedTypeNames(readPartsFile(file)), `${file} 不再导出 ${type}`).toContain(type);
  });
});
