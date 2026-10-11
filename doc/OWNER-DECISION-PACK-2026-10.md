# Symy Owner 决策包（2026-10-12 · R1256 定稿）

> 烧 token 战役 R70-R1255 的 owner 面待办总账。全部为「须 owner 动作/决策」项，
> 代码侧已就绪或有明确方案。按影响排优先级，每项给足背景+选项+建议。
> 灵感来源：PENDING-OWNER-DEPLOY.md（DB 族权威）+ 债务池 C 档 + R1228-R1255 战役新增。

---

## 一、DB 迁移 4 件（影响：性能+安全，风险：低）

**详见 supabase/migrations/PENDING-OWNER-DEPLOY.md**（六字段完备提案）。

| 优先 | 迁移 | 一句话 | 建议 |
|---|---|---|---|
| P1 | 148_rls_policy_guard | UPDATE policy 补 WITH CHECK（堵提权）+ DB 级守卫 | **批**（安全项，幂等，报错=发现漂移） |
| P1 | 149_search_path | SECURITY DEFINER 补 search_path（CVE-2024-7348） | **批**（安全项，逻辑零变更） |
| P2 | 145/146 索引 ×2 | 历史查询与收件箱的复合索引 | **批**（现规模锁表秒级；担心就控制台 CONCURRENTLY） |

## 二、Vercel env 补值（影响：Payload CMS 面，风险：低）

- **DATABASE_URL + PAYLOAD_SECRET** 空值 → /cms 线上是僵尸壳（登录壳 200，实际操作连不上 DB）。
- 修法：Vercel env 补 Supabase pooler 串 + 随机 secret；首启须 `npx payload migrate` 或临时 `push: true` 建 payload 表。
- 若短期不用 Payload CMS，**也可以不修**（僵尸壳无害），但建议从导航隐藏 /cms 或明确决策搁置。

## 三、GitHub secrets 3 组（影响：CI 完整度，风险：零）

现状：E2E、db-types-sync 两个 workflow 因 secrets 未配置**静默跳过**（CI 显示绿但没跑）。

| Secret 组 | 解锁什么 | 配置后联动 |
|---|---|---|
| E2E_EMAIL/PASSWORD | Playwright CI E2E（三个 P0 回归） | 须同步修 e2e/helpers.ts 旧 tab 名（'Now'→现名，'If'→现名）——e2e spec 自 CI 真跑以来未随 UI 演进更新 |
| SMOKE_EMAIL/PASSWORD | 冒烟测试的登录档 | 无 |
| SUPABASE_ACCESS_TOKEN + PROJECT_REF | database.types 生成物同步守卫 | 无 |

测试账号建议用 owner 测试号（793160223@qq.com）或专建一个。

## 四、人工标注 220 条（影响：Jev 决策门 Wave 1 扩面，风险：零）

- doc/green-annotation-seed.json：220 条（zh 110/en 110，合成 164/真实 56），humanLabel 全空。
- 工具链全就绪：`npm run green:consensus` 算一致率（pending 态正常）；工作流见 doc/green-annotation-workflow.md。
- 这是 Jev 语义判定质量验收线（≥90% 一致率）的唯一卡点——纯人工活，AI 不可代标。

## 五、文档处置（影响：仓库门面，风险：零）

- **api-reference.md**（649 行）：实测覆盖 13/120 路由，含 we=me/Symbio 旧品牌。三选一：
  a) 归档改名 api-reference-archive.md + README 更新（**建议**，零维护成本）
  b) OpenAPI 自动生成（一次性工具投入，长期零维护）
  c) 手写补全 107 路由（人月级，不建议）
- README 目录死链已修（d991e055）。

## 六、产品/功能决策（影响：体验，风险：各有）

| 项 | 现状 | 决策点 |
|---|---|---|
| daily-stats 死功能三件套 | 函数+cron+表零消费（R1214 定案） | 删函数+停 cron+drop 表？建议**删** |
| Jev 决策门扩面 | DECISION_GATE_ENABLED=1 已可点亮（现仅 micro-challenge 1 问） | 真实 Jev 接入时机 + 开关策略 |
| 五算法 push body 英文硬编码 | 中文用户收英文 body（科普金句性质） | 本地化还是保留英文梗？ |
| admin-settings 注册表 NEXT_PUBLIC_VAPID_PUBLIC_KEY 项 | 样例已删死键（ea11cf7c），注册表残留 | 顺手清 or 保留无害 |
| R1042 #20 按钮 UI 二值化 | 观察项在册 | 产品文案决策 |

---

## 建议的执行顺序

1. **一批做完**（10 分钟）：secrets 3 组（§三）——零风险解锁两个 CI 守卫
2. **一批批准**（5 分钟）：迁移 148+149（安全）→ 择时 145/146（性能）
3. **决策**：Payload 僵尸壳（§二）、api-reference 处置（§五 a/b/c）
4. **人工**：标注 220 条（§四，可分批，每批 50 条）
5. **产品决策**（§六）：攒产品例会

## 战役侧就绪状态

- 代码：main +493 commits，测试 10440|0 skipped，CI 三绿，六守卫 error 级
- 文档：六族待办全部有完备提案（本文档+PENDING-OWNER-DEPLOY.md+各池条目）
- 任何一项 owner 点头后，代码侧当天可执行完毕
