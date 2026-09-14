'use client';

import React from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * SettingToggle — reusable toggle switch for profile settings
 * Extracted from profile-tab.tsx (2026-07-15) to reduce file size below 800 lines
 */
export function SettingToggle({
  icon,
  label,
  description,
  enabled,
  onToggle,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl transition-colors cursor-pointer ${disabled ? 'opacity-70 cursor-not-allowed' : 'hover:bg-glass-hover'}`}
      onClick={disabled ? undefined : onToggle}
    >
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="text-xs text-text-tertiary">{description}</p>
      </div>
      <button
        onClick={disabled ? undefined : (e) => { e.stopPropagation(); onToggle(); }}
        disabled={disabled}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
          enabled ? 'bg-gradient-to-r from-cyan-500 to-purple-500' : 'bg-glass-fill-strong'
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

/**
 * SettingLink — reusable link row for profile settings
 * Extracted from profile-tab.tsx (2026-07-15) to reduce file size below 800 lines
 */
export function SettingLink({
  icon,
  label,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-glass-hover transition-colors cursor-pointer" onClick={onClick}>
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="text-xs text-text-tertiary">{description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-icon-muted" />
    </div>
  );
}
