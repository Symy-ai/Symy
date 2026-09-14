// Simple toast store using useSyncExternalStore.
// Allows deep child components to fire toasts without prop-drilling.

type ToastType = 'success' | 'info' | 'error';
interface ToastData { message: string; type: ToastType; }

let listeners: (() => void)[] = [];
let currentToast: ToastData | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(message: string, type: ToastType = 'info', durationMs = 4000) {
  currentToast = { message, type };
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    currentToast = null;
    clearTimer = null;
    listeners.forEach((l) => l());
  }, durationMs);
  listeners.forEach((l) => l());
}

export function subscribeToast(listener: () => void) {
  listeners.push(listener);
  return () => { listeners = listeners.filter((l) => l !== listener); };
}

export function getToast() { return currentToast; }
