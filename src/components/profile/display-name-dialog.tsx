'use client';

/**
 * DisplayNameDialog — Display name edit dialog (P2-3 fix)
 *
 * Extracted from profile-tab.tsx to keep it under 800 lines.
 * Portal-based modal with input, validation, and save/cancel buttons.
 */

import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';

interface DisplayNameDialogProps {
  open: boolean;
  initialName: string;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

export function DisplayNameDialog({ open, initialName, onClose, onSaved, onError }: DisplayNameDialogProps) {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Sync input when dialog opens
  useEffect(() => {
    if (open) {
      setInput(initialName);
    }
  }, [open, initialName]);

  const handleSave = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await apiFetch<{ success: boolean }>('/api/user/display-name', {
        method: 'POST',
        body: { displayName: trimmed },
      });
      logger.info('[DisplayNameDialog] saved:', trimmed);
      onSaved();
    } catch {
      onError(t('profile.hourlyRateSaveFailed', { defaultValue: 'Failed to save — please try again' }));
    } finally {
      setSaving(false);
    }
  }, [input, saving, t, onSaved, onError]);

  if (!open) return null;

  // 🔧 P1-2.1 fix (2026-07-21): 可访问性 — 添加 role=dialog, aria-modal, aria-labelledby
  const dialogTitleId = 'display-name-dialog-title';

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={dialogTitleId}
    >
      <div
        className="relative w-full max-w-sm bg-surface-2 border border-glass-border rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 rounded-t-2xl" />
        <h3 id={dialogTitleId} className="text-lg font-bold text-text-primary text-center mb-2 gradient-text">
          {t('profile.displayNameDialogTitle')}
        </h3>
        <p className="text-xs text-text-secondary text-center mb-4">
          {t('profile.displayNameDialogDesc')}
        </p>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input.trim()) handleSave();
            if (e.key === 'Escape') onClose();
          }}
          placeholder={t('profile.displayNamePlaceholder')}
          maxLength={30}
          autoFocus
          className="w-full px-4 py-3 rounded-xl bg-surface-1 border border-glass-border text-text-primary text-sm placeholder:text-text-tertiary focus:outline-none focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20 transition-all"
          aria-label={t('profile.displayNameDialogTitle')}
        />
        <div className="flex items-center justify-between mt-1.5 px-1">
          <span className="text-[10px] text-text-tertiary">{input.length}/30</span>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-glass-fill text-text-secondary text-sm font-medium hover:bg-glass-fill-strong transition-colors"
          >
            {t('profile.displayNameCancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!input.trim() || saving}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-sm font-medium hover:from-cyan-400 hover:to-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ...
              </>
            ) : t('profile.displayNameSave')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * DisplayNamePrompt — Banner card for existing users who haven't set a custom name.
 * Shown on the Me page when user's display name is still the email prefix.
 */
export function DisplayNamePrompt({ onSet }: { onSet: () => void }) {
  const { t } = useI18n();
  return (
    <div className="glass-card rounded-2xl p-4 border border-cyan-500/30 bg-cyan-500/5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
          <span className="text-base">👤</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">{t('profile.setDisplayNamePrompt')}</p>
          <p className="text-xs text-text-tertiary mt-0.5">{t('profile.setDisplayNamePromptDesc')}</p>
          <button
            onClick={onSet}
            className="mt-2 px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs font-medium hover:bg-cyan-500/30 transition-colors"
          >
            {t('profile.setDisplayNameBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
