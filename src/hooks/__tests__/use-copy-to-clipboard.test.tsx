// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useCopyToClipboard } from '../../hooks/use-copy-to-clipboard';

describe('useCopyToClipboard', () => {
  let clipboardWriteText: ReturnType<typeof vi.fn>;
  let execCommand: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    clipboardWriteText = vi.fn();
    execCommand = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText: clipboardWriteText } });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      writable: true,
      value: execCommand,
    });
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(document, 'execCommand');
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('copies and turns copied on through the clipboard API', async () => {
    clipboardWriteText.mockResolvedValue(undefined);
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => { await result.current.copy('primary'); });
    expect(clipboardWriteText).toHaveBeenCalledWith('primary');
    expect(result.current.copied).toBe(true);
  });

  it('resets copied after the configured delay', async () => {
    clipboardWriteText.mockResolvedValue(undefined);
    const { result } = renderHook(() => useCopyToClipboard(2000));
    await act(async () => { await result.current.copy('reset'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1999); });
    expect(result.current.copied).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current.copied).toBe(false);
  });

  it('falls back to execCommand when clipboard rejects', async () => {
    clipboardWriteText.mockRejectedValue(new Error('insecure'));
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => { await result.current.copy('fallback'); });
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(result.current.copied).toBe(true);
  });

  it('stays uncopied when both clipboard and fallback fail', async () => {
    clipboardWriteText.mockRejectedValue(new Error('insecure'));
    execCommand.mockImplementation(() => {
      throw new Error('denied');
    });
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => { await result.current.copy('denied'); });
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(result.current.copied).toBe(false);
  });

  it('uses fallback when navigator.clipboard is unsupported', async () => {
    vi.stubGlobal('navigator', {});
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => { await result.current.copy('legacy'); });
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(result.current.copied).toBe(true);
  });

  it('clears pending reset timers on unmount without updating state', async () => {
    clipboardWriteText.mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useCopyToClipboard());
    await act(async () => { await result.current.copy('cleanup'); });
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  });
});
