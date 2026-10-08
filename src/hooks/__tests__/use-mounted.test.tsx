// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { renderHook } from '@testing-library/react';
import { useMounted } from '../../hooks/use-mounted';

function Probe() {
  return <span data-mounted={useMounted() ? 'yes' : 'no'} />;
}

describe('useMounted', () => {
  it('server render reports not mounted', () => {
    expect(renderToString(<Probe />)).toContain('data-mounted="no"');
  });

  it('client render reports mounted', () => {
    const { result } = renderHook(() => useMounted());
    expect(result.current).toBe(true);
  });

  it('remains mounted across re-renders', () => {
    const { result, rerender } = renderHook(() => useMounted());
    rerender();
    expect(result.current).toBe(true);
  });
});
