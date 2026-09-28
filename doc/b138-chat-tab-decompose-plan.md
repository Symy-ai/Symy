# b138 — chat-tab.tsx 705 行组件减负侦察方案

> 只读侦察产出，**零代码改动**。仓库 `night-main` @ `72b9d8e`。
> 目标文件：`src/components/chat-tab.tsx`（705 行，1 个导出组件 `ChatTab`）。
> 方法：分页通读全文 + 关联 hook/parts 逐个核验签名 + 现有测试清单扫描。

## 结论速览（TL;DR）

| 指标 | 数值 |
| --- | --- |
| 组件内 React 原生 hook 调用 | 32（useRef 12 / useState 9 / useCallback 6 / useEffect 4 / useLayoutEffect 1 / useMemo **0**） |
| 组件内自定义 hook 挂载点 | 24（去重后 23 个唯一 hook） |
| 识别出的**可抽取 hook 簇** | **4 个**（见 §2） |
| 最大单点收益项 | **§2.2「回访条全家桶」6 条回访条聚合为 1 hook + 1 渲染子树** |
| 风险项总数 | **5 个**（2 高 / 2 中 / 1 低，见 §5） |
| 抽完后预估行数 | 705 → **约 470–520 行**（减 185–235 行） |

---

## 1. hooks 全量清点

### 1.1 React 原生 hook（32 个调用点）

#### useState（9）

| 行号 | 声明 | 用途一句话 |
| --- | --- | --- |
| 91 | `[messages, setMessages]` | 消息列表本体（唯一被 `setMessagesSync` 包写的高频 state） |
| 92 | `[input, setInput]` | 输入框文本，被 `ChatComposer` 与 recap 快捷填入共用 |
| 94 | `[isLoading, setIsLoadingState]` | 发送/流式中标志 |
| 99 | `[isLoadingHistory, setIsLoadingHistoryState]` | 历史首屏加载标志（是 8 个回访 hook 的 `historyReady` 源头） |
| 104 | `[hasMore, setHasMoreState]` | Virtuoso 反向分页还有更多历史 |
| 110 | `[isLoadingMore, setIsLoadingMore]` | 分页加载中（配 109 行 `isLoadingMoreRef` 双写防双发） |
| 113 | `[firstItemIndex, setFirstItemIndex]` | Virtuoso 反向分页预留索引（初始 100000） |
| 125 | `[activeChallenge, setActiveChallenge]` | 当前活跃挑战（**注意**：为绕 BUG-334 TDZ 被强行上移到所有 effect 之前） |
| 136 | `[expiredChallenge, setExpiredChallenge]` | 已过期挑战 banner 用 |
| 139 | `[depositDialog, setDepositDialog]` | 存入弹窗 payload（沉默时刻结束后弹出） |
| 146 | `[historyLoadError, setHistoryLoadError]` | history GET 500 错误 banner 文案 |
| 147 | `[historyRetryNonce, setHistoryRetryNonce]` | 重试 nonce（仅用于让 loadHistory effect 重跑） |
| 499 | `[guardMomentsOpen, setGuardMomentsOpen]` | 守护时刻时间线卡片开关 |
| 509 | `[activeGuardsOpen, setActiveGuardsOpen]` | 进行中守护面板开关 |

> 注：`useState(` 匹配 9 组解构，但解构出 14 个 state 槽位（`messages/input/isLoading/isLoadingHistory/hasMore/isLoadingMore/firstItemIndex/activeChallenge/expiredChallenge/depositDialog/historyLoadError/historyRetryNonce/guardMomentsOpen/activeGuardsOpen`）。

#### useCallback（6）

| 行号 | 声明 | 用途一句话 |
| --- | --- | --- |
| 95 | `setIsLoading` | 包一层 `setIsLoadingState`（**零收益壳**，见 §2.4） |
| 100 | `setIsLoadingHistory` | 同上（**零收益壳**） |
| 105 | `setHasMore` | 同上（**零收益壳**） |
| 157 | `nextId` | 单调递增 ID 生成（BUG-181 防 `Date.now()` 碰撞） |
| 168 | `setMessagesSync` | 单次 setState 内同步 `messagesRef.current`，消除「ref 滞后一拍」竞态 |
| 391 | `sendMessageWithTaskTracking` | 包 `sendMessage`，先 `onMessageSent?.()` 再发（PM3-P2-1） |

#### useEffect（4）+ useLayoutEffect（1）

| 行号 | 声明 | 用途一句话 |
| --- | --- | --- |
| 129 | `[activeChallenge]` | 把 `activeChallenge` 同步进 `activeChallengeRef`（retry 读 ref 避免 stale） |
| 133 | `[impulseContext]` | 把 prop 同步进 `impulseContextRef` |
| 135 | `[locale]` | 把 i18n locale 同步进 `localeRef` |
| 167 | `[messages]` | 把 `messages` 同步进 `messagesRef`（`setMessagesSync` 之外的兜底路径） |
| 401 | useLayoutEffect `[sendMessageWithTaskTracking]` | 把包装后的发送函数写入 `sendMessageRef`（S-14 fix：必须早于 pendingContext effect 读到当轮闭包） |

#### useMemo

**0 个** —— 组件内没有任何派生值的记忆化，这是 §3 重绘热点的一部分。

### 1.2 useRef（12 个声明 / 19 个调用点，含嵌套）

| 行号 | 声明 | 用途一句话 |
| --- | --- | --- |
| 84 | `sendMessageLockRef` | 发送去重锁 `{inProgress,lastContent,lastTime}` |
| 85 | `justCompletedChallengeRef` | SSE `complete_challenge` 后抑制重复结算 |
| 90 | `justBoughtChallengeRef` | 「我选择买」路径标记，让流式 handler 跳过存款弹窗 |
| 109 | `isLoadingMoreRef` | Virtuoso `startReached` 同 tick 双发拦截（state 异步来不及） |
| 111 | `virtuosoRef` | Virtuoso 句柄（`scrollToIndex` 滚动到底） |
| 114 | `inputRef` | 输入框 DOM ref（focus / 快捷填词） |
| 115 | `isComposingRef` | 中文输入法 composing 态 |
| 117 | `abortRef` | 在途 `AbortController`，unmount/换用户时 abort（BUG-95） |
| 128 | `activeChallengeRef` | `activeChallenge` 的同步镜像（根因修复：retry 不读 stale 闭包） |
| 132 | `impulseContextRef` | `impulseContext` prop 镜像 |
| 134 | `localeRef` | `locale` 镜像 |
| 138 | `depositShownRef` | 同一 challenge 只弹一次存款框（DM-4，三条 SSE 路径共用） |
| 151 | `buddyStateRefreshTimerRef` | buddy 刷新 debounce 定时器 |
| 153 | `depositNavTimerRef` | 存入成功后 4.5s 跳转 profile 的定时器 |
| 156 | `idCounterRef` | 单调 ID 计数器（配 `nextId`） |
| 166 | `messagesRef` | `messages` 同步镜像（`setMessagesSync` 内**同帧**写，167 行 effect 只是兜底） |
| 212 | `skipNextHistoryLoadRef` | 防止 loadHistory 覆盖刚发消息（P1 fix） |
| 215 | `skipNonceRef` | 新版 nonce，替代上一条 boolean，防被消费后二次加载（NEW-012） |

### 1.3 自定义 hook 挂载点（24 处调用 / 23 个唯一）

| 行号 | hook | 一句话用途 | 重量级? |
| --- | --- | --- | --- |
| 79 | `useAuth` | 取 `user` + `authLoading` | 上下文 |
| 80 | `useI18n` | 取 `t` + `locale` | 上下文 |
| 82 | `useHourlyRate(isDemo)` | 生命小时数换算（258 行，本组件只取 `hourlyRate`） | 中 |
| 83 | `useSilentMoment(isDemo)` | 挑战后 2s 仪式 + 存入弹窗编排（解构 4 个值） | 中 |
| 180 | `useChatDemoMode` | demo 预填充 + demo→auth 清理 + 3 个 demo ref | 中 |
| 183 | `useMcpNotifications` | MCP 通知 + `handleMCPResults` + `addMcpNotification` | 重 |
| 209 | `usePendingContext` | challengeContext/contextMessage 暂存→自动发送（导出 4 ref） | 中 |
| 218 | `useChatLifecycleCleanup` | 换用户时清空全部 state/ref（**16 个入参**，见风险 R1） | 中 |
| 240 | `useChatHistory` | loadHistory + skip 消费 + contextMessage effect（**24 个入参**） | 重 |
| 266 | `useChatPersistence` | `saveMessage`/`deleteMessage`/`loadMoreMessages` | 重 |
| 286 | `useChallengeFetch` | 活跃/过期挑战拉取 | 中 |
| 299 | `useImpulseContext` | 诱导上下文 → 系统开场消息 | 轻 |
| 313 | `useChatActions` | `sendMessage`（**~470 行**，入参 40+，5 组命名对象） | 最重 |
| 411 | `useChallengeActions` | `handleGiveUp/ChooseToBuy/Resume/Dismiss`（427 行） | 重 |
| 446 | `useChatRecap` | 「上次我们聊到」一次性回顾条 | 轻 |
| 453 | `useMicroChallengeFollowup` | 微挑战次日回访条 | 轻 |
| 460 | `useCooldownFollowup` | 冷静卡次日回访条 | 轻 |
| 467 | `usePrepurchaseFollowup` | 买前三问回访条 | 轻 |
| 472 | `useDuplicateReuseFollowup` | 重复购买复用回访条 | 轻 |
| 479 | `useEmotionGuardFollowup` | 情绪守护 10 分钟到期待追问条 | 轻 |
| 485 | `usePostPurchaseReview` | 购后复盘回访条 | 轻 |
| 492 | `useWeeklyReview` | 周复盘数据 + 开关（解构 5 个值） | 中 |
| 498 | `useGuardMoments()` | 守护时刻时间线数据 | 中 |
| 504 | `useActiveGuards({cooldown})` | 进行中守护面板数据 | 中 |
| 512 | `useGreenCommitment` | 绿色承诺到期结算卡 | 中 |

---

## 2. 自定义 hook 抽取机会（4 个簇）

### 2.1 簇 A — 守护时刻面板（收益：中）

**现状**（`chat-tab.tsx:497-499` + `617-620` + `628`）：

```
useGuardMoments()            → { timeline, isLoading }     // 106 行，含 useAuth + 1 effect + 2 state
[guardMomentsOpen, set…]     → 独立面板开关 state
JSX: !isDemo && !open  → <GuardMomentsEntry onOpen={() => setOpen(true)} />
     open && !loading && timeline → <GuardMomentsCard timeline onClose={() => setOpen(false)} />
```

**注意任务描述里的偏差**：这里并不是「4 state + 2 effect」，而是 **2 state（hook 内）+ 1 state（组件内开关）+ 1 effect（hook 内）**。数据源 `useGuardMoments` 已经在 `@/hooks/` 下，与本组件只是 3 行消费关系。

**可抽取的其实只有开关**：`useDisclosure(open)`。但抽它收益极低（1 行 → 1 行），**不推荐单独抽**。

**真正值得做的是 §2.2 的模式统一**：把「open 开关 + 条件渲染 + 互斥让位」这套 3 行模板在 3 个面板（守护时刻 / 进行中守护 / 周复盘）上统一。详见 §2.2b。

### 2.2 簇 B — 进行中守护面板（收益：低）

**现状**（`chat-tab.tsx:501-509` + `624-631`）：

```
getActivePendingPrepurchase()                        // ⚠️ 每次 render 读 localStorage
useActiveGuards({ cooldown })                        → { summary, isLoading }
[activeGuardsOpen, set…]
JSX 条 + 卡 + latestWin={guardMoments?.months[0]?.moments[0] ?? null}
```

**发现一个真实低效点**：`getActivePendingPrepurchase()`（`prepurchase-store.ts:158`，`JSON.parse(localStorage)` + 7 天过期判定）在 **`chat-tab` 每次 render 都会执行一次**——因为 `app-tab-content.tsx` 里 `ChatTab` 的父级 state 变动（buddyState / dailyTasks / insightsVisible 等）会驱动整棵子树重渲，而这三行是 render-body 内联表达式。它又是 `useActiveGuards` 的入参，但 `use-active-guards.ts:119` 的 effect deps 是 `[]`（挂载快照），**入参变化根本不会重跑 effect**——所以这里每次 render 读 localStorage 是**纯浪费**，收益中（不是低）。

**修正后的判定**：`useActiveGuards` 只在挂载时取一次快照 → 组件内 `const pendingCooldown = getActivePendingPrepurchase()` 完全可以用 `useRef`/一次性 state 固化，或直接下沉进 `useActiveGuards`（挂载时读，与 deps `[]` 语义一致）。

### 2.3 簇 C — 回访条全家桶（收益：**高**）★ 最大收益项

**现状**（`chat-tab.tsx:452-488` 的 hook 侧 + `553-605` 的 JSX 侧）：

6 条回访条，**完全同构**：

| # | hook | 行号 | 解构 | 签名 |
| --- | --- | --- | --- | --- |
| 1 | `useMicroChallengeFollowup` | 453 | `{dueRecord, clear}` | `(isDemo, historyReady)` |
| 2 | `useCooldownFollowup` | 460 | `{dueRecord}` | `(isDemo, historyReady)` |
| 3 | `usePrepurchaseFollowup` | 467 | `{dueRecord, clear}` | `(isDemo, historyReady)` |
| 4 | `useDuplicateReuseFollowup` | 472 | `{due, clear}` | `(isDemo, historyReady)` |
| 5 | `useEmotionGuardFollowup` | 479 | `{dueRecord}` | `(isDemo, historyReady)` |
| 6 | `usePostPurchaseReview` | 485 | `{dueReview, reviewSummary, recordReview}` | `(isDemo, historyReady)` |

5 个是**逐字符同款模板**（`isDemo` + `historyReady` 两个入参，一个 `useState(null)` + 一个 `derivedRef` 锁 + 一个 `useEffect([isDemo, historyReady])`）。它们内部 hook 数 ≈ 6×4 = **24 个原生 hook 调用点**，全挂在 chat-tab 的 hook 序列里。

对应的 JSX 侧（`553-605`）是 6 段 `{dueX && <XFollowup … />}` 散列，中间还插着 recap 条、承诺结算卡、周复盘、守护时刻、进行中守护。

**方案**：新增 `chat/hooks/use-followup-strips.ts`：

```ts
export function useFollowupStrips({ isDemo, historyReady }: { isDemo: boolean; historyReady: boolean }) {
  // 内部调 6 个现有 hook，零改动转发
  return {
    recap, dismissRecap,                                        // useChatRecap
    micro: { due, onResolved },                                 // useMicroChallengeFollowup
    cooldown: { due },                                          // useCooldownFollowup
    prepurchase: { due, onResolved },                           // usePrepurchaseFollowup
    duplicateReuse: { due, onResolved },                        // useDuplicateReuseFollowup
    emotionWait: { due },                                       // useEmotionGuardFollowup
    postPurchase: { due, summary, onAnswered },                 // usePostPurchaseReview
  };
}
```

配套 `chat/sections/followup-strips.tsx` 承载 `553-605` 的 JSX（**53 行**）。

**净效果**：chat-tab 内 7 个 hook 调用点 + 53 行 JSX → **1 个 hook 调用点 + 1 个组件调用点（约 10 行）**，行数 **-45～55**；hook 装配密度下降，8 条独立子树的 conditional 集中到一处，新增回访条时改动面从「组件本体」降为「聚合 hook + 聚合 section」。

### 2.4 簇 D — 无收益壳清理（收益：低，但成本极低）

`setIsLoading` / `setIsLoadingHistory` / `setHasMore`（95/100/105 行）三个 `useCallback` 是**纯转发壳**，`useCallback` 在这里没有任何稳定性价值（传给子 hook 的都是函数引用，传原始 setter 与传包装后的引用在下游 `useCallback` deps 里等价）。可直接用 `useState` 原生 setter，**-9 行**，风险约等于零。

同理 `useMemo` 缺失是反问题（见 §3）——不是「多了」，是「少了」。

---

## 3. 重绘热点分析

### 3.1 前提核实：`useAuth` 侧已达标

`auth-provider.tsx:324-326`：

```ts
// 🔧 ARCH fix (Round 4 React C-2): useMemo context value 防止每次 render 新建对象
const contextValue = useMemo(() => ({ user, loading, signOut }), [user, loading, signOut]);
```

context value 已 memo（deps 是真实状态，非每轮新建）。全仓 `useAuth` 消费者 **19 个文件**（9 个 `.tsx` + 10 个 `.ts`，含 chat-tab 自身的 `useAuth`、`useHourlyRate`、`useGuardMoments`、`useActiveGuards`、`useImpulseWindow` 等）。**结论：auth 变更引起的大范围重绘已被 provider 侧兜住，chat-tab 内部无需再为 auth 做隔离。**

### 3.2 真实热点一：内联箭头函数 props（`chat-tab.tsx` 全文 14 处）

`ChatTab` 把下列**每次 render 都新建**的函数传给子组件，而子组件**均未 `React.memo`**（`chat-messages.tsx:52`、`chat-header.tsx:22`、`chat-banners.tsx:42`、`chat-composer.tsx:28`、`guard-diary-card.tsx:37`、`companion-background.tsx:19`、`night-guard-banner.tsx:23` 全部是裸 `export function`，`chat-messages.tsx` 内 `useMemo`/`memo` 匹配数为 **0**）：

| 行号 | 内联 prop | 宿主组件 | 备注 |
| --- | --- | --- | --- |
| 534 | `activeChallenge ?? (challengeContext ? {…} : undefined)` | ChatBanners | **每次 render 新建对象**（Bug 27 fallback） |
| 538-544 | `onRetryLoadHistory={() => {…}}` | ChatBanners | 闭包内读 `historyLoadError`/`setHistoryRetryNonce` |
| 557 | `onContinue={(prompt) => {…}}` | ChatRecap | |
| 617 | `onOpen={() => setGuardMomentsOpen(true)}` | GuardMomentsEntry | |
| 619 | `onClose={() => setGuardMomentsOpen(false)}` | GuardMomentsCard | |
| 624 | `onOpen={() => setActiveGuardsOpen(true)}` | ActiveGuardsEntry | |
| 629 | `onClose={() => setActiveGuardsOpen(false)}` | ActiveGuardsPanel | |
| 654 | `onSendMessage={(content) => sendMessage(content)}` | **ChatMessages** | **零参数转发，可直接传 `sendMessage`** |
| 678 | `onClose={() => { setDepositDialog(null); depositShownRef.current = null; }}` | DepositDialogSection | |
| 679-690 | `onDeposited={() => {…}}` | DepositDialogSection | 含 setTimeout 写入 `depositNavTimerRef` |
| 539/541/543 | 三连 state setter | 同 538 | |

**为什么这是热点**：父级 `app-tab-content.tsx` 持有大量 state（`activeTab`/`dailyTasks`/`insightsVisible`/`buddyState`/…），**任何一个变动都会让整个 `ChatTab` 重渲**（`ChatTab` 本身没有 `memo`），于是：
- `ChatMessages`（309 行，含 `messages.map` + 结构化卡片渲染）**整棵重渲**，
- `ChatComposer` 重渲（`messagesCount={messages.length}` 恒定，但函数 props 变了），
- 6 条回访条 + 5 张面板卡的子树重渲。

而 `<div className={activeTab === 'chat' ? … : 'hidden'}>`（app-tab-content:109）意味着：**即使当前在 buddy/monitor 标签页，chat 子树仍会被渲染**（只是 CSS 隐藏 + `inert`）。这就是 `inert`/`hidden` 优化存在的原因——但 CSS 隐藏**不阻止 React 渲染**，所以每次切标签的 state 变更都会重渲整个聊天列表。**这是当前最大的无谓开销源。**

### 3.3 真实热点二：render-body 内联 localStorage 读取

`chat-tab.tsx:503` `getActivePendingPrepurchase()` 在每次 render 做 `JSON.parse`（见 §2.2）。配合热点一，这条在流式输出时（`isLoading` 每 token 变、`messages` 每 chunk 变）会被高频触发。**中高收益，低风险。**

### 3.4 真实热点三：`messages` ref 双写冗余

`setMessagesSync`（168-177）已经在 functional update 内**同帧**写 `messagesRef.current`，167 行的 `useEffect` 是冗余兜底（注释自承「ref 滞后一拍但保证一致性」，与 161-165 的根因修复描述矛盾）。这条属于**语义澄清**而非性能，建议保留但更新注释——风险中，收益低，不建议在本次批次动。

### 3.5 不构成热点的项（避免误判）

- `ChatMessages` 的 `firstItemIndex`/`virtuosoRef`：都是 ref 或稳定 state，不额外触发。
- `useMcpNotifications` 返回的 `mcpNotifications`：state 变化才会重渲，路径正确。
- `useAuth` 19 消费者：provider 已 memo（§3.1）。

---

## 4. 拆解方案（4 步，每步独立可交付）

### 步 1 — 零收益壳清理（净减 9 行 / 风险≈0）
- 去掉 95/100/105 三个转发 `useCallback`，直接用原生 setter。
- 影响面：`useChatDemoMode` / `useChatHistory` / `useChatPersistence` 三个 hook 的入参类型由 `(v: boolean) => void` 变为 `Dispatch<SetStateAction<boolean>>`——**需同步类型**（否则 TS 报错）。
- 测试：无需新增，跑全量。

### 步 2 — 回访条聚合（净减 45～55 行 / 风险中）★ 收益最高
- 新增 `chat/hooks/use-followup-strips.ts`（纯转发，零逻辑变更）
- 新增 `chat/sections/followup-strips.tsx`（承载 553-605 的 53 行 JSX）
- 影响面：6 个 followup hook 本身**不动**；`useChatRecap` 从 446 行迁到聚合 hook 内（其 `messages` 入参仍由 chat-tab 传入）。
- 测试：**必须补** `chat/sections/__tests__/followup-strips.test.tsx`——逐条断言 6 条回访条的「出现/不出现 + onResolved 触发」。现有 `parts/__tests__` 里 `micro-challenge-followup` / `cooldown-followup` / `prepurchase-followup` / `duplicate-reuse-followup` / `emotion-guard-checkin` / `post-purchase-review` **6 个测试文件全部只测单个 part，不测编排顺序**，这是当前覆盖缺口，步 2 正好补上。

### 步 3 — 面板开关统一 + 缓存 localStorage 快照（净减 10～15 行 / 风险低）
- `chat-tab.tsx:503` 改为挂载时一次性固化 `getActivePendingPrepurchase()`（`useRef` 或下沉进 `useActiveGuards` 的 `[]` effect）。
- `guardMomentsOpen` / `activeGuardsOpen` 两个 state 可合并为一个 `useDisclosure` 或统一模式，保持可读。
- 影响面：`use-active-guards.ts` 若下沉入参，需同步其 `deps: []` 注释与 `cooldown` 类型；`guard-moments.test.tsx` / `active-guards.test.tsx` 需补「guest 态不打 API」用例（对应 QA2H P4 的 `enabled` 语义）。

### 步 4 — memo 边界（净减 0 行但降重绘 / 风险中）★ 可选，独立批次
- 4 个免改：`onSendMessage={sendMessage}`（654 零参转发）、617/619/624/629 的 open/close 箭头（改由步 2/3 产出的稳定回调）。
- 需改：给 `ChatMessages` / `ChatComposer` / `ChatBanners` / `ChatRecap` 加 `React.memo`（4 个文件 + 对应测试需确认 shallow/props 变更仍触发）。
- 影响面最大的一条：`ChatMessages` 被 `memo` 后，`messages` 数组引用变化仍会重渲（正确），但**父级无关 state 变动不再触发**——收益最大，同时风险也最大（memo 包裹后 props 深比较遗漏会导致 UI 不更新）。
- 测试：`chat-messages-fallback.test.tsx` / `green-first-render.test.tsx` / `green-intent-render.test.tsx` 需全绿；另外建议补一条「父级无关 state 变动 → 子组件不重渲」的回归断言（用 render 计数）。

### 行数预期

| 阶段 | 行数 |
| --- | --- |
| 现状 | 705 |
| 步 1 后 | ~696 |
| 步 2 后 | ~645 |
| 步 3 后 | ~632 |
| 步 4 后 | ~632（不减行，只降重绘） |

注：`architecture-guards.test.ts:251` 的上限是 **870 行**（余量 165），本方案任一步骤都不会触发该守卫；但**建议顺手把上限收紧到 640** 作为防回涨的锁（收紧值需 ≥ 步 3 后行数，留 10 行余量取 640）。注意 `architecture-guards.test.ts:551` 还有一条 timer 清理软守卫会扫 `chat-tab.tsx` 的 `setTimeout`/`clearTimeout` 配比（步 4 会减少行内 setTimeout，不影响配比判定）。

---

## 5. 收益评估与风险

### 收益矩阵

| 项 | 收益 | 说明 |
| --- | --- | --- |
| 步 2 回访条聚合 | **高** | -45～55 行；7 hook → 1；补上编排顺序的测试缺口；新增回访条改动面从组件本体降为两处局部 |
| 步 4 memo 边界 | **高**（性能维度） | 消除父级无关 state 引起的消息列表全量重渲；当前 `hidden`+`inert` 标签页切换每次都重渲整个聊天树 |
| 步 3 localStorage 快照 | **中** | 高频 render 期消除 `JSON.parse`；语义与 `deps: []` 对齐 |
| 步 1 转发壳清理 | **低** | -9 行，纯粹减负，但收益真实且零风险 |
| 步 3 开关统一 | **低** | 可读性为主 |
| §3.4 messagesRef 双写澄清 | **低** | 建议留到后续批次 |

### 风险清单（5 项）

| # | 风险 | 等级 | 说明 | 缓解 |
| --- | --- | --- | --- | --- |
| R1 | `useChatLifecycleCleanup`（16 入参）/ `useChatHistory`（24 入参）/ `useChatActions`（40+ 入参）已是「宽接口」传参式拆分 | **高** | 继续按同样模式抽 hook 会把 705 行的问题平移到 3 个 hook 文件里，且入参面继续膨胀。chat-tab 已从 747→705 只降 42 行，说明**纯搬运边际收益已接近耗尽** | 步 2/3 必须是「聚合已有 hook」而非「再拆一层转发」，否则负收益。步 4 之后应停止以行数为目标 |
| R2 | `React.memo` 包裹 `ChatMessages` 后 props 漏更新 | **高** | `buddyState` / `messages` / `mcpNotifications` 任一传法变化都可能静默不渲染；`ChatComposer` 有 `healthEvents = []` 默认值（每次新建数组）——**memo 下会永远不等** | 步 4 单独批次；`ChatComposer` 的默认 `[]` 必须改模块级常量或 `useMemo`；补 render 计数回归 |
| R3 | `activeChallenge` 因 BUG-334 被上移到所有 effect 之前（125 行注释详述 TDZ） | **中** | 任何把 `activeChallenge` 往下挪的重构都可能重新引入 TDZ ReferenceError | 步 2/3 不触碰该 state 的声明位置；新增 hook 只消费不重声明 |
| R4 | guest/demo 态的 `enabled` 语义（QA2H P4）分散在 3 个 hook 内 | **中** | `useHourlyRate` / `useGuardMoments` / `useActiveGuards` 各自内嵌 `useAuth` + `!!user` 判断；步 3 若改 `useActiveGuards` 入参可能踩到 `enabled` 覆盖语义（显式 `enabled` 必须仍能覆盖 `!!user`） | 步 3 只加不删；回归 `use-active-guards` 的 `enabled` 用例；注意 `use-active-guards.ts:119` 的 `deps: []` 与 `use-guard-moments.ts:103` 的 `deps: [enabled]` **不一致**，勿顺手统一 |
| R5 | 聚合 hook 返回对象的引用稳定性 | **低** | 若 `useFollowupStrips` 每次返回新对象字面量，未来给 `FollowupStrips` 加 `memo` 会因 props 恒变而失效 | 步 2 内就返回 `useMemo` 包裹的对象（即使当前无消费者），避免留下陷阱 |

---

## 6. 现有测试清单（步骤影响面对照）

**直接渲染 `ChatTab` 的测试：0 个** —— 全部走 hook 级 `renderHook`（`guest-journey.test.tsx` 复刻 chat-tab 的逐项注入）。这意味着**编排层无回归网**，步 2/3 的风险主要落在这个缺口上。

| 路径 | 覆盖对象 | 与本方案关系 |
| --- | --- | --- |
| `components/chat/hooks/__tests__/use-chat-actions.test.tsx` | `useChatActions` | 步 1 间接（setter 类型） |
| `components/chat/hooks/__tests__/use-chat-actions-abort-recovery.test.tsx` | abort 恢复 | 步 1 间接 |
| `components/chat/hooks/__tests__/use-chat-history.test.tsx` | loadHistory + `[ChatTab] loadHistory error` 日志断言 | 步 1 间接 |
| `components/chat/hooks/__tests__/use-challenge-fetch.test.tsx` | `[ChatTab] Failed to fetch active/expired challenge` | 步 1 间接 |
| `components/chat/hooks/__tests__/use-chat-persistence.test.tsx` | 保存/删除/分页 | 步 1 间接 |
| `components/chat/hooks/__tests__/guest-journey.test.tsx` | guest 端点分支（逐项注入复刻 chat-tab） | **步 2 需回归**（注入形状若变则同步） |
| `components/chat/hooks/__tests__/use-chat-lifecycle-cleanup.test.tsx` | 换用户清理 | 步 3 回归 |
| `components/chat/hooks/__tests__/use-chat-recap.test.tsx` | recap 派生 | **步 2 直接影响**（recap 迁入聚合 hook） |
| `components/chat/hooks/__tests__/use-chat-demo-mode.test.tsx` | demo 模式 | 步 1 间接 |
| `components/chat/hooks/__tests__/use-challenge-actions.test.ts` | 挑战操作 | 步 1 间接 |
| `components/chat/hooks/__tests__/use-mcp-notifications.test.tsx` | MCP 通知 | — |
| `components/chat/hooks/__tests__/use-chat-persistence.ssr.test.tsx` | SSR 安全 | 步 1 间接 |
| `components/chat/parts/__tests__/micro-challenge-followup.test.tsx` | 单 part | 步 2 不动 |
| `components/chat/parts/__tests__/cooldown-followup.test.tsx` | 单 part | 步 2 不动 |
| `components/chat/parts/__tests__/prepurchase-followup.test.tsx` | 单 part | 步 2 不动 |
| `components/chat/parts/__tests__/duplicate-reuse-followup.test.tsx` | 单 part | 步 2 不动 |
| `components/chat/parts/__tests__/emotion-guard-checkin.test.tsx` | 单 part | 步 2 不动 |
| `components/chat/parts/__tests__/post-purchase-review.test.tsx` | 单 part | 步 2 不动 |
| `components/chat/parts/__tests__/chat-recap.test.tsx` | 单 part | 步 2 需回归 |
| `components/chat/parts/__tests__/guard-moments.test.tsx` | Entry+Card（含 amount-free 红线） | **步 3 直接** |
| `components/chat/parts/__tests__/active-guards.test.tsx` | Entry+Panel+SOS 写入 | **步 3 直接** |
| `components/chat/parts/__tests__/weekly-review.test.tsx` | 周复盘 | 步 3 回归 |
| `components/chat/parts/__tests__/chat-messages-fallback.test.tsx` | 消息列表降级 | **步 4 直接** |
| `components/chat/parts/__tests__/green-first-render.test.tsx` | 首渲 | **步 4 直接** |
| `components/chat/parts/__tests__/green-intent-render.test.tsx` | 意图渲染 | **步 4 直接** |
| `components/chat/sections/__tests__/deposit-dialog-section.test.tsx` | 存入弹窗 | 步 4 回归（onDeposited 稳定化） |
| `lib/__tests__/architecture-guards.test.ts:251` | 文件行数上限 870 | 每步都要绿；建议收紧到 640 |
| `lib/__tests__/architecture-guards.test.ts:551` | timer 清理软守卫（扫 chat-tab） | 步 4 需确认配比不变 |
| `lib/__tests__/architecture-guards.test.ts:318` | hooks 不得 import `@/components/`（auth-provider 豁免） | 聚合 hook 若放 `chat/hooks/` 且 import `@/hooks/use-guard-moments` 等，**不违规**；若从 `@/hooks/` 反向 import `@/components/chat/parts/*` 则违规——**步 3 下沉 `getActivePendingPrepurchase` 时必须注意这条** |
| `e2e/*.spec.ts`（inventory / p0-1-buy-button / p0-a-gacha-crash / p2-11-fill-history / transparency / qa-smoke / settings） | Playwright | 步 2/4 后建议跑 `p0-1-buy-button` + `p2-11-fill-history`（聊天主路径） |

**验证命令**：`npm test`（vitest run，全量）/ `npm run lint`（eslint）/ `npx tsc --noEmit`（仓库历史提交记录中的既定三件套，见 commit 72b9d8e message）。

---

## 7. 建议执行顺序与批次划分

| 批次 | 内容 | 理由 |
| --- | --- | --- |
| **批 A** | 步 1（转发壳清理） | 零风险热身，先把类型改动做掉 |
| **批 B** | 步 2（回访条聚合 + 新测试） | 唯一有明确净行数收益且补测试缺口的一步 |
| **批 C** | 步 3（localStorage 快照 + 面板开关） | 中等收益，注意 R3/R4 |
| **批 D** | 步 4（memo 边界） | 独立批次，风险最高，收益在性能维度而非行数 |

**不建议做的事**：
1. 不要为了行数把 `useChatActions` / `useChatHistory` 再拆一层（R1 已经证明边际收益耗尽：747→705 只降 42 行）。
2. 不要动 `activeChallenge` 声明位置（R3）。
3. 不要在批 D 之前调整 `architecture-guards` 上限（避免中途红）。

---

## 附：侦察中修正的任务描述偏差

| 任务描述 | 实际情况 |
| --- | --- |
| 「61+ hooks」 | 组件内 **56 次 hook 调用**（32 原生 + 24 自定义），去重 23 个自定义 hook |
| 「守护时刻面板 4 个 state + 2 effect → useGuardMomentsPanel」 | 实际 **2 state + 1 effect**，且数据 hook 已在 `@/hooks/use-guard-moments.ts`，组件侧只剩开关 state |
| 「进行中守护相关同理」 | 同上，`useActiveGuards` 已独立；组件侧增量价值在 **localStorage 每次 render 读**（§2.2），不是拆 state |
| 「19 个组件共用 useAuth」 | 核实为 **19 个文件**（9 `.tsx` + 10 `.ts`），provider 侧 `useMemo` 已到位（`auth-provider.tsx:326`），chat-tab 内无需隔离 |

---

*侦察完成时间：2026-09-28 / 分支 `night-main` @ `72b9d8e` / 零代码改动*
