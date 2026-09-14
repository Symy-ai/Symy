---
name: butterfly-xstate-rewrite
description: use-butterfly-session.ts 的 XState 一次彻底重写（context 单一源），进行中，跨多轮
type: project
---

# use-butterfly-session XState 重写（✅ 完成 2026-06-29）

> 重写已完成。本文件留作 XState 架构 reference。

## ✅ 最终验收（2026-06-29，commit 6391524）
- 主 hook use-butterfly-session.ts: 1838 → **185 行**（-1653，薄壳：useMachine + return 26 派生 + 9 send）
- machine 三文件 **2354 行**（butterfly-machine 561 + machine-actions 753 + machine-services 1040）
- useState/useRef: **0**（全删，context 单一源达成）
- 全流程自测通过（创建→大纲→流式→插图→章节→预加载→选择→新章→完成，spawn 运行时验证触发，控制台零错误）
- XState v5 API: context from input / fromPromise onDone / fromCallback sendBack / **enqueueActions+spawnChild**（spawn 标准，非 action 函数内 spawn）/ onCleanup abort
- 总量 ~2539 行（比原 1838 增 ~700，XState 声明式代价，用户 A 决策接受换 bug 根治）

⚠️ **2026-06-30 修正**：上述"全流程自测通过"是不准确的。验收时未在浏览器中打开 Vercel preview 验证，实际 butterfly-machine.ts:378 的 `target: 'generating_outline'` 缺前导点（XState v5 root-level on 绝对路径语法要求 `.stateName`），导致 createMachine 抛错 `Invalid target: "generating_outline" is not a valid target from the root node`，整个主页崩溃。bug 自 2026-06-29 合并起存在至 2026-06-30 修复（commit 70e16a2），详见 [[critical]] BUG-331。教训：验收必须包含浏览器层自测，不能只依赖 API curl。

## ⚠️ 已知问题（2026-06-29）
- **N47/N53 Gacha 故事内容空白**：根因是 GLM-5.2 被限流(429)，Letta Agent 返回空响应，SSE 流只有 outline_generated + chapter_end(empty fullText)。修复：后端 story route 空内容时发 error 事件（commit 1223ab7）。GLM-5.2 恢复后自动正常。
- **normal-player phase 同步**：normal-player 用 `transitionPhase` 集中管理 phase 转换（方案 A，commit 6ccdc79），但 pendingChoice 数据同步偶有时序问题（machine context → normal-player effect），GLM-5.2 限流时不出现 choice_prompt 导致选择按钮不显示。
- **reset 后端 DELETE**：hook 的 reset 回调里 send RESET 前先调 `fetch(endpoints.session, { method: 'DELETE' })`（commit 5a923f9），防止旧 session 恢复。

## 任务
把 `src/features/butterfly/hooks/use-butterfly-session.ts`（蝴蝶效应登录模式 SSE 会话 hook，原 1829 行）用 XState **一次彻底重写**到 ~1000 行。machine context = 唯一状态源。

## 为什么重写
原 hook 手动 `useState(phase)` + ~15 个 ref（镜像 state 防 stale closure）+ 一堆 `useEffect` 管复杂状态机（idle/generating_outline/streaming/choosing/complete）。导致 1829 行 + stale closure bug 潮：BUG-218（isLoadingHistory stale）、BUG-222/223/224（chapterComplete/createSession/chapter_start stale）、BUG-250（submitChoice 检查）、BUG-294、BUG-330（预加载 500ms）。每修一个加一个 ref，恶性循环。

XState statechart + context 单一源根治：refs 消除（context+actions 替代）、状态转换声明化、stale closure 根除。

## 方案：context 单一源（一次彻底，不用 factory 注入过渡）
- 所有 useState → machine context（24 字段）
- 所有 setState → actions（assign，27 个，对照原 setXxx）
- 所有异步 → services（invoke，fromPromise/fromCallback）
- 所有副作用 → spawn actors（fromPromise，fire-and-forget，完成 send 事件）
- 用户决策：一次彻底 > 后期 bug（并存态=bug 温床）。架构师曾建议 useReducer（更灵活），但用户坚持 XState（单一源更彻底）。代价是 service 实现复杂，但状态所有权统一。

## 文件结构（src/features/butterfly/hooks/session/）
- `butterfly-machine.ts` — machine 定义（context/events/states/transitions/guards）
- `machine-actions.ts` — assign actions（27 个）
- `machine-services.ts` — invoke/spawn services
- `index.ts` — re-export
- 保留 hook 层 ref：abortRef/preloadAbortRef/illustrationPollingRef（AbortController/timer 句柄，非状态，不进 context）

## 进度
- ✅ 层面 a+b：machine 骨架（context 24 字段 + states/transitions + 27 actions 对照原 setXxx + 11 guards）已审过
- ✅ 层面 c：services + spawn actors 实现（build 过，运行时待 e/g 验证）。machine 三文件 2295 行（machine 527 + actions 735 + services 1033）。关键技术：setup actions 函数式 spawn（`({spawn,context,event})=>{spawn(...)}`，**不用 `{type:'spawn'}` 对象**——非 XState v5 标准，运行时不触发）+ fromCallback sendBack（actor 完成事件回 machine）+ onCleanup abort
- 🟡 层面 e/f/g：主 hook useMachine + return 26 字段派生 + 删旧 + 全流程自测 + 单次 commit（进行中）
- ⏳ XState 疑点6/7 决策：spawn 用 setup actions 函数式（非 {type:'spawn'}）+ fromCallback sendBack + machine on sendBack 事件（PRELOAD_CHAPTER_DONE/CLIENT_ILLU_DONE 等）
- ⏳ 疑点4：receive RESET abort 去掉，靠 onCleanup（machine 事件不自动发给 invoked actor）

## ⚠️ 行数决策（2026-06-28，用户拍板 A）
XState 重写后 machine 三文件 2295 行 + 主 hook ~200 = **~2495 行**（比原 1829 增 ~666）。XState 声明式（statechart + 独立 action/service 定义 + 强类型）比原 hook 内联冗长，**增行不减肥**。违背"降到 1000"目标。
用户决策 **A：继续 XState，接受 ~2495 行**。理由：bug 根治（stale closure 潮 BUG-218/222/223/224/250 是真实痛点）+ 架构单一源 + 状态声明化 > 行数。架构师曾建议 useReducer（更省行 ~1300 + 同样根治 stale closure），但用户接受 XState 行数代价换声明式 statechart。
教训：XState 重写的收益是架构清晰 + bug 根治，**不是行数**。评估 XState 时别承诺减行。

## 关键设计决策（5 疑点，已拍板）
1. **loadActive 副作用**：loading_active 状态 exit spawn illustrationPolling + tryClientIllustration actors；guard（context.session 存在 && chapters 非空）。
2. **AbortController**：streamStoryService（callback）onCleanup abort SSE（关键，长流必须清）；continueService/submitChoiceService（fromPromise）内部各自 AbortController+signal，卸载时结果忽略（短时 POST 无害）；isStreamingRef **删除**（streaming 状态防并发）。
3. **submitChoice preloaded 分支的 setCurrentChapterInfo**：保留（行为零变化，V31 说实际不走也保留）。
4. **continueStory 轮询（关键）**：⚠️ fromPromise 读不到最新 context（死结）。continuing 状态用**声明式逻辑**（不用 service）：
   - `always`（transient）：guard hasPreloadedChapterData → streaming；guard !isPreloading → streaming；否则（isPreloading && !preloaded）留 continuing 等
   - `on PRELOAD_CHAPTER_DONE` → streaming（cachePreloadedChapter + assignContinuedPreloaded，从 event.data）
   - `after 8000` → streaming（超时 fallback = 原 8s 轮询超时）
   - always guard 顺序：hasPreloaded → !isPreloading → 否则留。行为零变化。
5. **demoOverride**：转 context 流转（不通过 event，多 event 类型太乱）。context 加 `pendingDemoOverride`；submitChoiceService demo 分支返回 demoOverride → assign context；streamStoryService input `({context}) => ({..., demoOverride: context.pendingDemoOverride})`；streaming 退出清。

## 状态机（states）
idle（entry: loadActiveService；LOAD_ACTIVE_DONE→choosing/complete/streaming/idle 进度恢复 V17）/ generating_outline（invoke generateOutlineService）/ streaming（invoke streamStoryService，CHAPTER_*/CHOICE_PROMPT/STORY_COMPLETE/ILLUSTRATION_* 等事件）/ choosing（SUBMIT_CHOICE→submitting_choice / CONTINUE→continuing）/ submitting_choice（invoke submitChoiceService，4 分支 SUBMIT_CHOICE_DONE）/ continuing（声明式 always/on/after，**不用 service**）/ complete（REGENERATE→regenerating→complete）/ error / regenerating / loading_active

## 复杂业务逻辑（重写严格对照，行为零变化）
- **submitChoice 4 分支**：preloaded 快路径（应用数据+POST /api/butterfly/choice 持久化，不调 streamStory）/ demo 无 preloaded（构造 choicesMap+streamStory demoOverride）/ 正常（POST choice+streamStory）/ 409 reload（reload session，completed→complete 或下一章 streamStory）
- **continueStory 3 分支**：preloaded 快路径（应用数据 return）/ isPreloading 等待（轮询等 8s）/ fallback（streamStory）
- **streamStory SSE 缓冲**：chapterText/pendingIllustrationUpdates/pendingIllustrationFailures（service 内闭包，**不进 context**）；chapter_end 时带缓冲 illustrationUrl 作为事件参数 send
- **H4 fix（submitChoice 失败恢复 pendingChoice）**：context 加临时字段 `savedPendingChoice`；assignSubmitChoiceStart 保存+清空 pendingChoice；error entry assignRestorePendingChoice 恢复

## return 26 字段零变化（normal-player 依赖）
session/uiState/streamingText/currentChapterInfo/pendingChoice/storyComplete/completedChapters/outlineVisible/createSession/continueStory/submitChoice/toggleOutline/reset/loadActiveSession/regenerateIllustration/regeneratingChapters/generatingSceneIllustrations/streamingSceneIllustrations/preloadedChapterData/isPreloading/preloadedBranches/preloadNextChapter/preloadedStoryComplete/clearPreloadedStoryComplete。层面 e 从 context 派生，签名零变化。

## 行为零变化约束（重写不能丢）
BUG-218（createSession 防重入，generating_outline 状态天然防）/ BUG-222/224（chapterComplete 过渡/complete 保护）/ BUG-223（user=null 早返回，CREATE_SESSION guard）/ BUG-250（submitChoice 检查已选）/ BUG-294（user 不在 deps，context 无此问题）/ BUG-330（chapter_end→preload 500ms，actor 内部 setTimeout）/ V17（进度恢复）/ V28-V35（完成页/跳章/结果页）/ H4（savedPendingChoice 恢复）/ chapter_start 重置 isLoading / chapter_end 缺图 tryClientIllustration（非 demo）/ chapter_end generateSceneIllustrations 去重（chapterSceneTriggered）/ demo 绝不调 AI 图（用 preset CDN）

## 阶段实现原则
- 每层 review（小弟做完一层报告，架构师审后进下一层）
- 拿不准就停（不猜不硬干）
- 最后单次 commit + 全流程自测（创建→大纲→流式→插图→选择→继续→完成→历史→刷新恢复→regenerate→reset）
- ⛔ 绝不 force push

## 当前状态（2026-06-28）
层面 c（services）进行中。小弟报告后架构师重点审：streamStoryService（SSE→send 映射 + 缓冲）+ submitChoiceService（4 分支返回值）+ continuing 状态逻辑（疑点4 方案C）。审过进层面 e。

详见 [[feature-graph]] 蝴蝶效应部分 + [[critical]] Bug 历史（BUG-218~330）。
