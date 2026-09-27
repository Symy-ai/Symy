# Jev registry choice 型问题措辞迭代结果（b131，重发版）

> 基线 7d18cd1 · space-bunny 产出（半成品）+ coordinator 接管收尾（脚本副本同步 + 双逗号修复 + 实弹复跑）
> 性质：只改 question 措辞 + choice.statement 选填字段 + wrapper 渲染；registry 数量/结构/detectorId/ruleRef 零变化

## 结论

| 项 | 结果 |
|---|---|
| choice.statement 选填字段 | types.ts 加（不写时行为与 b130 逐字节一致） |
| wrapper 渲染 | llm-wrapper-gate.ts renderQuestion 有 statement 就一起给模型；system prompt 补一行口径说明 |
| 9 个 choice 问题措辞 | registry 全部补「根据用户消息判断：…」+ 逐档锚点 + 品类类 other 强约束 |
| 结构性发现 | 三处「品类」问的真实枚举互不相同（micro=五档无other / category-query=五档无other / duplicate=四档含other无clothing/beauty）——登记簿原样记录，Wave 1 点亮前必须先对齐下游解包 |
| 测试 | decision-gate 33 用例绿 · tsc 0 · eslint 0 |
| 实弹复跑（coordinator） | 60/60 解析成功 · 品类三问 argmax 跟 state 走（不再轮流挑）· noul 7 问可分辨保持 · 摊平 3/20（措辞仍需 evals 调优=符合「措辞等真 Jev」设计） |
| 脚本副本 | coordinator 亲同步（8 问 statement 注入 + 双逗号语法修复）· 漂移自检 20/20 一致 |

## 过程备注
- b131 首发死于沙箱双拦（读 /tmp 探模型 + external_directory 写拒）零产出；重发版死于 OmniRoute 队列饱和 503（maxWaitMs 15s 满载）但半成品已落盘——coordinator 按 pitfall 62 接管。
