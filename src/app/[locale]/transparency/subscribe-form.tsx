/**
 * TransparencySubscribeForm — 周报订阅区块 (batch84-c)
 *
 * BP 0918 p11/p20: 透明度报告的内容引擎闭环 = 每周报告 → 订阅 → 下周自动回访。
 * 邮箱 + 订阅按钮, 成功后 1.5s 胶囊轻提示 (owner UX 令) 后淡回表单。
 *
 * 降级契约: route 503 (订阅表未建) → 显示「订阅即将上线」, 不渲染报错。
 * 防枚举: 重复邮箱在 route 层静默成功, 本组件对 409/201 一视同仁显示成功。
 *
 * 键面契约: 不做兜底文案 — 缺键宁可暴露原始 key, 也绝不悄悄回退默认文案。
 */

'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

export function TransparencySubscribeForm() {
  const t = useTranslations();
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  const handleSubscribe = async () => {
    if (pending) return;
    setPending(true);
    setSubscribed(false);
    setFailed(false);
    try {
      const response = await fetch('/api/transparency/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, locale }),
      });
      if (response.ok) {
        setSubscribed(true);
        setEmail('');
        // 胶囊只停留 1.5s, 之后回到可再次订阅的表单态
        window.setTimeout(() => setSubscribed(false), 1500);
      } else if (response.status === 503) {
        setUnavailable(true);
      } else {
        setFailed(true);
      }
    } catch {
      // safe to ignore: 网络失败走 failed 分支, 输入保留不打断用户
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5" data-testid="transparency-subscribe">
      <p className="text-sm font-semibold text-text-primary" data-testid="transparency-subscribe-title">
        {t('transparency.subscribeTitle')}
      </p>
      <p className="mt-1 text-xs text-text-tertiary">{t('transparency.subscribeNote')}</p>

      {unavailable ? (
        <p
          className="mt-3 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-400"
          data-testid="transparency-subscribe-unavailable"
        >
          {t('transparency.subscribeUnavailable')}
        </p>
      ) : (
        <>
          <div className="mt-3 flex gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('transparency.subscribePlaceholder')}
              data-testid="transparency-subscribe-input"
              className="min-w-0 flex-1 rounded-full border border-emerald-500/30 bg-surface-outer px-4 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={pending || email.length === 0}
              data-testid="transparency-subscribe-button"
              className="shrink-0 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
            >
              {t('transparency.subscribeButton')}
            </button>
          </div>
          {subscribed && (
            <p
              className="mt-3 inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
              data-testid="transparency-subscribe-success"
            >
              {t('transparency.subscribeSuccess')}
            </p>
          )}
          {failed && (
            <p className="mt-3 text-xs text-red-600 dark:text-red-400" data-testid="transparency-subscribe-error">
              {t('transparency.subscribeError')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
