/**
 * Companion Background — Chat page full-page background effects
 *
 * 提取自 src/components/chat-tab.tsx (Round 99 拆分)
 * 显示: elephant bg image + ambient glow + neon accent + floating particles + vitality bar
 */

import type { BuddyHealth } from '@/types/buddy-state';

// Glow effects per health state
const BUDDY_GLOW: Record<BuddyHealth, { core: string; mid: string; outer: string; particle: string; ring: string }> = {
  thriving:  { core: 'bg-green-400',     mid: 'bg-green-500/40',  outer: 'bg-emerald-500/20',  particle: 'bg-green-300', ring: 'border-green-400/30' },
  healthy:   { core: 'bg-emerald-400',    mid: 'bg-emerald-500/35', outer: 'bg-green-500/15',   particle: 'bg-emerald-300', ring: 'border-emerald-400/25' },
  weak:      { core: 'bg-yellow-400',     mid: 'bg-yellow-500/30', outer: 'bg-amber-500/15',   particle: 'bg-yellow-300', ring: 'border-yellow-400/20' },
  critical:  { core: 'bg-red-400',        mid: 'bg-red-500/35',   outer: 'bg-rose-500/15',    particle: 'bg-red-300', ring: 'border-red-400/25' },
  dormant:   { core: 'bg-gray-600',       mid: 'bg-gray-700/20',  outer: 'bg-gray-800/10',    particle: 'bg-gray-500', ring: 'border-gray-600/15' },
};

export function CompanionBackground({ health, vitality }: { health: BuddyHealth; vitality: number }) {
  const glow = BUDDY_GLOW[health];
  const isDormant = health === 'dormant';

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Elephant background image */}
      { }
      <img
        src="/symy-chat-bg.png"
        alt=""
        className="absolute inset-0 w-full h-full object-cover opacity-50"
      />

      {/* Outer ambient glow — top */}
      <div className={`absolute -top-20 left-1/2 -translate-x-1/2 w-[400px] h-[300px] ${glow.outer} rounded-full blur-[100px] animate-pulse`} />

      {/* Mid glow — center behind messages */}
      <div className={`absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[250px] h-[250px] ${glow.mid} rounded-full blur-[80px]`} style={{ animation: 'pulse 4s ease-in-out infinite' }} />

      {/* Bottom glow */}
      <div className={`absolute -bottom-10 left-1/2 -translate-x-1/2 w-[300px] h-[200px] ${glow.outer} rounded-full blur-[80px] animate-pulse`} style={{ animationDelay: '2s' }} />

      {/* Neon accent orb */}
      {!isDormant && (
        <div className={`absolute top-1/4 right-0 w-[200px] h-[200px] rounded-full blur-[120px] opacity-30 ${
          health === 'thriving' ? 'bg-cyan-500/20' :
          health === 'healthy' ? 'bg-cyan-400/15' :
          health === 'weak' ? 'bg-amber-400/15' :
          'bg-rose-400/15'
        } animate-pulse`} style={{ animationDuration: '5s' }} />
      )}

      {/* Floating particles — scattered across the page */}
      {!isDormant && (
        <>
          <div className={`absolute w-2 h-2 ${glow.particle} rounded-full opacity-60 animate-float-1`} style={{ left: '10%', top: '15%' }} />
          <div className={`absolute w-1 h-1 ${glow.particle} rounded-full opacity-40 animate-float-2`} style={{ left: '80%', top: '10%' }} />
          <div className={`absolute w-1.5 h-1.5 ${glow.particle} rounded-full opacity-30 animate-float-3`} style={{ left: '65%', top: '30%' }} />
          <div className={`absolute w-1 h-1 ${glow.particle} rounded-full opacity-50 animate-float-1`} style={{ left: '25%', top: '50%', animationDelay: '1.5s' }} />
          <div className={`absolute w-2 h-2 ${glow.particle} rounded-full opacity-25 animate-float-2`} style={{ left: '88%', top: '45%', animationDelay: '0.8s' }} />
          <div className={`absolute w-1 h-1 ${glow.particle} rounded-full opacity-45 animate-float-3`} style={{ left: '50%', top: '65%', animationDelay: '2s' }} />
          <div className={`absolute w-1.5 h-1.5 ${glow.particle} rounded-full opacity-35 animate-float-1`} style={{ left: '15%', top: '75%', animationDelay: '3s' }} />
          <div className={`absolute w-1 h-1 ${glow.particle} rounded-full opacity-55 animate-float-2`} style={{ left: '70%', top: '80%', animationDelay: '1s' }} />
        </>
      )}

      {/* Vitality bar at very bottom of background */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-glass-fill">
        <div
          className={`h-full transition-all duration-1000 bg-gradient-to-r ${
            health === 'thriving' ? 'from-green-500 via-emerald-400 to-cyan-400' :
            health === 'healthy' ? 'from-emerald-500 via-green-400 to-cyan-400' :
            health === 'weak' ? 'from-yellow-500 via-amber-400 to-orange-400' :
            health === 'critical' ? 'from-red-500 via-rose-400 to-pink-400' :
            'from-gray-600 to-gray-700'
          }`}
          style={{ width: `${vitality}%` }}
        />
      </div>
    </div>
  );
}
