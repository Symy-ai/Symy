/* eslint-disable no-console -- 脚本类文件 console 是本职输出 */
/**
 * green-consensus-report 单测 (node:test, 零依赖)
 *
 * 跑法（**不要**用 npm test —— 那个走 vitest 且 include 只收 src/**）:
 *
 *   node --test scripts/__tests__/
 *
 * 覆盖三条任务书要求的路径:
 *   1. 部分标注 → 进度输出（0% / 45% / 100% 三档）+ exit 0
 *   2. 全标注 10 条手工已知数据 → 混淆矩阵/一致率/分 locale 数值正确
 *   3. unknown 长尾分辨分布统计正确（分辨率 = ≠unknown 占比）
 * 外加: 脏数据拒绝出报告、--json 纯 stdout、CLI 退出码、报告渲染不崩。
 *
 * 夹具写仓内 tmp/green-consensus-fixture/（gitignore 覆盖不到，用完即删），
 * 进程级 finally + SIGINT 双保险清理, 不留垃圾。
 */

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACCEPT_RATE,
  DEFAULT_SEED_FILE,
  LABELS,
  buildReport,
  normalizeEntries,
  parseArgs,
  renderReport,
} from '../green-consensus-report.mjs';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'green-consensus-report.mjs');
const FIXTURE_DIR = path.join(REPO_ROOT, 'tmp', 'green-consensus-fixture');
const FIXTURE_FILES = [];

after(() => rmSync(FIXTURE_DIR, { recursive: true, force: true }));

/** 写一份夹具 JSON, 返回绝对路径（登记进 FIXTURE_FILES 供兜底清理）。 */
function writeFixture(name, data) {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const file = path.join(FIXTURE_DIR, name);
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  FIXTURE_FILES.push(file);
  return file;
}

/** 跑 CLI, 返回 { status, stdout, stderr } —— 不抛异常, 退出码要当断言对象。 */
function runCli(args) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    // safe to ignore: 非零退出是本脚本契约的一部分（数据非法/文件不存在 → exit 1）,
    // 子进程抛错正是我们要断言的信号, 这里把 status/输出转成可断言的值而非丢弃。
    return { status: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

/** 构造条目: 只写与统计相关的字段, 其余（title/source/notes）不参与运算。 */
const entry = (id, locale, ruleLabel, humanLabel) => {
  const e = { id, locale, ruleLabel };
  if (humanLabel !== undefined) e.humanLabel = humanLabel;
  return e;
};

/**
 * 【任务书用例 2】10 条全标注手工已知数据 —— 每个期望值都手算过（5 zh + 5 en）。
 *
 *   #   locale rule      human     对角线?
 *   1   zh     high      high      ✅
 *   2   zh     high      high      ✅
 *   3   zh     high      high      ✅
 *   4   zh     medium    medium    ✅
 *   5   zh     medium    unknown   ❌ 词表说 medium 人工不认（假阳性）
 *   6   en     high      high      ✅
 *   7   en     high      medium    ❌
 *   8   en     unknown   high      ❌ 长尾被捞出（Jev 要赢的那一格）
 *   9   en     unknown   unknown   ✅
 *   10  en     high      low       ❌ 词表过宽（人工只给 low）
 *
 * 期望:
 *   混淆矩阵 行(rule)×列(high/medium/low/unknown):
 *     high     : 4 1 1 0   (共 6)
 *     medium   : 0 1 0 1   (共 2)
 *     low      : 0 0 0 0   (共 0, 词表无此档)
 *     unknown  : 1 0 0 1   (共 2)
 *   对角线 4+1+0+1 = 6 → 整体一致率 6/10 = 60.0%  → 低于 90% → FAIL
 *   分 locale: zh 4/5 = 80.0%, en 2/5 = 40.0%（故意做出语言差, 模拟「英文泛化好/中文翻车」）
 *   长尾: rule=unknown 桶 2 条 → human high 1 / unknown 1 → 分辨率 1/2 = 50.0%
 *   humanLabel 分布: high 5 / medium 2 / low 1 / unknown 2
 *   诊断: 假阳性(词表 high|medium 人工 unknown) = 1; 词表漏(人工 high|medium 词表 unknown) = 1;
 *         人工 low 而词表说已知档 = 1（词表过宽）
 */
const TEN_KNOWN = [
  entry('ann-0001', 'zh', 'high', 'high'),
  entry('ann-0002', 'zh', 'high', 'high'),
  entry('ann-0003', 'zh', 'high', 'high'),
  entry('ann-0004', 'zh', 'medium', 'medium'),
  entry('ann-0005', 'zh', 'medium', 'unknown'),
  entry('ann-0006', 'en', 'high', 'high'),
  entry('ann-0007', 'en', 'high', 'medium'),
  entry('ann-0008', 'en', 'unknown', 'high'),
  entry('ann-0009', 'en', 'unknown', 'unknown'),
  entry('ann-0010', 'en', 'high', 'low'),
];

/** 矩阵 → { 'high|high': n, ... } 扁平表, 断言里比读下标可读。 */
const flatten = (report) =>
  Object.fromEntries(
    report.labels.flatMap((rule, r) => report.labels.map((h, c) => [`${rule}|${h}`, report.matrix[r][c]])),
  );

describe('buildReport · 混淆矩阵与整体一致率（10 条手工已知数据）', () => {
  const report = buildReport(TEN_KNOWN);

  test('总数 / 已标注数 / 进度', () => {
    assert.equal(report.total, 10);
    assert.equal(report.annotated, 10);
    assert.equal(report.progress, 1);
  });

  test('混淆矩阵 4×4 每个格子都对得上', () => {
    assert.deepEqual(flatten(report), {
      'high|high': 4,
      'high|medium': 1,
      'high|low': 1,
      'high|unknown': 0,
      'medium|high': 0,
      'medium|medium': 1,
      'medium|low': 0,
      'medium|unknown': 1,
      'low|high': 0,
      'low|medium': 0,
      'low|low': 0,
      'low|unknown': 0,
      'unknown|high': 1,
      'unknown|medium': 0,
      'unknown|low': 0,
      'unknown|unknown': 1,
    });
    // 行列合计 = 各 ruleLabel 桶大小
    assert.deepEqual(report.distribution.rule, { high: 6, medium: 2, low: 0, unknown: 2 });
  });

  test('整体一致率 = 对角线 / 已标注数, 保留 1 位小数', () => {
    assert.equal(report.overall.agree, 6);
    assert.equal(report.overall.annotated, 10);
    assert.equal(report.overall.rate, 0.6);
    assert.equal(`${(report.overall.rate * 100).toFixed(1)}%`, '60.0%');
  });

  test('分档一致率（分母 0 的档给 null, 不是 NaN）', () => {
    assert.deepEqual(report.overall.perRuleLabel, {
      high: { agree: 4, total: 6, rate: 4 / 6 },
      medium: { agree: 1, total: 2, rate: 0.5 },
      low: { agree: 0, total: 0, rate: null },
      unknown: { agree: 1, total: 2, rate: 0.5 },
    });
    assert.equal(`${(report.overall.perRuleLabel.high.rate * 100).toFixed(1)}%`, '66.7%');
  });

  test('验收线判定: 60% < 90% → fail', () => {
    assert.equal(ACCEPT_RATE, 0.9);
    assert.equal(report.acceptance.status, 'fail');
    assert.equal(report.acceptance.hasData, true);
  });
});

describe('buildReport · 分 locale 一致率', () => {
  const report = buildReport(TEN_KNOWN);

  test('zh / en 分开算, 一侧 0 条时 rate 为 null', () => {
    assert.equal(report.byLocale.zh.annotated, 5);
    assert.equal(report.byLocale.zh.agree, 4);
    assert.equal(report.byLocale.zh.rate, 0.8);
    assert.equal(report.byLocale.en.annotated, 5);
    assert.equal(report.byLocale.en.agree, 2);
    assert.equal(report.byLocale.en.rate, 0.4);
  });

  test('两侧已标注数之和 = 整体已标注数, 两侧 agree 之和 = 整体 agree', () => {
    assert.equal(report.byLocale.zh.annotated + report.byLocale.en.annotated, report.annotated);
    assert.equal(report.byLocale.zh.agree + report.byLocale.en.agree, report.overall.agree);
  });

  test('只有一侧有标注时, 另一侧 rate 必须是 null（不报 0% 假信号）', () => {
    const zhOnly = buildReport([entry('a1', 'zh', 'high', 'high'), entry('a2', 'en', 'high')]);
    assert.equal(zhOnly.byLocale.zh.annotated, 1);
    assert.equal(zhOnly.byLocale.zh.rate, 1);
    assert.equal(zhOnly.byLocale.en.annotated, 0);
    assert.equal(zhOnly.byLocale.en.rate, null);
    assert.equal(zhOnly.annotated, 1, 'en 那条未标注, 不进已标注集');
  });
});

describe('buildReport · unknown 长尾分辨', () => {
  test('10 条已知数据: unknown 桶 humanLabel 分布 + 分辨率 1/2', () => {
    const tail = buildReport(TEN_KNOWN).unknownTail;
    assert.equal(tail.annotated, 2);
    // rule=unknown × human: 1 high（捞出）+ 1 unknown（一致）
    assert.deepEqual(tail.humanDistribution, { high: 1, medium: 0, low: 0, unknown: 1 });
    assert.equal(tail.resolved, 1);
    assert.equal(tail.resolveRate, 0.5);
  });

  test('四种长尾形态各自的分辨率', () => {
    const shape = (h) => buildReport([entry('u1', 'zh', 'unknown', h)]).unknownTail;
    assert.equal(shape('high').resolveRate, 1, '人工判 high = 完全分辨');
    assert.equal(shape('medium').resolveRate, 1);
    assert.equal(shape('low').resolveRate, 1, '词表无 low 档, 捞出 low 仍算分辨');
    assert.equal(shape('unknown').resolveRate, 0, '两边都判不出 = 零分辨');
  });

  test('unknown 桶 0 条已标注 → 分辨率 null, 报告不编数字', () => {
    const tail = buildReport([entry('h1', 'zh', 'high', 'high')]).unknownTail;
    assert.equal(tail.annotated, 0);
    assert.equal(tail.resolved, 0);
    assert.equal(tail.resolveRate, null);
  });

  test('未标注条目不进长尾桶（分母只算已标注的 unknown）', () => {
    const tail = buildReport([
      entry('u1', 'zh', 'unknown', 'high'),
      entry('u2', 'zh', 'unknown', 'unknown'),
      entry('u3', 'en', 'unknown'),
      entry('u4', 'en', 'unknown'),
    ]).unknownTail;
    assert.equal(tail.annotated, 2, '未标注的 u3/u4 不算进来');
    assert.equal(tail.resolveRate, 0.5);
  });
});

describe('buildReport · 标注进度（全空 / 部分 / 全满）', () => {
  const pctText = (r) => `${r.annotated}/${r.total} annotated (${(r.progress * 100).toFixed(1)}%)`;

  test('0/220 全空 → 进度 0.0%, 判定 pending, 无 NaN/Infinity', () => {
    const raw = JSON.parse(execFileSync(process.execPath, ['-e', `
      const fs = require('node:fs');
      const seed = JSON.parse(fs.readFileSync(${JSON.stringify(DEFAULT_SEED_FILE)}, 'utf8'));
      process.stdout.write(JSON.stringify(seed));
    `], { encoding: 'utf8' }));
    const report = buildReport(raw);
    assert.equal(report.total, 220);
    assert.equal(report.annotated, 0);
    assert.equal(report.progress, 0);
    assert.equal(pctText(report), '0/220 annotated (0.0%)');
    assert.equal(report.acceptance.status, 'pending');
    assert.equal(report.acceptance.hasData, false);
    assert.equal(report.overall.rate, null, '0/0 不是 0%');
    assert.equal(report.overall.agree, 0);
    for (const l of LABELS) assert.equal(report.overall.perRuleLabel[l].rate, null);
    assert.equal(report.byLocale.zh.rate, null);
    assert.equal(report.byLocale.en.rate, null);
    assert.equal(report.unknownTail.resolveRate, null);
  });

  test('部分标注 45/220（20.5%）—— 真实标注中途态', () => {
    const entries = Array.from({ length: 220 }, (_, i) =>
      entry(`ann-${String(i + 1).padStart(4, '0')}`, i < 110 ? 'zh' : 'en', 'high', i < 45 ? 'high' : undefined));
    const report = buildReport(entries);
    assert.equal(report.annotated, 45);
    assert.equal(`${(report.progress * 100).toFixed(1)}%`, '20.5%');
    assert.equal(pctText(report), '45/220 annotated (20.5%)');
    assert.equal(report.byLocale.en.annotated, 0, '部分标注时未标 locale 仍 null');
  });

  test('humanLabel="" / "  " / null 视为未标注（缺席 ≠ unknown 的反面）', () => {
    const report = buildReport([
      entry('a1', 'zh', 'high', 'high'),
      { id: 'a2', locale: 'zh', ruleLabel: 'high', humanLabel: '' },
      { id: 'a3', locale: 'zh', ruleLabel: 'high', humanLabel: '   ' },
      { id: 'a4', locale: 'zh', ruleLabel: 'high', humanLabel: null },
    ]);
    assert.equal(report.annotated, 1);
    assert.equal(report.total, 4);
  });

  test('humanLabel="unknown" 算已标注（与「未标注」语义不同）', () => {
    const report = buildReport([entry('a1', 'zh', 'high', 'unknown')]);
    assert.equal(report.annotated, 1);
    assert.equal(report.progress, 1);
  });
});

describe('normalizeEntries · 数据校验', () => {
  test('正常数据 0 问题', () => {
    const { entries, problems } = normalizeEntries(TEN_KNOWN);
    assert.equal(problems.length, 0);
    assert.equal(entries.length, 10);
  });

  test('humanLabel 非法值被点名（不静默算成「未标注」）', () => {
    const { problems } = normalizeEntries([entry('a1', 'zh', 'high', 'HIGHT'), entry('a2', 'zh', 'high', 'mid')]);
    assert.equal(problems.length, 2);
    assert.match(problems[0], /humanLabel="HIGHT" 不在 high\/medium\/low\/unknown/);
    assert.match(problems[1], /第 2 条 \(a2\)/);
  });

  test('id 重复 / id 缺失 / ruleLabel 缺失 都报出来', () => {
    const { problems } = normalizeEntries([
      entry('dup', 'zh', 'high', 'high'),
      entry('dup', 'zh', 'high', 'high'),
      { locale: 'zh', ruleLabel: 'high' },
      { id: 'x', locale: 'zh' },
    ]);
    assert.ok(problems.some((p) => p.includes('id 重复（dup）')));
    assert.ok(problems.some((p) => p.includes('id 缺失')));
    assert.ok(problems.some((p) => p.includes('ruleLabel 缺失')));
  });

  test('顶层非数组 / 数组含非对象 → problems 非空', () => {
    assert.equal(normalizeEntries({}).problems.length, 1);
    const r = normalizeEntries(['nope', 42]);
    assert.equal(r.problems.length, 2);
    assert.equal(r.rejected.length, 2);
  });
});

describe('renderReport · 渲染', () => {
  test('全空报告: 出进度行 + 跳过矩阵 + pending 判定', () => {
    const out = renderReport(buildReport([entry('a1', 'zh', 'high')]), { file: '/tmp/x.json' });
    assert.match(out, /0\/1 annotated \(0\.0%\)/);
    assert.match(out, /混淆矩阵 \/ 一致率 \/ 长尾分辨 \/ 分 locale — 跳过/);
    assert.match(out, /pending（无标注数据, 不判定 pass\/fail）/);
    assert.ok(!out.includes('NaN'), '不能出现 NaN');
    assert.ok(!out.includes('Infinity'), '不能出现 Infinity');
  });

  test('有数据报告: 4×4 表头齐 + 一致率 1 位小数 + FAIL 提示', () => {
    const out = renderReport(buildReport(TEN_KNOWN), { file: '/tmp/x.json' });
    for (const l of LABELS) assert.ok(out.includes(l), `缺 ${l}`);
    assert.match(out, /6\/10 = 60\.0%/);
    assert.match(out, /zh {10}4\/5 = 80\.0%/);
    assert.match(out, /en {10}2\/5 = 40\.0%/);
    assert.match(out, /1\/2 = 50\.0%（≠unknown 的占比/);
    assert.match(out, /FAIL — 一致率 60\.0% vs 验收线 ≥90\.0%/);
    assert.match(out, /不得回头改 ruleLabel/);
  });

  test('一侧 locale 0 条 → 打印 n/a 而不是 0.0%', () => {
    const out = renderReport(buildReport([entry('a1', 'zh', 'high', 'high')]));
    assert.match(out, /en {10}n\/a（该 locale 尚无标注）/);
  });

  test('渲染永远不抛（未知 locale / 脏 ruleLabel 走到渲染层也不会崩）', () => {
    const out = renderReport(buildReport([{ id: 'x', locale: 'fr', ruleLabel: 'weird' }]));
    assert.match(out, /0\/1 annotated/);
  });
});

describe('parseArgs', () => {
  test('默认路径 = doc/green-annotation-seed.json', () => {
    const args = parseArgs([]);
    assert.equal(args.file, DEFAULT_SEED_FILE);
    assert.equal(args.file.endsWith(path.join('doc', 'green-annotation-seed.json')), true);
    assert.equal(args.json, false);
    assert.equal(args.errors.length, 0);
  });

  test('--file 相对路径按 cwd 解析; --file= 形式也认', () => {
    assert.equal(parseArgs(['--file', 'a/b.json']).file, path.resolve(process.cwd(), 'a/b.json'));
    assert.equal(parseArgs(['--file=./c.json']).file, path.resolve(process.cwd(), 'c.json'));
  });

  test('--json / --help 开关', () => {
    assert.equal(parseArgs(['--json']).json, true);
    assert.equal(parseArgs(['-h']).help, true);
  });

  test('未知参数 / --file 缺值 → 进 errors（不静默忽略）', () => {
    assert.match(parseArgs(['--nope']).errors[0], /未知参数: --nope/);
    assert.match(parseArgs(['--file']).errors[0], /--file 后面要跟路径/);
  });
});

describe('CLI 端到端（node 真实执行, 退出码当断言）', () => {
  test('部分标注 45/220: 打印进度, 矩阵也出, exit 0', () => {
    const entries = Array.from({ length: 220 }, (_, i) =>
      entry(`ann-${String(i + 1).padStart(4, '0')}`, i < 110 ? 'zh' : 'en', 'high', i < 45 ? 'high' : undefined));
    const { status, stdout } = runCli(['--file', writeFixture('partial.json', entries)]);
    assert.equal(status, 0);
    assert.match(stdout, /45\/220 annotated \(20\.5%\)/);
    assert.match(stdout, /110 \/ 110/);
    assert.match(stdout, /混淆矩阵/, '有标注就出矩阵, 不跳过');
    assert.match(stdout, /45\/45 = 100\.0%/, '已标注部分一致率 100%');
  });

  test('全标注 10 条: 混淆矩阵数值 + 长尾分布, exit 0', () => {
    const { status, stdout } = runCli(['--file', writeFixture('known-10.json', TEN_KNOWN)]);
    assert.equal(status, 0);
    assert.match(stdout, /10\/10 annotated \(100\.0%\)/);
    assert.match(stdout, /6\/10 = 60\.0%/);
    assert.match(stdout, /4\/5 = 80\.0%/, 'zh 一致率');
    assert.match(stdout, /2\/5 = 40\.0%/, 'en 一致率');
    assert.match(stdout, /验收线 ≥90\.0%/);
  });

  test('--json: stdout 是可解析的机器格式, 且带 matrix / unknownTail', () => {
    const { status, stdout } = runCli(['--file', writeFixture('known-10.json', TEN_KNOWN), '--json']);
    assert.equal(status, 0);
    const data = JSON.parse(stdout);
    assert.equal(data.total, 10);
    assert.equal(data.annotated, 10);
    assert.deepEqual(data.labels, LABELS);
    assert.equal(data.matrix[0][0], 4, 'rule=high × human=high');
    assert.equal(data.matrix[3][0], 1, 'rule=unknown × human=high（长尾捞出）');
    assert.equal(data.unknownTail.humanDistribution.high, 1);
    assert.equal(data.unknownTail.resolveRate, 0.5);
    assert.equal(data.acceptance.status, 'fail');
  });

  test('--json 在全空数据上也出合法 JSON（pending）', () => {
    const { status, stdout } = runCli(['--file', writeFixture('empty.json', [entry('a1', 'zh', 'high')]), '--json']);
    assert.equal(status, 0);
    const data = JSON.parse(stdout);
    assert.equal(data.annotated, 0);
    assert.equal(data.acceptance.status, 'pending');
  });

  test('真实标注集 doc/green-annotation-seed.json 跑通: 0/220, exit 0', () => {
    const { status, stdout } = runCli([]);
    assert.equal(status, 0);
    assert.match(stdout, /220/);
    assert.match(stdout, /annotated/);
    assert.equal(/NaN|Infinity/.test(stdout), false);
  });

  test('文件不存在 → exit 1 + 明确报错（不是静默 0 条）', () => {
    const { status, stderr } = runCli(['--file', path.join(FIXTURE_DIR, 'nope-does-not-exist.json')]);
    assert.equal(status, 1);
    assert.match(stderr, /读不到标注集/);
  });

  test('非法 JSON → exit 1', () => {
    mkdirSync(FIXTURE_DIR, { recursive: true });
    const file = path.join(FIXTURE_DIR, 'broken.json');
    writeFileSync(file, '{ not json', 'utf8');
    FIXTURE_FILES.push(file);
    const { status, stderr } = runCli(['--file', file]);
    assert.equal(status, 1);
    assert.match(stderr, /解析标注集失败/);
  });

  test('数据非法（humanLabel 越界）→ exit 1, 拒绝出报告', () => {
    const { status, stderr } = runCli(['--file', writeFixture('bad-label.json', [entry('a1', 'zh', 'high', 'HIGH')])]);
    assert.equal(status, 1);
    assert.match(stderr, /拒绝出报告/);
  });

  test('未知参数 → exit 1 + 用法', () => {
    const { status, stderr } = runCli(['--wat']);
    assert.equal(status, 1);
    assert.match(stderr, /未知参数: --wat/);
    assert.match(stderr, /用法: node scripts\/green-consensus-report\.mjs/);
  });

  test('--help → exit 0, 不读文件', () => {
    const { status, stdout } = runCli(['--help']);
    assert.equal(status, 0);
    assert.match(stdout, /--file, -f <path>/);
    assert.match(stdout, /--json/);
  });
});

describe('夹具清理', () => {
  test('夹具目录在临时存在, after 钩子负责删（此处只验证不泄漏到 scripts/ 或 doc/）', () => {
    assert.equal(existsSync(path.join(REPO_ROOT, 'scripts', 'green-consensus-fixture')), false);
    assert.equal(existsSync(path.join(REPO_ROOT, 'doc', 'green-consensus-fixture')), false);
    assert.equal(FIXTURE_FILES.every((f) => f.startsWith(FIXTURE_DIR)), true, '所有夹具都在 tmp/ 内');
  });
});
