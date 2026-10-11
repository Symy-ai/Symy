import { describe, expect, it } from 'vitest';
import { scrubPii, scrubSentryEvent } from '../sentry-scrub';

describe('scrubPii', () => {
  it('清洗邮箱 → [email]', () => {
    expect(scrubPii('user foo@bar.com not found')).toBe('user [email] not found');
    expect(scrubPii('a.b+c@d-e.f.gh')).toBe('[email]');
  });

  it('清洗手机号 → [phone]（不误杀时间戳/年份）', () => {
    expect(scrubPii('call 13812345678 now')).toBe('call [phone] now');
    expect(scrubPii('tel: 555-123-4567')).toBe('tel: [phone]');
    // 年份/短数字不清洗
    expect(scrubPii('in 2026 we trust')).toBe('in 2026 we trust');
  });

  it('无 PII 文本原样返回', () => {
    expect(scrubPii('Supabase query failed: PGRST116')).toBe('Supabase query failed: PGRST116');
  });
});

describe('scrubSentryEvent (beforeSend)', () => {
  it('清洗 message', () => {
    const ev = { message: 'login failed for alice@example.com' };
    const out = scrubSentryEvent(ev);
    expect(out?.message).toBe('login failed for [email]');
  });

  it('清洗 exception.values (value+type)', () => {
    const ev = {
      exception: {
        values: [{ value: 'error for bob@test.io', type: 'ApiError 13800001111' }],
      },
    };
    const out = scrubSentryEvent(ev);
    expect(out?.exception?.values?.[0].value).toBe('error for [email]');
    expect(out?.exception?.values?.[0].type).toBe('ApiError [phone]');
  });

  it('递归清洗 extra（嵌套对象+数组）', () => {
    const ev = {
      extra: {
        user: 'carol@example.com',
        meta: { contact: ['13812345678', { email: 'd@e.fr' }] },
        count: 42,
      },
    };
    const out = scrubSentryEvent(ev);
    const e = out?.extra as Record<string, unknown>;
    expect(e.user).toBe('[email]');
    const meta = e.meta as { contact: unknown[] };
    expect(meta.contact[0]).toBe('[phone]');
    expect((meta.contact[1] as { email: string }).email).toBe('[email]');
    expect(e.count).toBe(42);
  });

  it('tags 只清洗字符串值（数字/布尔保留）', () => {
    const ev = { tags: { email: 'e@f.gg', retries: 3, ok: true } };
    const out = scrubSentryEvent(ev);
    expect(out?.tags?.email).toBe('[email]');
    expect(out?.tags?.retries).toBe(3);
    expect(out?.tags?.ok).toBe(true);
  });

  it('从不丢弃事件（始终返回 event 非 null）', () => {
    expect(scrubSentryEvent({ message: '' })).not.toBeNull();
    expect(scrubSentryEvent({})).not.toBeNull();
  });
});
