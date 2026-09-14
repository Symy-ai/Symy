'use client';

/**
 * TopicPlazaPopover — 折叠态话题广场入口 (batch55-a)
 *
 * 有历史消息后, 广场折叠为输入框旁的 💡 按钮; 点开弹出同一份 chips 的面板。
 * 选完一条 (或再点 💡) 即收起。面板 absolute 挂在按钮上方、z-20 — 低于
 * 全屏 overlay 的层级, 不与 ritual/设置弹层争遮挡。
 */

import { useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { TopicPlazaChips } from './topic-plaza-chips';

export interface TopicPlazaPopoverProps {
  onQuickReply: (text: string) => void;
}

export function TopicPlazaPopover({ onQuickReply }: TopicPlazaPopoverProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const openLabel = t('chat.topicPlaza.openLabel');

  return (
    <div className="relative flex-shrink-0" data-testid="topic-plaza-popover">
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-72 max-w-[80vw] rounded-xl border border-glass-border bg-glass-fill-strong backdrop-blur-sm p-3 shadow-lg z-20">
          <p className="text-[11px] text-text-tertiary mb-2 text-center">
            {t('chat.topicPlaza.title')}
          </p>
          <TopicPlazaChips
            onQuickReply={(text) => {
              setOpen(false);
              onQuickReply(text);
            }}
          />
        </div>
      )}
      <button
        type="button"
        aria-label={openLabel}
        aria-expanded={open}
        title={openLabel}
        onClick={() => setOpen((v) => !v)}
        className="w-10 h-10 rounded-xl border border-glass-border bg-glass-fill text-text-secondary flex items-center justify-center hover:text-text-primary hover:border-emerald-500/30 transition-all"
      >
        <Lightbulb className="w-4 h-4" />
      </button>
    </div>
  );
}
