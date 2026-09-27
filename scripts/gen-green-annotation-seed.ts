/* eslint-disable no-console -- 脚本类文件 console 是本职输出 */
/**
 * 场景 D 绿色标注集冷启动生成器（Wave 0 验收线 #2 前置，行动清单 #3）
 *
 * 背景: doc/Jev-引入方案-v2.md §3 Wave 0 要求「标注集 = symy_search 结果样本 ×
 * 人工绿色评分，目标 ≥200 条中英各半」。人工评分是 owner/标注员的活，本脚本只做
 * **骨架与冷启动样本**：把结构铺好、把 ruleLabel（现行词表冻结基准）算出来，
 * humanLabel 一律留空等人填。
 *
 * 三条硬纪律:
 *   1. 不虚构标注值 — humanLabel 字段**根本不写进 JSON**（缺席 = 尚未标注）。
 *   2. ruleLabel 只由词表管线机械算出 — evaluateGreenSignal 是唯一真相源，
 *      词表一改基准就变，所以生成结果进版本库，基准随文件冻结。
 *   3. 夹具不足的 locale 用词表合成标题补量 — 合成样本 notes 打
 *      'synthetic-from-lexicon'，统计时必须与真实样本分开看（置信度更低）。
 *
 * 用法（不进 CI，owner/标注员手动跑）:
 *   npx tsx scripts/gen-green-annotation-seed.ts
 *
 * 注: tsx 未在 package.json 里（本仓库只在 lock 中作为 payload 的传递依赖存在），
 * 跑法是 npx 从 node_modules/.bin 取，不新增任何 npm 依赖。
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GREEN_FLAG_RULES,
  evaluateGreenSignal,
  queryHasGreenIntent,
  GREEN_SCORE_BADGE_THRESHOLD,
} from '../src/lib/green-rules';
import { classifyGreenLevel } from '../src/lib/green-level';
import { DEMO_GREEN_ITEMS, DEMO_IMPULSE_ITEMS } from '../src/lib/demo-data';
import {
  GREEN_ANNOTATION_SEED_OVERSHOOT,
  GREEN_ANNOTATION_TARGET_PER_LOCALE,
  GREEN_ANNOTATION_TARGET_TOTAL,
  SYNTHETIC_NOTE,
  type GreenAnnotationEntry,
  type GreenAnnotationLabel,
  type GreenAnnotationLocale,
} from '../src/lib/decision-gate/annotation-schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const OUT_FILE = join(REPO_ROOT, 'doc', 'green-annotation-seed.json');

/** 抽夹具的测试目录 + 白名单文件名（只取绿色评分链相关的，别把全仓绿色文案测试都拖进来） */
const FIXTURE_DIRS = [
  'src/lib/__tests__',
  'src/components/chat/parts/__tests__',
];
const FIXTURE_WHITELIST =
  /^(green-(rules|level|first-rank|sort|score-determinism-guard|label-traceability-guard|uncertified-tone-guard|first-render|intent-render))\.test\.tsx?$/;

/**
 * 词表 → 现行管线的三档映射（冻结基准）。
 * green-level.ts 只有 high/medium/unknown 三档，标注集多一档 'low' 留给语义层
 * 表达「弱到不值得展示」——现行词表无此语义，一律不产出，映射为 unknown。
 */
function ruleLabelOf(
  title: string,
  category: string | undefined,
  subcategory: string | undefined,
  queryContext: string,
): GreenAnnotationLabel {
  const [signal] = evaluateGreenSignal(queryContext, [{ title, category, subcategory }]);
  const level = classifyGreenLevel(signal);
  // 'low' 是语义层专用档：词表管线不产出，避免制造"基准里有 low"的错觉
  return level === 'low' ? 'unknown' : level;
}

/** zh 判定用汉字区间，混排（'GT-2000 跑鞋 42 码'）按 zh 归 */
function localeOfTitle(title: string): GreenAnnotationLocale {
  return /[\u4e00-\u9fff]/.test(title) ? 'zh' : 'en';
}

/** JSON 字符串字面量里的转义还原（夹具里都是 '...' 单引号，够用） */
function unescapeSingleQuoted(raw: string): string {
  return raw.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

// ============================================================
// 1. 夹具抽取 — 从测试源码里捞真实样例商品卡
// ============================================================

/** 形如 { title: 'X', category: 'Y', subcategory: 'Z' }（允许 {...base, 展开）或 { title: 'X' } */
const CARD_OBJECT_RE =
  /\{\s*(?:\.\.\.[A-Za-z_$][\w$]*\s*,\s*)*title:\s*'((?:[^'\\]|\\.)*)'(?:\s*,\s*category:\s*'((?:[^'\\]|\\.)*)')?(?:\s*,\s*subcategory:\s*'((?:[^'\\]|\\.)*)')?\s*\}/g;

/** 形如 for (const title of ['A','B',...]) —— green-level.test.ts 的成组断言 */
const FOR_OF_TITLES_RE = /for\s*\(\s*const\s+title\s+of\s+\[([\s\S]*?)\]\s*\)/g;
const SINGLE_QUOTED_RE = /'((?:[^'\\]|\\.)*)'/g;

/** 从测试源码里抽出的原始卡（未去重、未跑词表） */
interface RawCard {
  title: string;
  category?: string;
  subcategory?: string;
  queryContext?: string;
  origin: string;
}

function extractFixtureCards(): RawCard[] {
  const cards: RawCard[] = [];

  for (const relDir of FIXTURE_DIRS) {
    const dir = join(REPO_ROOT, relDir);
    let files: string[];
    try {
      files = readdirSync(dir);
    } catch {
      console.warn(`  ⚠️  跳过缺失目录: ${relDir}`);
      continue;
    }
    for (const file of files.filter((f) => FIXTURE_WHITELIST.test(f))) {
      const src = readFileSync(join(dir, file), 'utf8');
      const origin = `seed-fixture:${relDir}/${file}`;

      for (const m of src.matchAll(CARD_OBJECT_RE)) {
        cards.push({
          title: unescapeSingleQuoted(m[1]),
          category: m[2] ? unescapeSingleQuoted(m[2]) : undefined,
          subcategory: m[3] ? unescapeSingleQuoted(m[3]) : undefined,
          origin,
        });
      }

      for (const m of src.matchAll(FOR_OF_TITLES_RE)) {
        for (const s of m[1].matchAll(SINGLE_QUOTED_RE)) {
          cards.push({ title: unescapeSingleQuoted(s[1]), origin });
        }
      }
    }
  }
  return cards;
}

/** 夹具里带 query 语境的卡（意图加成影响 ruleLabel，丢了就不准） */
function extractQueryContexts(): Array<{ title: string; query: string }> {
  const out: Array<{ title: string; query: string }> = [];
  for (const relDir of FIXTURE_DIRS) {
    const dir = join(REPO_ROOT, relDir);
    let files: string[];
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }
    for (const file of files.filter((f) => FIXTURE_WHITELIST.test(f))) {
      const src = readFileSync(join(dir, file), 'utf8');
      // 卡字面量 + 绿色 query 常量的同现（例: green-first-rank 的 '环保材质水杯'）
      const queryConsts = [...src.matchAll(/(?:const\s+)?([A-Z_]*GREEN[A-Z_]*QUERY\w*)\s*=\s*'((?:[^'\\]|\\.)*)'/g)];
      for (const q of queryConsts) {
        const cards = [...src.matchAll(CARD_OBJECT_RE)]
          .map((m) => unescapeSingleQuoted(m[1]))
          .filter((t) => src.includes(t));
        for (const title of cards) {
          out.push({ title, query: unescapeSingleQuoted(q[2]) });
        }
      }
    }
  }
  return out;
}

// ============================================================
// 2. 合成补量 — 夹具不够的 locale 用词表品类拼标题
// ============================================================

/** 合成模板：每条 = 词表证据词 + 品类名词。flag 词取自 GREEN_FLAG_RULES（保证可复算） */
const SYNTH_TEMPLATES: Array<{ zh: string; en: string; category: { zh: string; en: string } }> = [
  { zh: '{flag}纯棉浴巾', en: '{flag} cotton bath towel', category: { zh: '个护家纺', en: 'home textiles' } },
  { zh: '{flag}亚麻衬衫', en: '{flag} linen shirt', category: { zh: '服饰', en: 'apparel' } },
  { zh: '{flag}实木餐桌椅', en: '{flag} solid wood dining set', category: { zh: '家具', en: 'furniture' } },
  { zh: '{flag}竹制收纳盒', en: '{flag} bamboo storage box', category: { zh: '家居', en: 'home' } },
  { zh: '{flag}棉麻抱枕套', en: '{flag} cotton linen cushion cover', category: { zh: '家居', en: 'home' } },
  { zh: '{flag}再生纸笔记本', en: '{flag} recycled paper notebook', category: { zh: '文具', en: 'stationery' } },
  { zh: '{flag}可降解垃圾袋', en: '{flag} compostable bin bags', category: { zh: '日用', en: 'household' } },
  { zh: '{flag}替换装洗手液', en: '{flag} refill hand wash', category: { zh: '个护', en: 'personal care' } },
  { zh: '{flag}可换芯滤芯', en: '{flag} refill filter cartridge', category: { zh: '家电配件', en: 'appliance parts' } },
  { zh: '{flag}有机蜂蜜', en: '{flag} organic honey jar', category: { zh: '食品', en: 'food' } },
  { zh: '{flag}耐用保温杯', en: '{flag} durable steel bottle', category: { zh: '户外', en: 'outdoor' } },
  { zh: '{flag}租赁电动钻', en: '{flag} power drill rental', category: { zh: '工具', en: 'tools' } },
  { zh: '{flag}二手山地车', en: '{flag} secondhand mountain bike', category: { zh: '运动', en: 'sports' } },
  { zh: '{flag}古着牛仔外套', en: '{flag} vintage denim jacket', category: { zh: '服饰', en: 'apparel' } },
  { zh: '{flag}麻布收纳篮', en: '{flag} hemp storage basket', category: { zh: '家居', en: 'home' } },
  { zh: '{flag}认证有机咖啡豆', en: '{flag} certified organic coffee beans', category: { zh: '食品', en: 'food' } },
  { zh: '{flag}节能电风扇', en: '{flag} energy efficient desk fan', category: { zh: '家电', en: 'appliances' } },
  { zh: '{flag}循环利用旧衣改造', en: '{flag} upcycled denim jacket', category: { zh: '服饰', en: 'apparel' } },
  { zh: '{flag}一级能效空调', en: '{flag} energy star air conditioner', category: { zh: '家电', en: 'appliances' } },
  { zh: '{flag}公平-trade 可持续衬衫', en: '{flag} fair trade shirt', category: { zh: '服饰', en: 'apparel' } },
];

/**
 * 非绿合成模板 —— 真实搜索结果里绝大多数卡不沾绿色词（green-level 的 unknown
 * 档才是主档）。冷启动若只铺绿色模板, ruleLabel 会全堆在 high, 一致率对照就
 * 失真（假阳性无处暴露）。故合成量按 ~7:3 分给绿色/非绿模板。
 */
const SYNTH_TEMPLATES_NON_GREEN: Array<{ zh: string; en: string; category: { zh: string; en: string } }> = [
  { zh: '无线蓝牙耳机 主动降噪', en: 'Wireless earbuds charging case', category: { zh: '数码', en: 'electronics' } },
  { zh: '陶瓷咖啡杯 350ml', en: 'Ceramic coffee mug 12oz', category: { zh: '家居', en: 'home' } },
  { zh: '加厚玻璃保鲜盒 4 件', en: 'Borosilicate glass meal prep containers', category: { zh: '厨房', en: 'kitchen' } },
  { zh: '儿童拼图 100 片', en: 'Kids puzzle 100 pieces', category: { zh: '玩具', en: 'toys' } },
  { zh: '不锈钢锅具六件套', en: 'Stainless steel cookware set 6pc', category: { zh: '厨房', en: 'kitchen' } },
  { zh: '运动速干 T 恤', en: 'Quick dry running t-shirt', category: { zh: '服饰', en: 'apparel' } },
  { zh: '一次性塑料餐盒 50 只', en: 'Disposable plastic food containers 50ct', category: { zh: '厨房', en: 'kitchen' } },
  { zh: '数据线 2 米', en: 'USB-C cable 2m braided', category: { zh: '数码配件', en: 'electronics' } },
];

/** 模板取 locale 侧的品类名 */
function category(
  tpl: { category: { zh: string; en: string } },
  locale: GreenAnnotationLocale,
): string {
  return tpl.category[locale];
}

/** 每条 flag 规则的代表证据词（取词表里第一个匹配 locale 的词，附尾数避免重名） */
function representativeKeyword(flag: string, locale: GreenAnnotationLocale): string | null {
  const rule = GREEN_FLAG_RULES.find((r) => r.flag === flag);
  if (!rule) return null;
  const isZh = (k: string) => /[\u4e00-\u9fff]/.test(k);
  return rule.keywords.find((k) => (locale === 'zh' ? isZh(k) : !isZh(k))) ?? null;
}

function buildSyntheticCards(
  locale: GreenAnnotationLocale,
  need: number,
  usedTitles: Set<string>,
): RawCard[] {
  if (need <= 0) return [];
  const origin = `seed-fixture:lexicon-combination(${locale})`;
  const out: RawCard[] = [];
  const flags = GREEN_FLAG_RULES.map((r) => r.flag);
  // 绿色:非绿 ≈ 7:3 —— 非绿侧多铺 1 条, 免得非绿档位样本太薄
  const greenNeed = Math.round(need * 0.7) + 1;

  // 轮转 flag × 模板，保证覆盖面铺开（而不是同一条 flag 刷满）
  for (let i = 0; i < flags.length * SYNTH_TEMPLATES.length && out.length < greenNeed; i++) {
    const flag = flags[i % flags.length];
    const tpl = SYNTH_TEMPLATES[Math.floor(i / flags.length) % SYNTH_TEMPLATES.length];
    const keyword = representativeKeyword(flag, locale);
    if (!keyword) continue;
    const title = tpl[locale].replace('{flag}', keyword);
    if (usedTitles.has(title)) continue;
    usedTitles.add(title);
    out.push({ title, category: category(tpl, locale), origin });
  }

  for (let i = 0; out.length < need; i++) {
    const tpl = SYNTH_TEMPLATES_NON_GREEN[i % SYNTH_TEMPLATES_NON_GREEN.length];
    const round = Math.floor(i / SYNTH_TEMPLATES_NON_GREEN.length);
    const title = round === 0 ? tpl[locale] : `${tpl[locale]} ${round + 1}${locale === 'zh' ? '件装' : ' pack'}`;
    if (usedTitles.has(title)) continue;
    usedTitles.add(title);
    out.push({ title, category: category(tpl, locale), origin });
  }

  return out;
}

// ============================================================
// 3. 组装 — 排序、编号、落盘
// ============================================================

function dedupe(cards: RawCard[]): RawCard[] {
  const seen = new Set<string>();
  return cards.filter((c) => {
    // 跨夹具按标题去重: 同一个标题出现在多个测试文件里是常态
    // (例「竹制牙刷（软毛）」在 label-traceability 与 score-determinism 都有),
    // 标注集里重复出现等于给标注员白送一遍同一道题, 且会虚增样本量
    if (seen.has(c.title)) return false;
    seen.add(c.title);
    return true;
  });
}

function main(): void {
  console.log('\n🌱 场景 D 绿色标注集冷启动生成 — doc/green-annotation-seed.json\n');

  // 3.1 夹具卡（含 demo green feed —— symy_search 结果的既有真实样本）
  const fixtureCards = dedupe([
    ...extractFixtureCards(),
    ...DEMO_GREEN_ITEMS.map((i) => ({
      title: i.item,
      category: i.category,
      origin: 'seed-fixture:src/lib/demo-data.ts#DEMO_GREEN_ITEMS',
    })),
    ...DEMO_IMPULSE_ITEMS.map((i) => ({
      title: i.item,
      category: i.category,
      origin: 'seed-fixture:src/lib/demo-data.ts#DEMO_IMPULSE_ITEMS',
    })),
  ]);

  // 3.2 给带 query 语境的卡补 queryContext（影响意图加成→ruleLabel）
  const queryCtx = extractQueryContexts();
  const queryByTitle = new Map<string, string>();
  for (const { title, query } of queryCtx) {
    if (queryHasGreenIntent(query) && !queryByTitle.has(title)) queryByTitle.set(title, query);
  }
  for (const c of fixtureCards) {
    const q = queryByTitle.get(c.title);
    if (q) c.queryContext = q;
  }
  console.log(
    `  🔍 带 query 语境的夹具卡: ${fixtureCards.filter((c) => c.queryContext).length} 条（意图加成参与 ruleLabel）`,
  );

  // 3.3 目标配额：每 locale ≥ GREEN_ANNOTATION_TARGET_PER_LOCALE × 超额系数（110 → 共 220）
  const byLocale: Record<GreenAnnotationLocale, RawCard[]> = { zh: [], en: [] };
  for (const c of fixtureCards) byLocale[localeOfTitle(c.title)].push(c);

  // 合成标题不得撞上已有夹具标题（按标题去重: 合成侧总是带 category,
  // 夹具侧常常没有, 用 title|category 做键两边对不上 → 用纯标题）
  const usedTitles: Set<string> = new Set(fixtureCards.map((c) => c.title));

  const locales: GreenAnnotationLocale[] = ['zh', 'en'];
  const perLocaleTarget = Math.round(
    GREEN_ANNOTATION_TARGET_PER_LOCALE * GREEN_ANNOTATION_SEED_OVERSHOOT,
  );
  for (const locale of locales) {
    const have = byLocale[locale].length;
    const need = Math.max(0, perLocaleTarget - have);
    const synth = buildSyntheticCards(locale, need, usedTitles);
    byLocale[locale].push(...synth);
    console.log(
      `  ${locale}: 夹具 ${have} 条, 合成补量 ${synth.length} 条 → 共 ${byLocale[locale].length} (目标 ${perLocaleTarget})`,
    );
  }

  // 3.4 转成标注条目（ruleLabel 现算，humanLabel 不写）
  const entries: GreenAnnotationEntry[] = [];
  let seq = 1;
  for (const locale of locales) {
    for (const c of byLocale[locale]) {
      const queryContext = queryByTitle.get(c.title);
      const synthetic = c.origin.includes('lexicon-combination');
      entries.push({
        id: `ann-${String(seq++).padStart(4, '0')}`,
        locale,
        title: c.title,
        ...(c.category ? { category: c.category } : {}),
        ...(c.subcategory ? { subcategory: c.subcategory } : {}),
        ...(queryContext ? { queryContext } : {}),
        ruleLabel: ruleLabelOf(c.title, c.category, c.subcategory, queryContext ?? ''),
        source: 'seed-fixture',
        notes: synthetic ? `${SYNTHETIC_NOTE} · ${c.origin}` : c.origin,
      });
    }
  }

  // 3.5 落盘（humanLabel 缺席 = 尚未标注，红线：生成器不写人工值）
  const json = JSON.stringify(entries, null, 2);
  writeFileSync(OUT_FILE, `${json}\n`, 'utf8');
  console.log(`\n  ✅ 已写入 ${OUT_FILE}`);

  // 3.6 统计打印（owner 核对用）
  const total = entries.length;
  const countBy = <T extends string>(list: T[], value: T): number =>
    list.filter((x) => x === value).length;
  const zhN = countBy(entries.map((e) => e.locale), 'zh');
  const enN = countBy(entries.map((e) => e.locale), 'en');
  const syntheticN = entries.filter((e) => (e.notes ?? '').includes(SYNTHETIC_NOTE)).length;
  const labels: GreenAnnotationLabel[] = ['high', 'medium', 'low', 'unknown'];
  const ruleDist = entries.map((e) => e.ruleLabel);

  console.log(`\n  📊 总条数: ${total} (验收线 ≥${GREEN_ANNOTATION_TARGET_TOTAL}, 冷启动按 ${perLocaleTarget}×2 铺)`);
  console.log(`  🌐 locale 分布: zh=${zhN}, en=${enN}`);
  console.log(
    `  🧪 来源分布: 真实夹具=${total - syntheticN}, ${SYNTHETIC_NOTE}=${syntheticN}`,
  );
  console.log(
    `  🏷️  ruleLabel 分布: ${labels.map((l) => `${l}=${countBy(ruleDist, l)}`).join(', ')}`,
  );
  console.log(
    `  ✍️  humanLabel 已填: ${entries.filter((e) => e.humanLabel !== undefined).length} (应为 0, 等人工标注)\n`,
  );
  console.log(`  ℹ️  徽章线: green_score >= ${GREEN_SCORE_BADGE_THRESHOLD} 判 high（词表冻结基准）`);
  console.log(`  ℹ️  'low' 档为语义层专用, 词表管线不产出 → ruleLabel 无 low`);
  console.log(`  ℹ️  人工回填见 doc/green-annotation-workflow.md\n`);
}

main();
