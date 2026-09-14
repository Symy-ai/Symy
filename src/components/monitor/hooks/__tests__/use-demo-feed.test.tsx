// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDemoFeed } from '../use-demo-feed';

describe('useDemoFeed', () => {
  it('mixes guardian stories at the configured interval', () => {
    const { result } = renderHook(() => useDemoFeed());

    for (let index = 0; index < 40; index += 1) {
      act(() => { result.current.addDemoNotification(); });
    }

    const stories = result.current.notifications.filter((item) => item.type === 'guardian-story');
    expect(stories).toHaveLength(10);
  });
});
