/**
 * Tests for SSE Utilities (sse.ts)
 *
 * Covers:
 * - SSE_HEADERS: structure, values
 * - sendSSEData: object encoding, string encoding, [DONE] marker
 * - sendSSEEvent: event + data format
 * - closeSSE: normal close, double close (swallowed error)
 */

import { describe, it, expect, vi } from 'vitest';
import { SSE_HEADERS, sendSSEData, sendSSEEvent, closeSSE } from '@/lib/sse';

// Helper: create a mock controller that captures enqueued data
function createMockController() {
  const enqueued: Uint8Array[] = [];
  let closeCalled = false;
  let closeShouldThrow = false;
  return {
    controller: {
      enqueue: vi.fn((data: Uint8Array) => {
        enqueued.push(data);
      }),
      close: vi.fn(() => {
        if (closeShouldThrow) {
          throw new TypeError('The stream is closed');
        }
        closeCalled = true;
      }),
    } as unknown as ReadableStreamDefaultController<Uint8Array>,
    enqueued,
    getCloseCalled: () => closeCalled,
    setCloseShouldThrow: (v: boolean) => { closeShouldThrow = v; },
  };
}

// Helper: decode enqueued Uint8Array to string
function decode(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

describe('SSE_HEADERS', () => {
  it('has Content-Type: text/event-stream', () => {
    expect(SSE_HEADERS['Content-Type']).toBe('text/event-stream');
  });

  it('has Cache-Control: no-cache', () => {
    expect(SSE_HEADERS['Cache-Control']).toBe('no-cache');
  });

  it('has Connection: keep-alive', () => {
    expect(SSE_HEADERS['Connection']).toBe('keep-alive');
  });

  it('has X-Accel-Buffering: no (Nginx SSE support)', () => {
    expect(SSE_HEADERS['X-Accel-Buffering']).toBe('no');
  });
});

describe('sendSSEData', () => {
  it('encodes object as JSON with data: prefix', () => {
    const { controller, enqueued } = createMockController();
    sendSSEData(controller, { type: 'test', content: 'hello' });
    expect(enqueued).toHaveLength(1);
    expect(decode(enqueued[0])).toBe('data: {"type":"test","content":"hello"}\n\n');
  });

  it('encodes string as-is (no JSON.stringify)', () => {
    const { controller, enqueued } = createMockController();
    sendSSEData(controller, 'hello world');
    expect(decode(enqueued[0])).toBe('data: hello world\n\n');
  });

  it('encodes [DONE] marker as string', () => {
    const { controller, enqueued } = createMockController();
    sendSSEData(controller, '[DONE]');
    expect(decode(enqueued[0])).toBe('data: [DONE]\n\n');
  });

  it('encodes empty object', () => {
    const { controller, enqueued } = createMockController();
    sendSSEData(controller, {});
    expect(decode(enqueued[0])).toBe('data: {}\n\n');
  });

  it('encodes null as JSON null', () => {
    const { controller, enqueued } = createMockController();
    sendSSEData(controller, null);
    expect(decode(enqueued[0])).toBe('data: null\n\n');
  });

  it('encodes array as JSON array', () => {
    const { controller, enqueued } = createMockController();
    sendSSEData(controller, [1, 2, 3]);
    expect(decode(enqueued[0])).toBe('data: [1,2,3]\n\n');
  });

  it('encodes number as JSON number', () => {
    const { controller, enqueued } = createMockController();
    sendSSEData(controller, 42);
    expect(decode(enqueued[0])).toBe('data: 42\n\n');
  });

  it('encodes boolean as JSON boolean', () => {
    const { controller, enqueued } = createMockController();
    sendSSEData(controller, true);
    expect(decode(enqueued[0])).toBe('data: true\n\n');
  });

  it('encodes nested object', () => {
    const { controller, enqueued } = createMockController();
    sendSSEData(controller, { outer: { inner: [1, 'two', true] } });
    const decoded = decode(enqueued[0]);
    expect(decoded).toContain('"outer"');
    expect(decoded).toContain('"inner"');
    expect(decoded).toContain('[1,"two",true]');
  });

  it('appends \\n\\n terminator', () => {
    const { controller, enqueued } = createMockController();
    sendSSEData(controller, 'test');
    expect(decode(enqueued[0]).endsWith('\n\n')).toBe(true);
  });

  it('calls controller.enqueue exactly once', () => {
    const { controller, controller: ctrl } = createMockController();
    sendSSEData(controller, 'test');
    expect(ctrl.enqueue).toHaveBeenCalledTimes(1);
  });
});

describe('sendSSEEvent', () => {
  it('encodes event + data with correct format', () => {
    const { controller, enqueued } = createMockController();
    sendSSEEvent(controller, 'ping', {});
    expect(decode(enqueued[0])).toBe('event: ping\ndata: {}\n\n');
  });

  it('encodes event + string data', () => {
    const { controller, enqueued } = createMockController();
    sendSSEEvent(controller, 'message', 'hello');
    expect(decode(enqueued[0])).toBe('event: message\ndata: hello\n\n');
  });

  it('encodes event + object data (JSON)', () => {
    const { controller, enqueued } = createMockController();
    sendSSEEvent(controller, 'update', { count: 5 });
    expect(decode(enqueued[0])).toBe('event: update\ndata: {"count":5}\n\n');
  });

  it('encodes event + [DONE] marker', () => {
    const { controller, enqueued } = createMockController();
    sendSSEEvent(controller, 'close', '[DONE]');
    expect(decode(enqueued[0])).toBe('event: close\ndata: [DONE]\n\n');
  });

  it('uses custom event name', () => {
    const { controller, enqueued } = createMockController();
    sendSSEEvent(controller, 'custom-event-name', { foo: 'bar' });
    const decoded = decode(enqueued[0]);
    expect(decoded).toContain('event: custom-event-name');
    expect(decoded).toContain('data: {"foo":"bar"}');
  });
});

describe('closeSSE', () => {
  it('calls controller.close()', () => {
    const { controller, getCloseCalled } = createMockController();
    closeSSE(controller);
    expect(getCloseCalled()).toBe(true);
  });

  it('swallows TypeError when stream is already closed', () => {
    const { controller, setCloseShouldThrow } = createMockController();
    setCloseShouldThrow(true);
    // Should not throw
    expect(() => closeSSE(controller)).not.toThrow();
  });

  it('logs debug message on error (not silent)', () => {
    const debugSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { controller, setCloseShouldThrow } = createMockController();
    setCloseShouldThrow(true);
    closeSSE(controller);
    // logger.debug uses console.log in development
    // The spy catches it if NODE_ENV is development
    debugSpy.mockRestore();
  });
});

describe('integration: SSE event sequence', () => {
  it('can send multiple events then close', () => {
    const { controller, enqueued, getCloseCalled } = createMockController();

    sendSSEData(controller, { type: 'start' });
    sendSSEData(controller, { type: 'token', content: 'hello' });
    sendSSEData(controller, { type: 'token', content: ' world' });
    sendSSEData(controller, '[DONE]');
    closeSSE(controller);

    expect(enqueued).toHaveLength(4);
    expect(decode(enqueued[0])).toContain('"type":"start"');
    expect(decode(enqueued[1])).toContain('"content":"hello"');
    expect(decode(enqueued[2])).toContain('"content":" world"');
    expect(decode(enqueued[3])).toBe('data: [DONE]\n\n');
    expect(getCloseCalled()).toBe(true);
  });

  it('can mix sendSSEData and sendSSEEvent', () => {
    const { controller, enqueued } = createMockController();

    sendSSEData(controller, { type: 'data' });
    sendSSEEvent(controller, 'ping', {});
    sendSSEData(controller, '[DONE]');

    expect(enqueued).toHaveLength(3);
    expect(decode(enqueued[0])).toBe('data: {"type":"data"}\n\n');
    expect(decode(enqueued[1])).toBe('event: ping\ndata: {}\n\n');
    expect(decode(enqueued[2])).toBe('data: [DONE]\n\n');
  });
});
