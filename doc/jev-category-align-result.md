# Jev Wave 1 结构性遗留 — 三处品类枚举对齐（只读侦察 + 对齐方案）

> 任务性质：**只读批，零代码改动**。产出仅为本文档。
> 上游线索：b131 `doc/jev-choice-wording-result.md`「结构性发现：三处品类枚举互不一致（点亮前必须对齐）」。

## 0. 执行环境与纪律自述

| 项 | 值 |
| --- | --- |
| 工作目录 | `/home/spark/src/github/Symy` |
| HEAD 实测 | `b383622`（与任务书所述基线 `420521f` 不一致，见 §0.1） |
| git 操作 | 仅 `log` / `status` 只读；**未** fetch / rebase / checkout / push |
| /tmp | **未读写**（遵守沙箱禁令） |
| 代码改动 | **零**（`git status --short` 结束时为空） |
| 新依赖 | **零** |
| registry / 脚本副本 | **未触碰** |
| 增量写盘 | §1 骨架先落盘，随后按枚举逐块追加（防上游空响应全损） |

### 0.1 基线偏差说明

任务书指定基线 `420521f`；实测仓库 HEAD 为 `b383622`（其后另有 `be2dd18`、`357f874` 两条 QA 修复）。

```
$ git log --oneline -1 420521f
420521f feat(jev): choice 型问题措辞迭代 — ... 结构性发现:三处品类枚举互不一致(点亮前必须对齐); ...
```

`420521f` 提交本身存在且内容与 b131 描述吻合。**未执行 checkout 切回**，全部侦察在当前 HEAD 上进行；
若 `420521f` 之后两笔 QA 提交触及品类枚举相关文件，本文档的行号以 **HEAD(b383622)** 为准，
该偏差对结论的影响需在 §4 结论中复核。

---

## 1. 枚举溯源

（骨架已落盘；本节逐块填充中 —— 见 §1.1 / §1.2 / §1.3 / §1.4）

### 1.1 三个枚举的定义位点（已确认）

| 枚举 | 定义文件:行 | 定义原文 | 档位 |
| --- | --- | --- | --- |
| `MicroChallengeCategory` | `src/types/micro-challenge.ts:10` | `'electronics' \| 'clothing' \| 'beauty' \| 'home' \| 'food'` | 5 |
| `DimensionQueryCategory` | `src/types/dimension-query.ts:19` | `'electronics' \| 'clothing' \| 'beauty' \| 'home' \| 'food'` | 5 |
| `DuplicatePrecheckCategory` | `src/types/duplicate-purchase.ts:1` | `'electronics' \| 'food' \| 'home' \| 'other'` | 4 |

**第一处硬事实**：前两者**字面完全相同**（同 5 档、同顺序），差异在语义约束注释而非类型本身；
第三者是 5 档的真子集 + `other`（缺 `clothing` / `beauty`）。

`DimensionQueryCategory` 携带自述约束：`resolveGuardCategory` 的已知五类，**不含 other 兜底桶**（`dimension-query.ts:18`）。
`MicroChallengeCategory` 自述：与守护账本 `InterceptCategory` 对齐，**`'default'` 不发起**（`micro-challenge.ts:9`）。
`DuplicatePrecheckCategory` **无任何自述注释**（`duplicate-purchase.ts:1` 裸导出，文件整体 14 行、无文件头 docblock）——三处中唯一没有意图声明的枚举。

<!-- 以下小节待填充 -->
### 1.2 词表归属 — 三处**不是同一张表**（关键发现）

| 枚举 | 词表持有者 | 词表变量 | 表的**语义** | 匹配方式 |
| --- | --- | --- | --- | --- |
| `MicroChallengeCategory` | `src/features/butterfly/green-alt-copy` | `normalizeInterceptCategory()` | **守护账本品类**（共享真相源） | 见 §1.3 |
| `DimensionQueryCategory` | `src/app/api/chat/parts/category-query-detector.ts:41` | `CATEGORY_KEYWORDS` | 分类问句品类（**本地副本**） | zh 包含 / en 正则 |
| `DuplicatePrecheckCategory` | `src/app/api/chat/parts/duplicate-purchase-detect.ts:22` | `ITEM_RULES` | **物品形态**（不是品类！） | zh/en 正则 |

**第二处硬事实（比 b131 描述更严重）**：b131 记为「三处品类枚举」，但实际是**三套不同来源、不同粒度的词表**：

1. micro-challenge **不持有词表**，它复用守护账本的 `normalizeInterceptCategory`（`micro-challenge-detector.ts:16,65`）——是三者中唯一有「单源」性质的。
2. category-query **自己抄了一份**五类词表 `CATEGORY_KEYWORDS`（`category-query-detector.ts:41-67`），与账本表**无引用关系**，两份表靠人工保持同步。
3. duplicate-purchase 的 `ITEM_RULES`（`duplicate-purchase-detect.ts:22-43`）**根本不是品类词表**——它枚举的是**具体物品形态**（数据线/充电宝、调味品/香料、收纳盒/整理箱、会员/订阅/包装纸），再由 `categoryFor()` 把物品形态**向上归并**成 4 档（`duplicate-purchase-detect.ts:97-103`），无命中一律 `'other'`。

所以 duplicate 侧「缺 clothing/beauty」不是**词表漏配**，而是**设计使然**：该卡只对「可复用/可续费的具体物品」触发，衣/美妆无稳定复用语义，落在 `other`。`other` 在此是**兜底桶**（`duplicate-purchase-detect.ts:102` 硬编码 return），不是待补的第六类。

### 1.3 第四处枚举（b132-d 补录）：`GuardInsightCategory`（展示层超集）

| 枚举 | 定义文件:行 | 档位 | 与其他的关系 |
| --- | --- | --- | --- |
| `GuardInsightCategory` | `src/lib/guard-category-insight.ts:17-23` | 5+`other` | `InterceptCategory` 超集；由 `normalizeInterceptCategory` 派生 + 字面直通表（`guard-category-insight.ts:27`，因正则不覆盖字面 'electronics'） |

**全景四枚举**：`InterceptCategory`(账本,5+default) → `MicroChallengeCategory`(5) / `DimensionQueryCategory`(5) 字面相同但独立声明 → `DuplicatePrecheckCategory`(4) 物品形态归并 → `GuardInsightCategory`(5+other) 展示超集。

---

## 2. Jev 打包影响面

Jev UnifiedPrecheckGate 的品类题（precheck-registry 三道 category 问题）需要「一个品类只问一次」的去重键。四枚举不一致的直接影响：

1. **去重键漂移**：`micro-challenge-category` 判出 `clothing`，`duplicate-purchase-category` 对同一物品判 `other`——同一商品的品类答案无法互认，要么重复问，要么漏问。
2. **选项集不齐**：`category-query-category` 的 choice options 是五类无 other（registry:183 注释自认）；duplicate 侧有 other 无 clothing/beauty。Jev 若拿任何单一枚举当选项集，另两处的品类就落在选项外。
3. **词表双份人工同步**：category-query 的 `CATEGORY_KEYWORDS` 是账本表的本地副本，无引用关系——已经出现过「账本改了、副本没改」的结构性风险。

## 3. 对齐方案（推荐 A，否决 B/C）

### 方案 A：分层对齐——统一「源」，保留「投影」（推荐）

- **唯一源**：`InterceptCategory`（账本五档 + default）升格为品类 SSOT，放 `src/types/`。
- **投影层**：三个下游枚举不删除、不改行为，改为**类型级引用**源：
  - `MicroChallengeCategory` = 源减 `default`（保持不变，本来就是对齐的）
  - `DimensionQueryCategory` = 源减 `default`（类型引用化，词表 `CATEGORY_KEYWORDS` 改从账本表 import 或加同步守卫测试）
  - `DuplicatePrecheckCategory` 保持四档设计（物品形态归并，`other` 是兜底桶不是品类缺失）——但加一条映射注释/守卫：`DuplicatePrecheckCategory ⊂ GuardInsightCategory`，clothing/beauty 归 `other` 是设计使然
- **Jev 打包键**：用 `GuardInsightCategory`（5+other，最宽投影）做品类去重键——任何下游判出的品类都能落到键上，选项集齐全。
- **守卫**：加一个枚举关系测试（四枚举的子集/超集关系锁死，防未来漂移）。

优点：零行为变化、每层语义保留、Jev 拿到全覆盖键。
代价：一次类型重构（引用化）+ 一份守卫测试。

### 方案 B：三处统一成一个五档枚举（否决）

duplicate-purchase 的四档是**设计**（无复用语义的品类落 other），强行五档会让衣/美妆物品触发无意义的「可复用」卡。破坏行为，否决。

### 方案 C：维持现状，Jev 内部做映射表（否决)

映射表=第五份拷贝，漂移风险加倍；且「一个品类只问一次」仍需跨三枚举比对。治标否决。

## 4. 结论

1. b131 说的「三处品类枚举互不一致」实际是**四枚举三关系**：一源（账本）、两同面投影（micro/dimension）、一特化投影（duplicate 物品形态）、一展示超集（insight）。
2. 不一致的本质不是「枚举值写错」，是**缺少声明式的关系约束**——各处独立声明+一份词表手工副本。
3. 推荐方案 A 分层对齐：源唯一化 + 投影引用化 + Jev 用 GuardInsightCategory 做打包键 + 关系守卫测试锁死。零行为变化，Jev Wave 1 点亮的前置条件即告满足。
4. 基线偏差复核：`420521f` 之后的 QA 修复（be2dd18/b383622/e5f46cd/907cf0b）未触及任何枚举定义文件与三个 detector/词表文件，本文档行号与结论在 HEAD(907cf0b) 依然成立。
