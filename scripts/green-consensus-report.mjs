/* eslint-disable no-console -- 脚本类文件 console 是本职输出 */
/**
 * 绿色标注集 · Wave 0 验收线计算器（ruleLabel vs humanLabel 一致率）
 *
 * 背景: doc/Jev-引入方案-v2.md §3 Wave 0 验收线第 3 条 —— 「Jev vs 词表三档
 * 一致率 ≥90%，且长尾（词表 unknown 的）给出合理分辨」。本脚本就是算这个数的
 * 那一条命令, 输入是 doc/green-annotation-seed.json（人工回填 humanLabel 后）。
 *
 *   npm run green:consensus                          # 默认读 doc/green-annotation-seed.json
 *   npm run green:consensus -- --file <path.json>    # 换文件（标注中途快照 / 手工构造夹具）
 *   npm run green:consensus -- --json                # 机器格式（stdout 只出 JSON, 退出码 0）
 *
 * 三条纪律（与 doc/green-annotation-workflow.md §6 同源）:
 *   1. 只读 —— 本脚本**绝不**写回标注集。人工回填 humanLabel 是唯一写入口。
 *   2. 不改 ruleLabel —— 它是冻结基准, 脚本只读不算。
 *   3. humanLabel 全空**不算错**（exit 0）: 标注还没开始是正常状态, 此时只打印
 *      进度 + 词表基线, 便于先验收工具自身的结构。
 *
 * 口径分层（三层缺一不可, 见 workflow §5）:
 *   - 整体一致率 = 混淆矩阵对角线 / 已标注数（验收线 ≥90%）
 *   - 分 locale 一致率 zh / en 分开报（防「英文泛化好、中文翻车」的 Cupertino 陷阱）
 *   - 长尾分辨: ruleLabel=unknown 的条目里 humanLabel 的分布
 *     → 分辨率 = (humanLabel ≠ unknown) / 该桶条数。0 = 完全没分辨, Jev 在这一格没赢。
 *
 * 零依赖（node 内置 node:fs / node:path / node:url）。纯函数 + CLI 双模式:
 * 顶层 await 只在 main() 里, 所以 import 本模块不会产生副作用（可被 node:test 直接测）。
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');

/** 默认输入: 人工回填 humanLabel 的标注集（数据在 doc/, 不进 src/）。 */
export const DEFAULT_SEED_FILE = path.join(REPO_ROOT, 'doc', 'green-annotation-seed.json');

/** 档位全集 = 词表三档（high/medium/unknown）+ 人工 low。顺序即报告里矩阵的行/列序。 */
export const LABELS = Object.freeze(['high', 'medium', 'low', 'unknown']);

/** 档位表, 报告里给一行人话, 避免报告只给数字不给判据。 */
const LABEL_CN = Object.freeze({
  high: '可溯源绿色断言',
  medium: '弱绿色属性（耐用/可重复使用）',
  low: '话术级绿色（词表无此档）',
  unknown: '无绿色证据 / 判不出',
});

/** Wave 0 验收线（doc/Jev-引入方案-v2.md §3 第 3 条）。--min-rate 可临时改严, 不能改松到掩盖问题。 */
export const ACCEPT_RATE = 0.9;

/** 词表管线**没有** low 档 —— 人工给了 low 属词表覆盖不足（语义层的 ROI 所在）。 */
const RULE_LABELS = new Set(['high', 'medium', 'unknown']);

/** locale 展示序, 只认 schema 里的两个值。 */
const LOCALES = Object.freeze(['zh', 'en']);

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

/** 保留 1 位小数, 与任务书要求一致。 */
const pct = (n) => `${(n * 100).toFixed(1)}%`;

/** 安全百分比: 分母 0 时返回 null, 由调用方决定打印什么（0/0 不是一个数）。 */
const safeRate = (num, den) => (den > 0 ? num / den : null);

const rateText = (num, den) => (den > 0 ? pct(num / den) : 'n/a（0 条）');

/** 按 width 左/右对齐（padStart/padEnd）; CJK 字符占 2 列, 中文表头要能对齐。 */
function displayWidth(s) {
  let w = 0;
  for (const ch of s) w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1;
  return w;
}
const pad = (s, width, side = 'left') => {
  const diff = Math.max(0, width - displayWidth(String(s)));
  return side === 'left' ? ' '.repeat(diff) + s : s + ' '.repeat(diff);
};

/**
 * 校验 + 归一化标注集。
 * 返回 { entries, problems, rejected } —— problems 非空即数据不可信, 调用方应 exit 1。
 * 不静默丢条目: 无法定位到 4×4 矩阵的条目进 rejected, 计数全部暴露。
 */
export function normalizeEntries(raw) {
  const problems = [];
  if (!Array.isArray(raw)) {
    return { entries: [], rejected: [], problems: ['顶层不是数组（标注集应是 [{...}, {...}]）'] };
  }
  const entries = [];
  const rejected = [];
  const seenIds = new Set();

  raw.forEach((item, i) => {
    const at = item && typeof item === 'object' ? `第 ${i + 1} 条` : `第 ${i + 1} 条（非对象）`;
    if (!item || typeof item !== 'object') {
      problems.push(`${at}: 不是对象`);
      rejected.push({ index: i, id: null, reason: 'not-an-object' });
      return;
    }
    if (typeof item.id !== 'string' || item.id === '') problems.push(`${at}: id 缺失或非字符串`);
    if (seenIds.has(item.id)) problems.push(`${at}: id 重复（${item.id}）`);
    seenIds.add(item.id);
    if (typeof item.locale !== 'string' || item.locale === '') problems.push(`${at}: locale 缺失或非字符串`);
    if (typeof item.ruleLabel !== 'string' || item.ruleLabel === '') {
      problems.push(`${at}: ruleLabel 缺失或非字符串`);
    }
    if (!isBlank(item.humanLabel) && !LABELS.includes(item.humanLabel)) {
      problems.push(`${at} (${item.id}): humanLabel=${JSON.stringify(item.humanLabel)} 不在 ${LABELS.join('/')} 内`);
    }
    entries.push(item);
  });

  return { entries, rejected, problems };
}

/** 构造空的 4×4 混淆矩阵 + 4 桶 humanLabel 分布 + locale 分布（行序 = LABELS）。 */
function emptyCounters() {
  return {
    matrix: LABELS.map(() => LABELS.map(() => 0)),
    human: Object.fromEntries(LABELS.map((l) => [l, 0])),
    rule: Object.fromEntries(LABELS.map((l) => [l, 0])),
    locale: { zh: 0, en: 0 },
  };
}

/** 累加一批条目进计数器。 */
function accumulate(counters, items) {
  for (const e of items) {
    const r = LABELS.indexOf(e.ruleLabel);
    const h = LABELS.indexOf(e.humanLabel);
    if (r < 0 || h < 0) continue; // 非法档位已在 normalize 阶段报错, 这里只跳过
    counters.matrix[r][h] += 1;
    counters.human[e.humanLabel] += 1;
    counters.rule[e.ruleLabel] += 1;
    counters.locale[e.locale] = (counters.locale[e.locale] ?? 0) + 1;
  }
  return counters;
}

/**
 * 一致率 报告 主体（纯计算, 不打 console, 不碰 fs）。
 *
 * 返回:
 *   total / annotated / progress
 *   distribution  { rule, locale }          覆盖全部条目
 *   matrix                                  rule × human, 只数已标注
 *   overall        { agree, annotated, rate, perRuleLabel, missedLow }
 *   byLocale       { zh, en } → 同 overall 结构（无 annotated 条目的 locale 给 null rate）
 *   unknownTail    { annotated, humanDistribution, resolved, resolveRate }
 *   acceptance      { rate, threshold, status, tailStatus, hasData }
 */
export function buildReport(entries) {
  const distribution = { rule: emptyCounters(), locale: { zh: 0, en: 0 } };
  const annotatedSet = emptyCounters();
  const perLocale = Object.fromEntries(LOCALES.map((l) => [l, []]));

  for (const e of entries) {
    distribution.rule.rule[e.ruleLabel] = (distribution.rule.rule[e.ruleLabel] ?? 0) + 1;
    distribution.locale[e.locale] = (distribution.locale[e.locale] ?? 0) + 1;
    if (!isBlank(e.humanLabel)) {
      annotatedSet.matrix[LABELS.indexOf(e.ruleLabel)][LABELS.indexOf(e.humanLabel)] += 1;
      annotatedSet.human[e.humanLabel] += 1;
      annotatedSet.rule[e.ruleLabel] += 1;
      perLocale[e.locale]?.push(e);
    }
  }

  const total = entries.length;
  const annotated = annotatedSet.human
    ? LABELS.reduce((sum, l) => sum + annotatedSet.human[l], 0)
    : 0;

  const rateSlice = (rows) => {
    const slice = emptyCounters();
    accumulate(slice, rows);
    const n = rows.length;
    const agree = LABELS.reduce(
      (sum, rule, r) => sum + (n > 0 ? slice.matrix[r][r] : 0),
      0,
    );
    const perRuleLabel = Object.fromEntries(
      LABELS.map((l, i) => [
        l,
        { agree: n > 0 ? slice.matrix[i][i] : 0, total: slice.rule[l] ?? 0, rate: safeRate(slice.matrix[i][i], slice.rule[l] ?? 0) },
      ]),
    );
    return {
      agree,
      annotated: n,
      rate: safeRate(agree, n),
      perRuleLabel,
      // 词表说 high/medium 但人工说 low = 词表过宽; 反过来(人工 high/medium、词表 unknown)
      // 才是「词表漏了、语义层抓到了」= low 档存在的意义。两者分开数, 别混成「错误率」。
      missedLow: LABELS.map((rule, r) =>
        LABELS.reduce((sum, h) => (h === 'low' ? sum + slice.matrix[r][h] : sum), 0),
      ).reduce((a, b) => a + b, 0),
    };
  };

  const overall = rateSlice(annotated > 0 ? entries.filter((e) => !isBlank(e.humanLabel)) : []);
  const byLocale = Object.fromEntries(
    LOCALES.map((l) => [l, rateSlice(perLocale[l] ?? [])]),
  );

  const unknownTail = {
    annotated: annotatedSet.rule.unknown ?? 0,
    humanDistribution: Object.fromEntries(
      LABELS.map((l) => [l, annotated > 0 ? annotatedSet.matrix[LABELS.indexOf('unknown')][LABELS.indexOf(l)] : 0]),
    ),
  };
  unknownTail.resolved = unknownTail.humanDistribution.high
    + unknownTail.humanDistribution.medium
    + unknownTail.humanDistribution.low;
  unknownTail.resolveRate = safeRate(unknownTail.resolved, unknownTail.annotated);

  const hasData = annotated > 0;
  const status = !hasData
    ? 'pending'
    : (overall.rate ?? 0) >= ACCEPT_RATE ? 'pass' : 'fail';

  return {
    total,
    annotated,
    progress: total > 0 ? annotated / total : 0,
    distribution: {
      rule: distribution.rule.rule,
      locale: distribution.locale,
    },
    matrix: annotatedSet.matrix,
    labels: LABELS,
    overall,
    byLocale,
    unknownTail,
    acceptance: {
      threshold: ACCEPT_RATE,
      status,
      hasData,
      tailResolved: unknownTail.resolved,
    },
  };
}

/** 混淆矩阵 4×4 渲染（行 ruleLabel, 列 humanLabel; 对角线加粗标记）。 */
function renderMatrix(report) {
  const cell = (v) => pad(String(v), 4, 'right');
  const lines = [];
  lines.push(`  rule ↓ / human →  ${LABELS.map((l) => cell(l)).join(' ')}`);
  lines.push(`  ${'─'.repeat(16 + LABELS.length * 5)}`);
  report.labels.forEach((rule, r) => {
    const cells = report.matrix[r].map((v, c) => {
      const text = cell(v);
      return r === c ? `[${text}]` : ` ${text} `;
    });
    lines.push(`  ${pad(rule, 6, 'right')}  ${cells.join(' ')}`);
  });
  return lines;
}

/** 拼行时去掉行尾空白（矩阵单元格有对齐 pad, 不 trim 会留一串行尾空格进 git/终端）。 */
const joinLines = (lines) => `${lines.map((l) => l.replace(/[ \t]+$/, '')).join('\n')}\n`;

/** 人读报告。annotated=0 时只出进度 + 词表基线, 不出矩阵（全是 0 没有信息量）。 */
export function renderReport(report, { file } = {}) {
  const L = [];
  L.push('═══════════════════════════════════════════════════════════');
  L.push(' 绿色标注集 · Wave 0 验收线报告 (ruleLabel vs humanLabel)');
  L.push('═══════════════════════════════════════════════════════════');
  if (file) L.push(` 文件: ${file}`);
  L.push('');

  L.push('【1】标注进度');
  L.push(`  总条数      ${report.total}`);
  L.push(`  已标注      ${report.annotated}   (humanLabel 非空)`);
  L.push(`  进度        ${report.annotated}/${report.total} annotated (${pct(report.progress)})`);
  L.push(`  zh / en     ${report.distribution.locale.zh ?? 0} / ${report.distribution.locale.en ?? 0}`);
  L.push('');

  L.push('【2】词表基线 ruleLabel 分布（全部条目, 冻结基准）');
  for (const l of LABELS) {
    const n = report.distribution.rule[l] ?? 0;
    const tag = RULE_LABELS.has(l) ? '' : '   ← 词表管线无此档';
    L.push(`  ${pad(l, 7, 'right')}  ${pad(String(n), 4, 'right')}  (${rateText(n, report.total)})${tag}`);
  }
  L.push('');

  if (report.annotated === 0) {
    L.push('【3-6】混淆矩阵 / 一致率 / 长尾分辨 / 分 locale — 跳过');
    L.push('  原因: humanLabel 全空（尚未标注, 正常状态, 非错误）。');
    L.push('  下一步: 按 doc/green-annotation-workflow.md 标注后重跑本命令。');
    L.push('');
    L.push('  验收线判定: ⏳ pending（无标注数据, 不判定 pass/fail）');
    return joinLines(L);
  }

  L.push('【3】混淆矩阵 (ruleLabel × humanLabel, 仅已标注条目)');
  for (const line of renderMatrix(report)) L.push(line);
  L.push(`  合计已标注  ${report.annotated}`);
  L.push('');

  L.push('【4】一致率');
  L.push(`  整体        ${report.overall.agree}/${report.annotated} = ${rateText(report.overall.agree, report.annotated)}`);
  const o = report.overall;
  L.push(`              分档: ${LABELS.map((l) => {
    const p = o.perRuleLabel[l];
    return `${l} ${p.agree}/${p.total}${p.rate === null ? '' : ` (${pct(p.rate)})`}`;
  }).join(' · ')}`);
  L.push('');
  L.push('【5】分 locale 一致率');
  for (const loc of LOCALES) {
    const s = report.byLocale[loc];
    L.push(`  ${loc}          ${s.annotated === 0 ? 'n/a（该 locale 尚无标注）' : `${s.agree}/${s.annotated} = ${rateText(s.agree, s.annotated)}`}`);
  }
  L.push('');
  L.push('【6】长尾分辨 (ruleLabel=unknown 的条目里 humanLabel 落哪)');
  const tail = report.unknownTail;
  if (tail.annotated === 0) {
    L.push('  n/a（词表 unknown 桶内尚无已标注条目）');
  } else {
    for (const l of LABELS) {
      const n = tail.humanDistribution[l];
      const note = l === 'unknown' ? '  ← 词表与人工都判不出（一致）' : l === 'low' ? '  ← 词表管线的增量' : '  ← 词表长尾被人工捞出 = Jev 的分辨';
      L.push(`  human=${pad(l, 7, 'right')}  ${pad(String(n), 4, 'right')}  (${rateText(n, tail.annotated)})${n > 0 ? note : ''}`);
    }
    L.push(`  分辨率      ${tail.resolved}/${tail.annotated} = ${rateText(tail.resolved, tail.annotated)}（≠unknown 的占比, 0 = 完全没分辨）`);
  }
  L.push('');

  const a = report.acceptance;
  const mark = { pass: '✅', fail: '❌', pending: '⏳' }[a.status];
  const line = a.status === 'pending'
    ? '⏳ pending（无标注数据, 不判定 pass/fail）'
    : `${mark} ${a.status === 'pass' ? 'PASS' : 'FAIL'} — 一致率 ${pct(report.overall.rate ?? 0)} vs 验收线 ≥${pct(a.threshold)}`;
  L.push('【7】验收线判定 (Jev-引入方案-v2.md §3 Wave 0 第 3 条)');
  L.push(`  ${line}`);
  L.push(`  长尾分辨: ${a.tailResolved > 0 ? `${a.tailResolved} 条从 unknown 桶里分辨出来` : '尚无分辨数据'}`);
  if (a.status === 'fail') {
    L.push('  ⚠️ 低于验收线 → 词表过宽/覆盖不足需诊断, 不得回头改 ruleLabel 让数字好看。');
  }
  L.push('');
  L.push('  档位判据速查:');
  for (const l of LABELS) L.push(`    ${pad(l, 7, 'right')}  ${LABEL_CN[l]}`);

  return joinLines(L);
}

/** CLI 参数: --file <path> / --json / --help（未知参数 → 报错退出, 不静默忽略）。 */
export function parseArgs(argv) {
  const out = { file: DEFAULT_SEED_FILE, json: false, help: false, errors: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file' || a === '-f') {
      const v = argv[++i];
      if (!v) out.errors.push('--file 后面要跟路径');
      else out.file = path.resolve(process.cwd(), v);
    } else if (a.startsWith('--file=')) {
      const v = a.slice('--file='.length);
      if (!v) out.errors.push('--file= 后面要跟路径');
      else out.file = path.resolve(process.cwd(), v);
    } else if (a === '--json') {
      out.json = true;
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    } else {
      out.errors.push(`未知参数: ${a}`);
    }
  }
  return out;
}

const USAGE = `用法: node scripts/green-consensus-report.mjs [选项]

  --file, -f <path>   标注集 JSON（默认 doc/green-annotation-seed.json）
  --json             stdout 只出机器可读 JSON（退出码 0）
  --help, -h         本帮助

退出码: 0 = 正常（含「humanLabel 全空 → 打印进度」）/ 1 = 文件读不了或数据非法
`;

function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (args.errors.length) {
    for (const e of args.errors) console.error(`❌ ${e}`);
    console.error(USAGE);
    return 1;
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(args.file, 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') console.error(`❌ 读不到标注集: ${args.file}`);
    else console.error(`❌ 解析标注集失败: ${args.file} — ${err.message}`);
    return 1;
  }

  const { entries, rejected, problems } = normalizeEntries(raw);
  if (problems.length) {
    console.error(`❌ 标注集数据有 ${problems.length} 处问题, 统计结果不可信, 拒绝出报告:`);
    for (const p of problems.slice(0, 20)) console.error(`   - ${p}`);
    if (problems.length > 20) console.error(`   ...（另有 ${problems.length - 20} 处）`);
    return 1;
  }

  const report = buildReport(entries);
  if (rejected.length) report.rejected = rejected;

  if (args.json) {
    // stdout 纯 JSON: 供 CI / 上层脚本消费, 人类输出走 stderr。
    console.log(JSON.stringify({ file: args.file, ...report }, null, 2));
    return 0;
  }

  console.log(renderReport(report, { file: args.file }));
  if (report.annotated === 0) {
    console.log('  (humanLabel 全空 → 打印进度后正常退出, 不算错。标注后重跑本命令。)\n');
  }
  return 0;
}

// 直接执行时跑 CLI; 被 import 时只导出纯函数（无副作用）→ 可直接进 node:test。
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}
