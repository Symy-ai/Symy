/**
 * useTypewriter — typewriter effect hook for StoryViewer.
 *
 * 🔧 Round 80 F4: extracted from story-viewer.tsx (was 982 lines, target <800).
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export function useTypewriter(text: string, speed: number = 35, enabled: boolean = true) {
  const [state, setState] = useState<{ displayed: string; complete: boolean }>(() => ({
    displayed: enabled ? '' : text,
    complete: !enabled,
  }));

  const indexRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      const raf = requestAnimationFrame(() => {
        setState({ displayed: text, complete: true });
      });
      return () => cancelAnimationFrame(raf);
    }

    indexRef.current = 0;
    const resetRaf = requestAnimationFrame(() => {
      setState({ displayed: '', complete: false });
    });

    const interval = setInterval(() => {
      indexRef.current += 1;
      if (indexRef.current >= text.length) {
        setState({ displayed: text, complete: true });
        clearInterval(interval);
      } else {
        setState({ displayed: text.slice(0, indexRef.current), complete: false });
      }
    }, speed);

    return () => {
      cancelAnimationFrame(resetRaf);
      clearInterval(interval);
    };
  }, [text, speed, enabled]);

  const skipToEnd = useCallback(() => {
    setState({ displayed: text, complete: true });
  }, [text]);

  return { displayedText: state.displayed, isComplete: state.complete, skipToEnd };
}
