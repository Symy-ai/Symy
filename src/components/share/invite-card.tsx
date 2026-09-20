'use client';

import type { Ref } from 'react';
import { Shield, TreeDeciduous } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

export interface InviteShareCardProps {
  refCode: string;
  completedCount: number;
  cardRef?: Ref<HTMLDivElement>;
}

export function InviteShareCard({ refCode, completedCount, cardRef }: InviteShareCardProps) {
  const { t } = useI18n();
  const inviteLink = `symy.ai/?ref=${refCode}`;
  const guardianRank = completedCount + 1;

  return (
    <div
      ref={cardRef}
      data-testid="invite-share-card"
      className="relative w-[375px] select-none overflow-hidden rounded-[28px]"
      style={{ height: 600, background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
    >
      <div
        className="absolute -top-28 left-1/2 h-[320px] w-[430px] -translate-x-1/2 rounded-full blur-[95px]"
        style={{ background: 'rgba(74, 222, 128, 0.18)' }}
      />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 375 600" aria-hidden="true">
        <path d="M0 90 C 80 68, 130 132, 220 96 C 290 68, 340 110, 375 88 L375 0 L0 0 Z" fill="#4ade80" opacity="0.06" />
        <path d="M0 520 C 80 546, 140 486, 225 520 C 295 548, 345 506, 375 526 L375 600 L0 600 Z" fill="#4ade80" opacity="0.07" />
      </svg>

      <div className="relative z-10 flex h-full flex-col p-7">
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-white/5 px-3 py-1 self-start">
          <Shield className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
          <span className="text-[11px] font-semibold tracking-wide text-emerald-200">
          {t('invite.covenantPill')}
          </span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            {t('invite.covenantTitle')}
          </p>
          <h2 className="mt-4 max-w-[300px] text-[32px] font-black leading-tight text-[#f0faf2]">
            {t('invite.covenantHeading')}
          </h2>

          <p className="mt-5 text-[15px] font-medium leading-relaxed text-[#b6cbbe]">
            {t('invite.covenantSubtitle', { guardianRank })}
          </p>

          <div className="mt-8 rounded-2xl border border-emerald-300/25 bg-black/20 px-5 py-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/75">
              {t('invite.covenantJoinLabel')}
            </p>
            <p className="mt-1 font-mono text-[15px] font-semibold text-emerald-200">{inviteLink}</p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 pt-4">
          <span className="flex items-center gap-1.5 text-sm font-bold tracking-wide text-white">
            <TreeDeciduous className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            {t('invite.covenantFooter')}
          </span>
          <span className="text-[11px] text-[#b6cbbe]">
            {t('share.interceptMedal.brandTagline', { defaultValue: 'Buy less. Live more.' })}
          </span>
        </div>
      </div>
    </div>
  );
}
