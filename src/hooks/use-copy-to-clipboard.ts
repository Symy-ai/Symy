/**
 * useCopyToClipboard — Copy text to clipboard with "copied" state feedback.
 *
 * 🔧 Round 106: Extracted from butterfly-tab.tsx to reduce file size (<880 lines guard).
 * Handles:
 * - navigator.clipboard API (primary)
 * - document.execCommand('copy') fallback (for non-secure contexts)
 * - Timer cleanup on unmount (prevent setState-after-unmount warning)
 * - 2s "copied" state reset
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export function useCopyToClipboard(resetMs = 2000) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(async (text: string) => {
    const showCopied = () => {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), resetMs);
    };

    try {
      await navigator.clipboard.writeText(text);
      showCopied();
    } catch {
      // Fallback: use a temporary textarea (for non-secure contexts)
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try { document.execCommand('copy'); showCopied(); } catch { /* silent */ }
      document.body.removeChild(textarea);
    }
  }, [resetMs]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { copied, copy };
}
