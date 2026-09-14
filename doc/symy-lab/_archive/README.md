# _archive/ — 治理方案归档目录

> 本目录存放 Symy Lab 治理方案的归档文档，分两类：
>
> 1. **`pre-startup/`** — 初创期（月活 0）延后归档的 3 份术层治理文档（用户共治 / 千年治理 / 投资人完整条款+失效应对+法律载体候选）
> 2. **完整版归档**（本目录根）— 4 份完整版条款（月活 > 10 万或 A 轮后启用）

---

## pre-startup/ — 初创期延后归档（3 份）

详见 [pre-startup/README.md](pre-startup/README.md)。

| 文件 | 行数 | 召回触发条件 |
|------|------|------------|
| `governance-operations.md` | 628 | 月活 ≥ 1 万 |
| `governance-millennium.md` | 318 | 月活 ≥ 10 万 + 独立审查院设立 |
| `governance-external.md` | 682 | 首轮融资启动 或 A 轮融资 |

---

## 完整版归档（4 份，月活 > 10 万或 A 轮后启用）

满足以下任一条件时，将对应完整版恢复到主目录（或合并到 pre-startup/ 对应文档）：

| 完整版文件 | 启用条件 |
|----------|---------|
| `governance-investor-terms-full-v1.md` | A 轮融资启动 / 月活 > 10 万 / B 股持有人 ≥ 5 名 / Foundation 理事会决议启用 |
| `governance-fallback-rules-full-v1.md` | 用户共治实际运行（月活 > 10 万）/ 接班人机制启动 / B 股实际发行 |
| `governance-core-full-v1.md` §1.4 | 月活 > 10 万 + 接班人机制启动（完整 8 类事项否决权分级表） |
| `governance-appendix-full-v1.md` | 月活 > 10 万 / A 轮融资完成 / 接班人机制启动 / Foundation 理事会决议启用 |

### 启用流程

1. Foundation 理事会 2/3 通过启用决议
2. 用户反对 < 30%
3. 将完整版内容合并回主目录对应文件（或 pre-startup/ 对应文档召回后合并）
4. 删除本目录对应文件（git 历史保留）
5. 在 symylab.org/governance-history 公开记录

### 文件清单

- `governance-investor-terms-full-v1.md` — 投资人完整 11 项权利 + capped profit + 强制赎回 + 失效应对
- `governance-fallback-rules-full-v1.md` — 完整 4 个失效机制（法律载体迁移 / 用户共治失效 / 区块链加密顺位失效 / B 股投资人保护失效）
- `governance-core-full-v1.md` — 完整 8 类事项否决权分级表（日常运营/发展基金/轮值选人/加密顺位/主航道/重大资产/技术替换/法律迁移）
- `governance-appendix-full-v1.md` — 完整附录（A.1-A.8 与华为一致内容 + B.1-B.13 法律审计）

---

## 归档原则

> 老子曰："少则得，多则惑。"
>
> 主目录只留 Day 1 必用文档，其他按触发条件归档。归档不等于删除——内容保留，等触发条件满足时"召回"到主目录。
>
> 这避免"为未发生的事立法"，同时保证组织规模化时治理规则可即时启用。
