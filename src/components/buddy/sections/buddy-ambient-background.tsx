'use client';

import type { BuddyState } from '@/types/buddy-state';

/**
 * Full-page ambient background — 依 buddy 健康状态变换的环境光
 * (原为 buddy-tab.tsx 内联 JSX — File Split Wave 1 纯搬运, 行为零变化)
 */
export function BuddyAmbientBackground({ health }: { health: BuddyState['health'] }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className={`absolute -top-10 left-1/2 -translate-x-1/2 w-[500px] h-[400px] ${
        health === 'thriving' ? 'bg-green-500/10' :
        health === 'healthy' ? 'bg-emerald-500/8' :
        health === 'weak' ? 'bg-yellow-500/8' :
        health === 'critical' ? 'bg-red-500/8' :
        'bg-gray-700/8'
      } rounded-full blur-[120px] animate-pulse`} />
      <div className={`absolute bottom-20 left-1/2 -translate-x-1/2 w-[300px] h-[200px] ${
        health === 'thriving' ? 'bg-cyan-500/8' :
        health === 'healthy' ? 'bg-cyan-400/6' :
        health === 'weak' ? 'bg-amber-500/6' :
        health === 'critical' ? 'bg-rose-500/6' :
        'bg-gray-800/6'
      } rounded-full blur-[80px] animate-pulse`} style={{ animationDelay: '2s' }} />
    </div>
  );
}
