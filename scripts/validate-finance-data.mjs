/* eslint-disable no-console -- 脚本类文件 console 是本职输出 */
/**
 * finance 月账 JSON 校验脚本 (batch89-b) — owner 工具, 非产品代码。
 *
 * 背景: 财务公开数据是 src/data/finance/YYYY-MM.json 静态文件, owner 手动月更。
 * 页面 lib (src/lib/finance-public.ts) 对坏数据静默降级 — 键名写错 / 数字写成
 * 字符串 / 月份重号跳号, 上线后没人知道。本脚本给 owner 一个 30 秒自检,
 * 每月发账前跑一次:
 *
 *   npm run finance:validate
 *
 * 校验项:
 *   1. 文件名是 YYYY-MM, 且与内容 month 字段一致 (防错位)
 *   2. schema 键齐全: members + revenueUsd.{membership,other} + costsUsd.{infra,ai,team}
 *   3. 数字必须是 number 类型 (字符串 "100" 会被 lib 静默拼接算错)
 *   4. 月份不重号 (报错) 不漏月 (跳月只警告)
 *
 * 退出码: 0 = 通过 (跳月警告不算错); 1 = 有错误。零依赖 (node 内置 fs/path)。
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FINANCE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
  'finance',
);

/** 必须存在且为 number 的键路径 (members 顶层, 收支嵌套) */
const NUMBER_PATHS = [
  ['members'],
  ['revenueUsd', 'membership'],
  ['revenueUsd', 'other'],
  ['costsUsd', 'infra'],
  ['costsUsd', 'ai'],
  ['costsUsd', 'team'],
];

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** YYYY-MM → 自 0000-01 起的月序号, 用于算相邻差 */
const monthIndex = (m) => Number(m.slice(0, 4)) * 12 + (Number(m.slice(5, 7)) - 1);

/** 月序号 → YYYY-MM (补跳月提示用) */
const indexToMonth = (idx) =>
  `${String(Math.floor(idx / 12)).padStart(4, '0')}-${String((idx % 12) + 1).padStart(2, '0')}`;

/** 读嵌套键, 途中断链返回 undefined */
function getIn(obj, keys) {
  return keys.reduce((node, key) => (node == null ? undefined : node[key]), obj);
}

/** 单文件校验 → { stem, month, problems }; month 仅在可识别为合法 YYYY-MM 时有值 */
function validateFile(fileName, raw) {
  const stem = fileName.replace(/\.json$/, '');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    // safe to ignore: 解析失败会转成一条 problem 上报给 owner, 不是吞掉
    return { stem, month: null, problems: [`JSON 解析失败 (${err.message})`] };
  }

  const problems = [];
  if (typeof data?.month !== 'string' || !MONTH_RE.test(data.month)) {
    problems.push(`内容 month 字段缺失或不是 YYYY-MM (当前值: ${JSON.stringify(data?.month ?? null)})`);
  } else if (data.month !== stem) {
    problems.push(`文件名 "${stem}" 与内容 month "${data.month}" 不一致`);
  }

  for (const keys of NUMBER_PATHS) {
    const label = keys.join('.');
    const value = getIn(data, keys);
    if (value === undefined) {
      problems.push(`缺少键 ${label}`);
    } else if (typeof value === 'string') {
      problems.push(`${label} 写成了字符串 "${value}", 必须是数字`);
    } else if (typeof value !== 'number' || Number.isNaN(value)) {
      problems.push(`${label} 不是数字 (当前是 ${typeof value})`);
    }
  }

  return { stem, month: typeof data?.month === 'string' && MONTH_RE.test(data.month) ? data.month : null, problems };
}

/** 升序月份序列 → 跳月警告列表 (只提示, 不算错) */
function findGaps(sortedMonths) {
  const warnings = [];
  for (let i = 1; i < sortedMonths.length; i++) {
    const prev = sortedMonths[i - 1];
    const curr = sortedMonths[i];
    if (monthIndex(curr) !== monthIndex(prev) + 1) {
      warnings.push(`跳月: ${prev} → ${curr} (中间缺 ${indexToMonth(monthIndex(prev) + 1)})`);
    }
  }
  return warnings;
}

function main() {
  console.log('\n💰 finance 月账校验 — src/data/finance/\n');

  let fileNames;
  try {
    fileNames = readdirSync(FINANCE_DIR).filter((f) => f.endsWith('.json')).sort();
  } catch {
    // safe to ignore: 目录缺失是本脚本要报告的第一类错误本身 — 打印原因并 exit 1 即是处理
    console.error(`  ❌ 读不到 ${FINANCE_DIR} — 目录缺失?`);
    process.exitCode = 1;
    return;
  }
  if (fileNames.length === 0) {
    console.error('  ❌ 目录里没有任何 YYYY-MM.json — 还没建过账?');
    process.exitCode = 1;
    return;
  }

  const results = fileNames.map((f) =>
    validateFile(f, readFileSync(path.join(FINANCE_DIR, f), 'utf8')),
  );

  let errors = 0;
  for (const r of results) {
    if (r.problems.length === 0) {
      console.log(`  ✅ ${r.stem}.json (${r.month}) — OK`);
    } else {
      console.error(`  ❌ ${r.stem}.json — ${r.problems.length} 个问题:`);
      for (const p of r.problems) console.error(`     - ${p}`);
      errors += r.problems.length;
    }
  }

  // 月份重号: 多个文件指向同一个月
  const seenByMonth = new Map();
  for (const r of results) {
    if (!r.month) continue; // month 非法的文件已在单文件校验报错
    const prevFile = seenByMonth.get(r.month);
    if (prevFile) {
      console.error(`  ❌ 月份重号: "${r.month}" 同时出现在 ${prevFile}.json 和 ${r.stem}.json`);
      errors++;
    } else {
      seenByMonth.set(r.month, r.stem);
    }
  }

  const warnings = findGaps([...seenByMonth.keys()].sort());
  for (const w of warnings) console.log(`  ⚠️  ${w}`);

  const okCount = results.filter((r) => r.problems.length === 0).length;
  console.log(`\n  结果: ${okCount}/${results.length} 个月 OK, ${errors} 个错误, ${warnings.length} 处跳月提示`);
  if (errors > 0) {
    console.error('\n  校验未通过 — 修完再发月账。');
    process.exitCode = 1;
  } else {
    console.log('\n  全部通过 ✅');
  }
}

main();
