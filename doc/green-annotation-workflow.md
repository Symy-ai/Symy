# 绿色标注集 · 人工标注工作流

> 面向 owner / 标注员 · 场景 D（搜索结果绿色重排）Wave 0 验收线的前置件
> 关联：`doc/Jev-引入方案-v2.md` §3 Wave 0 · 数据文件 `doc/green-annotation-seed.json` · 结构定义 `src/lib/decision-gate/annotation-schema.ts`

---

## 0. 一句话任务

**给 220 条商品卡逐条打一个「绿色档位」人工标签**（`humanLabel`）。
判断依据只有标题（+ 可选的 category/subcategory/queryContext）文本，**不看分数、不搜资料、不猜品牌**。

产出物只有一个字段：`humanLabel`。其余字段一律不动。

---

## 1. 字段含义

| 字段 | 谁填 | 含义 | 标注员要不要动 |
|---|---|---|---|
| `id` | 脚本 | 条目号 `ann-0001` 起，标注时回话引用它 | 不用 |
| `locale` | 脚本 | `zh` / `en`，标注语种 | 不用 |
| `title` | 脚本 | 商品卡标题（判断的唯一主要依据） | 只读 |
| `category` / `subcategory` | 脚本 | 品类/子品类，辅助语境（如「厨房」） | 只读 |
| `queryContext` | 脚本 | 搜索时用户的 query，**可空**。非空时表示这次搜索处在绿色语境里 | 只读 |
| `ruleLabel` | 脚本 | **现行词表管线的档位（冻结基准）** | ❌ **绝对不许改** |
| `humanLabel` | **你** | 人工判定的档位 | ✅ **只填这个** |
| `source` | 脚本 | `seed-fixture` 冷启动样本（未来会是 `manual` 真实搜索结果） | 不用 |
| `notes` | 脚本 | 出处标记。含 `synthetic-from-lexicon` = 词表合成标题（非真实商品卡） | 只读 |

> ⚠️ **不要偷看 ruleLabel 再标**。`ruleLabel` 的存在就是为了做独立对照，先看它会把对照变成自证。
> 建议：让标注员在**隐藏 ruleLabel 列**的副本上标注（见 §4）。

---

## 2. 四档判据（绿色认定三原则）

判档不是「我觉得环保不环保」，而是「**这条标题文本，能不能拿得出可溯源的绿色断言**」。三原则来自 BP p19 防漂绿三原则（与代码里的三道守卫一一对应）：

| 原则 | 含义 | 对应守卫 |
|---|---|---|
| ① 分数确定性 | 判断只来自可复算的规则/可溯源的证据，不来自印象 | `green-score-determinism-guard.test.ts` |
| ② 断言可溯源 | 标题里的绿色断言必须指向**具体的东西**（材质/工艺/来源/认证），不能是形容词堆砌 | `green-label-traceability-guard.test.ts` |
| ③ 未认证 ≠ 不绿 | 没证据不等于「不绿」，只是「尚未验证」——荣誉框架，不是羞耻框架 | `green-uncertified-tone-guard.test.ts` |

### 2.1 档位定义

| humanLabel | 判据 | 典型例子 |
|---|---|---|
| **`high`** | 标题给出了**可溯源的绿色断言**，且该断言足以单独支撑「这是一件绿色商品」。通常需要：明确材质（有机棉/竹/再生材料）、明确工艺（可降解/可堆肥/二手/租赁）、或明确认证（FSC/GOTS/一级能效/公平贸易） | `有机棉毛巾`、`Bamboo cutting board`、`九成新二手背包`、`FSC certified ... shelf` |
| **`medium`** | 有**真实但偏弱**的绿色属性：耐用/可重复使用/可替换装这类「延长寿命」属性，单独不足以让用户一眼认它是绿色商品 | `耐用雨伞`、`Durable steel water bottle`、`替换装洗手液` |
| **`low`** | 绿色属性弱到不值得展示（环保宣称若有若无、或只是营销话术）。**词表管线没有这一档**——如果你给了一堆 `low`，那正是我们要用语义层去抓的增量信号 | `某品牌天然材质系列`（只有品牌话术，无具体断言） |
| **`unknown`** | **判不出 / 证据不足 / 与绿色无关**。绝大多数普通商品都该落这里——不沾绿色词 ≠ 不绿（原则③），只是**没有绿色证据** | `GT-2000 跑鞋 42 码`、`不锈钢扳手套装`、`无线蓝牙耳机` |

### 2.2 边界怎么拿捏（最常吵的四个）

1. **材质 vs 形容词**：`竹制牙刷`（high，具体材质） vs `天然质感生活馆`（low/unknown，只有形容词）。
2. **二手/租赁 = high，不是 medium**：延长生命周期的绿色断言强度不低于再生材料。
3. **高影响品类不是「非绿」**：`一次性塑料杯` 不是 low，是 **unknown**——原则③，说它「不绿」是抹黑，只能说它**命中了高影响品类**（`non_green_flag`，管线上另有通道，不体现在本标注集）。
4. **含 `synthetic-from-lexicon` 的条目**：标题是脚本拼的，语法可能不自然。**按字面读它写了什么证据词**来判，不要脑补品牌、型号或规格；读着别扭就在 `notes` 里加一句说明。

---

## 3. 目标量与配额

| 指标 | 值 | 现状 |
|---|---|---|
| 总量 | ≥ 200（Wave 0 验收线） | **220**（110 zh + 110 en，冷启动超额铺量） |
| 中英配额 | 每侧 ≥ 100 | zh 110 / en 110 ✅ |
| 真实夹具样本 | 越接近 200 越好 | 59 条（27%） |
| 词表合成样本 | 补量用 | 161 条（73%） |

**⚠️ 73% 是合成样本 —— 这是本轮最大的已知缺陷。** 合成标题只能验证「词表覆盖够不够」，
验证不了「语义层能不能看懂真实商品标题」。所以：

- 本轮标注结果**只能当作方向性参考**，不能直接当 Wave 0 的一致率验收数；
- 下一轮必须用 `source: 'manual'` 的**真实 symy_search 结果样本**替换掉最弱的合成条目（优先替换 `synthetic` + `unknown` 的组合——那是最不像真实搜索结果的）。

---

## 4. 怎么标

### 4.1 推荐做法：拿一份隐藏 ruleLabel 的副本

```bash
cd <repo>
node -e "const d=require('./doc/green-annotation-seed.json'); \
  require('fs').writeFileSync('/tmp/annotate-blank.csv', \
  'id,locale,title,category,queryContext,humanLabel,notes\n' + \
  d.map(e=>[e.id,e.locale,e.title,e.category||'',e.queryContext||'','',
            (e.notes||'').includes('synthetic')?'synthetic':''].map(s=>
              '\"'+String(s).replace(/\"/g,'\"\"')+'\"').join(',')).join('\n'))"
```

产出 `/tmp/annotate-blank.csv`（**无 ruleLabel 列**），填第 6 列 `humanLabel`。
`notes` 列里 `synthetic` 标记要留着——它影响你对标题可信度的预期。

### 4.2 回填

填完后把 `humanLabel` 写回 JSON（**只加 `humanLabel` 键，值是四档之一**）：

```jsonc
{
  "id": "ann-0001",
  "locale": "zh",
  "title": "竹制牙刷（软毛）",
  "ruleLabel": "high",        // 不动
  "humanLabel": "high",       // ← 你填的
  "source": "seed-fixture",
  "notes": "seed-fixture:src/lib/__tests__/green-label-traceability-guard.test.ts"
}
```

规则：

- **只加 `humanLabel`**，不排序、不改 id、不动任何别的字段；
- `humanLabel: "unknown"` 表示**你标过了、结论是「无绿色证据」**；**字段缺席**表示**还没标**——两者语义不同，别用缺席代替 unknown；
- 拿不准的条目：在 `notes` 末尾追加 `| 存疑: <原因>`，标 `unknown`，别硬猜。

### 4.3 一致性自查（标完先自己过一遍）

同一批标完后，随机抽 20 条重标一遍，重标一致率应 ≥ 90%。低于 90% 说明判据没吃透——
**先别提交**，回头重读 §2 的四个边界。

---

## 5. 标完之后：一致性对比（下一步的活）

下一阶段用 Jev / `LLMWrapperGate` 跑同一批 state，与人工标注做对照。
`LLMWrapperGate` 的量表档位顺序已是 `unknown → low → medium → high`
（见 `src/lib/decision-gate/__tests__/gate-fixtures.ts` 的 `SCORE`），
与本标注集的档位顺序一致，**不需要再做映射转换**。

对比口径（三层，缺一不可）：

| 层 | 指标 | 用途 |
|---|---|---|
| 整体 | `ruleLabel` vs `humanLabel` 逐条一致率 | 验收线 ≥ 90% |
| 分语言 | zh 一致率 / en 一致率 **分开报** | 防「英文泛化好、中文翻车」 |
| 混淆矩阵 | 四档 × 四档 | 看**假阳性**（rule 说 high，人工说 unknown）与**假阴性**哪个更致命 |

诊断口径：

- **假阳性多**（词表说 high，人工不认）→ 词表过宽，语义层更准，Jev 有价值；
- **假阴性多**（词表漏，人工认）→ 词表覆盖不足，**语义层的 ROI 就在这里**（这正是 `low` 档存在的意义）；
- **某 locale 一致率显著低** → 词表/分词问题，不是模型问题（`green-rules.ts` 的 ASCII 整词边界匹配对英文友好、中文走子串）。

> 对比脚本尚未编写（行动清单 #3 的下一格）。届时**不得**回头改 `ruleLabel`
> 来「让数字好看」——基准冻结是这一整套东西的前提。

---

## 6. 红线

1. **不虚构标注值** —— 生成器永远不写 `humanLabel`；人写不写、就写你真判的。
2. **不改 `ruleLabel`** —— 它是冻结基准，改了就失去对照意义。
3. **不虚构碳足迹数值** —— 判断只看定性证据。标题里没有的数字不许推断出来。
4. **数据文件在 `doc/`，不进 `src/`** —— 标注集是数据不是产品代码，不进构建产物。
5. **`ruleLabel` 随词表变** —— `green-rules.ts` 的词表一改，重跑脚本会得到不同的 `ruleLabel`。
   标注完成冻结后，若要改词表，**先复制一份基线 JSON** 再改，不要原地覆盖。
