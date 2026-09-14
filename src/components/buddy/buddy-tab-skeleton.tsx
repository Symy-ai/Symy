/**
 * Buddy Tab Skeleton — Loading state placeholder
 *
 * 提取自 src/components/buddy-tab.tsx (Round 86 拆分)
 * 数据加载时显示骨架屏, 防止空白闪烁。
 */

export function BuddyTabSkeleton() {
  return (
    <div className="h-full px-4 py-6 space-y-6">
      {/* Hero 区 skeleton */}
      <div className="flex flex-col items-center pt-4 pb-2 space-y-3">
        <div className="w-32 h-32 rounded-full bg-glass-fill animate-pulse" />
        <div className="w-40 h-5 bg-glass-fill rounded animate-pulse" />
        <div className="w-56 h-3 bg-glass-fill rounded animate-pulse" />
        <div className="w-72 h-8 bg-glass-fill rounded-lg animate-pulse" />
      </div>
      {/* Quick Actions skeleton */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="h-16 bg-glass-fill rounded-xl animate-pulse" />
        <div className="h-16 bg-glass-fill rounded-xl animate-pulse" />
      </div>
      {/* Stats skeleton */}
      <div className="glass-card rounded-2xl p-4 space-y-3">
        <div className="w-32 h-4 bg-glass-fill rounded animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-20 bg-glass-fill rounded-xl animate-pulse" />
          <div className="h-20 bg-glass-fill rounded-xl animate-pulse" />
        </div>
        <div className="h-2 bg-glass-fill rounded-full animate-pulse" />
      </div>
      {/* Dream Funds skeleton */}
      <div className="space-y-2.5">
        <div className="w-24 h-4 bg-glass-fill rounded animate-pulse" />
        <div className="h-16 bg-glass-fill rounded-xl animate-pulse" />
        <div className="h-16 bg-glass-fill rounded-xl animate-pulse" />
      </div>
      {/* Health Log skeleton */}
      <div className="space-y-2.5">
        <div className="w-20 h-4 bg-glass-fill rounded animate-pulse" />
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-glass-fill animate-pulse">
            <div className="w-7 h-7 rounded-full bg-glass-fill-strong" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-glass-fill-strong rounded w-3/4" />
              <div className="h-2 bg-glass-fill-strong rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
