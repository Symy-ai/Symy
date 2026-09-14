---
name: architecture-quick-reference
description: 架构规范速查表 — 写代码前 30 秒过一遍
type: reference
---

# 架构规范速查表 (2026-07-01)

> 详细规则见 `.memory/architecture-debt-policy.md`, 本文件是快速参考。

## 🚫 10 个禁止

1. ❌ 生成 `.docx` 文件
2. ❌ 重新开启 `ignoreBuildErrors: true`
3. ❌ 用 `as never` 绕过类型
4. ❌ 在 render 中读/写 ref → 用 `useMemo` 或 state
5. ❌ 在 effect 内同步 setState → 用 lazy initializer / `useMemo` / `eslint-disable` 标注
6. ❌ 父组件持有子组件 form state → 子组件 owns its form state
7. ❌ 新文件超 800 行 (.tsx) / 500 行 (.ts hook) / 400 行 (API route)
8. ❌ 仓库根目录放非白名单文件
9. ❌ 用 `mounted` state + `useEffect(() => setMounted(true), [])` → 用 `typeof window !== 'undefined'`
10. ❌ 用 `Promise.all` 发并发请求 → 用 `Promise.allSettled`

## ✅ 10 个必须

1. ✅ API 调用用 `apiFetch` / `apiFetchVoid` (来自 `@/lib/api-client`)
2. ✅ useEffect 内 fetch 用 `AbortController`
3. ✅ 子组件目录: `components/<parent>/<child>.tsx` (不散落在根)
4. ✅ Hooks 顺序: useState/useRef → useEffect → useCallback
5. ✅ Supabase 查询用 `.maybeSingle()` 而非 `.single()`
6. ✅ API 路由有 try/catch
7. ✅ 模块级 `let` 提供 `reset()` 函数
8. ✅ className 用 `cn()` 工具
9. ✅ 日期用 `date-fns`
10. ✅ 状态机用 XState v5 (不手写 phase + useEffect)

## 📏 文件行数上限

| 类型 | 上限 |
|---|---|
| React 组件 (.tsx) | 800 |
| Custom Hook (.ts) | 500 |
| API Route (.ts) | 400 |
| Lib 工具 (.ts) | 600 |

## 🔧 React 19 Compiler 兼容模式

```typescript
// ❌ 不要
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);

// ✅ 要
const isClient = typeof window !== 'undefined';
```

```typescript
// ❌ 不要
const ref = useRef(null);
if (!ref.current) ref.current = createClient();

// ✅ 要
const client = useMemo(() => createClient(), []);
```

```typescript
// ❌ 不要 (effect 内 setState)
useEffect(() => { setVisible(true); }, []);

// ✅ 要 (lazy initializer)
const [visible, setVisible] = useState(() => readFromUrl());

// ✅ 或 (派生 state)
const visible = useMemo(() => prop1 && prop2, [prop1, prop2]);

// ✅ 或 (合理 prop → state 同步, 标注)
useEffect(() => {
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setForm({ name: editingItem.name });
}, [editingItem]);
```

## 📦 子组件 owns form state

```typescript
// ❌ 父组件持有
function Parent() {
  const [name, setName] = useState('');
  return <Modal name={name} setName={setName} />;
}

// ✅ 子组件持有
function Parent() {
  return <Modal onSubmit={(name) => {...}} />;
}
function Modal({ onSubmit }) {
  const [name, setName] = useState('');
  // ...
}
```

## 🌐 API 调用模式

```typescript
import { apiFetch, apiFetchVoid, ApiError } from '@/lib/api-client';

// GET
const data = await apiFetch<{ items: Item[] }>('/api/items');

// POST
const result = await apiFetch<{ id: string }>('/api/items', {
  method: 'POST',
  body: { name: 'test' },
});

// DELETE (无返回)
await apiFetchVoid(`/api/items/${id}`, { method: 'DELETE' });

// 并发 (单个失败不阻塞)
const [a, b] = await Promise.allSettled([
  apiFetch('/api/a'),
  apiFetch('/api/b'),
]);
const aData = a.status === 'fulfilled' ? a.value : null;

// 处理 HTTP 状态码
try {
  await apiFetchVoid('/api/data', { method: 'PUT', body: payload });
} catch (err) {
  if (err instanceof ApiError && err.status === 409) {
    // 处理冲突
  }
}
```

## 📚 用已有库, 不造轮子

| 场景 | 库 |
|---|---|
| 日期格式化 | date-fns |
| className 合并 | cn() (clsx + tailwind-merge) |
| 状态机 | XState v5 |
| 虚拟列表 | react-virtuoso |
| IndexedDB | Dexie |
| API 调用 | apiFetch / apiFetchVoid |
| i18n | next-intl |
