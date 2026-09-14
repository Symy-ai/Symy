<!-- 安全强制规则表 — 模式移植自 anthropics/commerce-agents docs/safety.md
     Copyright 2026 Anthropic PBC. SPDX-License-Identifier: Apache-2.0 (模式借鉴)
     Symy 适配版：宪法条款从 prompt 级升到代码级。模型行为不可信，executor 兜底才可信。 -->

# Symy 安全强制规则表（代码级）

原则：**在工具调用内强制的规则在所有路径上成立**（Letta 手动调用 / chat 流式 / 匿名）。
prompt 里的规则只是请求；本表的规则是执行。

## 已在代码强制（手 = Shopping 仓库）

| 规则 | 执行位置 | 状态 |
|---|---|---|
| Context 硬校验：user_ref/session_ref 必填 ≤128，lang/currency 枚举 | `src/app/context.py` INVALID_INPUT | ✅ 已有 |
| 金额一律 cents 整数，拒绝浮点字符串 | context.py 字段约束 | ✅ 已有 |
| checkout 不下单：只返回确认与清单，无支付面 | symy_cart checkout 分支 | ✅ 已有 |
| 商品卡数据不可被模型改写：卡片由服务端组装 | symy_search/compare 返回结构化 cards | ✅ 已有 |
| 错误码枚举 + retryable 标记 | 统一返回 envelope | ✅ 已有 |
| 绿色等级服务端评定（不信模型自评） | `src/app/green.py` green_level | ✅ 新增 09-06 |

## 已在代码强制（脑 = WeAreAllMe 仓库）

| 规则 | 执行位置 | 状态 |
|---|---|---|
| 第三方文本围栏：商品标题/链接/邮件片段进 Letta 上下文前 sanitize+围栏+截断 | `src/lib/fencing.ts`（09-06 移植自 commerce-agents fencing.py，Apache-2.0） | ✅ 新增 |
| 流分离：reasoning/status/progress 与正文分道；正文只来自 text_delta | `src/lib/agent-stream.ts`（09-06 移植 turn.py 模式） | ✅ 新增 |
| 泄漏兜底：正文疑似整段英文推理时截取末段干净答案 | `stripLeakedReasoning`（同上） | ✅ 新增 |
| 分享卡零金额：金句上卡前剥货币形态 | `share-card-modal stripMoney` | ✅ 已有 |
| QA/测试数据不进社区流 | `src/lib/content-gate.ts`（fix5 lane 夜窗在修） | 🌙 进行中 |
| 匿名链路无购物工具 | agent attach 只走 per-user | ✅ 已有 |

## 仍托付给模型（prompt 级，模型违约时损失限于文本）

- 守护叙事的语气（荣誉非羞耻）
- 复用优先的主动建议时机
- 不编造商品属性（卡片数据模型只可引用）

模型违反以上时，错误被限制在它的文本里；本表上半部分保证每个写操作、每个数字、
每张卡在到达用户之前都过了代码关卡——失败是需纠正的措辞，不是需要回滚的动作。

## 部署侧归属（我们自担）

- Caddy Bearer 鉴权（hands 公网入口）✅
- Letta per-user agent 隔离 ✅
- Supabase RLS（UPDATE 必带 WITH CHECK）✅
- 日志卫生：session id 即凭证，只记 digest —— 待办（低优先）
