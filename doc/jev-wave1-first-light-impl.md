# Jev Wave 1 首条点亮实施+实弹记录

## 实施（518a71a）
- detector: resolveCategory 纯函数 + gateCategory 可选参数（dev 子代理）
- turn-context: getProductionGate 工厂 + argmax 接线 + 三级回退（coordinator）
- 回归: 四断言 + 610 文件 7288 用例绿 + tsc/eslint/build 0
- flag 默认关 = 生产逐字节不变

## 实弹（QA站 dpl_6xVH, DECISION_GATE_ENABLED=1 preview）
| 消息 | 结果 | 判读 |
|---|---|---|
| 我想买条牛仔裤 | 24h 微挑战卡（clothing）✅ | 原生词表命中（裤），gate/原生一致，通道未区分 |
| 想下单一个新手机壳 | **未发卡** | 词表洞（中文"手机"不在 phone 正则）+ gate 未补档 |

## 诊断（本地三断言 vitest 验证）
- 意图门过（"下单"）✅
- 原生归一 null（词表洞实锤）→ 原行为就不发卡
- gate 给 electronics 则发卡（点亮价值场景成立）

## 结论
1. **接线通道 OK**：flag 开、代码路径活（无 500 无异常，AI 主链正常回复）
2. **判定质量未达标**：LLMWrapperGate 对"手机壳"未给档——主嫌 300ms 预算对真 LLM 调用太紧（b130 已知 choice 摊平问题）→ fallback 走原生
3. **价值场景确认**：词表洞（中文"手机"）正是 gate 该补的——Jev 正式接入后 argmax 质量上来即可补洞
4. **决策**：preview 灰度保持开（通道验证目的已达成，无副作用——fallback 即原生行为）；词表洞顺手补（"手机"加进 electronics 正则，一行改）
