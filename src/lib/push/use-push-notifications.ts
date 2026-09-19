'use client';

/**
 * usePushNotifications — Web Push 通知订阅管理
 *
 * 🔧 2026-07-20: 营销报告 P2 #16 — 推送通知功能
 *
 * 功能:
 * 1. 注册 Service Worker
 * 2. 订阅/取消订阅推送通知
 * 3. 检查浏览器是否支持推送通知
 * 4. 检查用户是否已订阅
 *
 * 使用:
 * const { isSupported, isSubscribed, subscribe, unsubscribe } = usePushNotifications();
 */

import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/lib/logger';
import type { NormalizedPushPreferences } from '@/lib/push/preferences';

interface UsePushNotificationsReturn {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  error: string | null;
  /** 🔧 batch60-b: 可携带订阅偏好一起写入; 返回是否成功 (偏好面板据此切换锁定态) */
  subscribe: (preferences?: Partial<NormalizedPushPreferences>) => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
}

/**
 * 将 base64 字符串转为 Uint8Array (VAPID 公钥转换)
 * 浏览器 pushManager.subscribe 需要 applicationServerKey 为 Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 检查浏览器是否支持推送通知 + 是否已订阅
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);

    if (!supported) return;

    // 检查是否已订阅
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        setIsSubscribed(!!subscription);
      })
      .catch((err) => {
        logger.warn('[usePushNotifications] Failed to check subscription:', err);
      });
  }, []);

  // eslint-disable-next-line symy/no-async-callback-mutation -- subscribe is a one-shot user action (button click), rapid re-invocation is harmless (isLoading guard prevents double-click)
  const subscribe = useCallback(async (preferences?: Partial<NormalizedPushPreferences>): Promise<boolean> => {
    if (!isSupported) return false;

    setIsLoading(true);
    setError(null);

    try {
      // 0. 请求通知权限（浏览器要求用户明确授权）
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Notification permission denied. Please enable notifications in your browser settings.');
      }

      // 1. 注册 Service Worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // 2. 获取 VAPID 公钥
      const vapidResponse = await fetch('/api/push/vapid-public-key');
      if (!vapidResponse.ok) {
        throw new Error('Push notifications are not yet configured on this server.');
      }
      const { publicKey } = await vapidResponse.json();

      // 3. 订阅推送
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      });

      // 4. 发送订阅到服务器 (🔧 batch60-b: 偏好与订阅一起写入, 服务端合并存量不覆盖)
      const subscribeResponse = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          ...(preferences ? { preferences } : {}),
        }),
      });

      if (!subscribeResponse.ok) {
        let message = 'Failed to save subscription on server.';
        try {
          const errorBody = await subscribeResponse.json();
          if (subscribeResponse.status === 401) {
            message = 'Please sign in to enable push notifications.';
          } else if (subscribeResponse.status === 503) {
            // 503 = TABLE_NOT_FOUND: migration 121 未执行
            message = errorBody?.error || 'Push notifications are not yet configured on this server.';
          } else if (subscribeResponse.status === 500) {
            // 500 = DB 错误: 显示服务器返回的具体错误信息，方便诊断
            message = errorBody?.error || 'Push notifications are temporarily unavailable. Please try again later.';
          } else if (errorBody?.error) {
            message = errorBody.error;
          }
        } catch {
          // Response body wasn't JSON; same fallback tier as the empty-JSON branch.
          message = 'Push notifications are temporarily unavailable. Please try again later.';
        }
        throw new Error(message);
      }

      setIsSubscribed(true);
      logger.info('[usePushNotifications] ✅ Subscribed successfully');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      logger.error('[usePushNotifications] Subscribe failed:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  // eslint-disable-next-line symy/no-async-callback-mutation -- unsubscribe is a one-shot user action (button click), rapid re-invocation is harmless (isLoading guard prevents double-click)
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    setIsLoading(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        setIsSubscribed(false);
        return true;
      }

      // 1. 从浏览器取消订阅
      await subscription.unsubscribe();

      // 🔧 batch85-a: 浏览器推送已死, UI 必须反映真相 — 无论服务端结果如何都置 false
      setIsSubscribed(false);

      // 2. 通知服务器 — 失败不阻塞用户 (残留订阅由服务端 TTL 清理), 仅 warn
      try {
        const unsubscribeResponse = await fetch('/api/push/unsubscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            endpoint: subscription.endpoint,
          }),
        });

        if (!unsubscribeResponse.ok) {
          let message = 'Failed to remove subscription on server.';
          try {
            const errorBody = await unsubscribeResponse.json();
            if (unsubscribeResponse.status === 401) {
              message = 'Please sign in to manage push notifications.';
            } else if (unsubscribeResponse.status === 503) {
              message = errorBody?.error || 'Push notifications are not yet configured on this server.';
            } else if (unsubscribeResponse.status === 500) {
              message = errorBody?.error || 'Push notifications are temporarily unavailable. Please try again later.';
            } else if (errorBody?.error) {
              message = errorBody.error;
            }
          } catch {
            // Response body wasn't JSON; fall back to default message.
          }
          logger.warn('[usePushNotifications] Server unsubscribe failed:', message);
          setError(message);
          return false;
        }
      } catch (err) {
        logger.warn('[usePushNotifications] Server unsubscribe failed:', err);
        const message = err instanceof Error ? err.message : 'Failed to remove subscription on server.';
        setError(message);
        return false;
      }

      logger.info('[usePushNotifications] ✅ Unsubscribed successfully');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      logger.error('[usePushNotifications] Unsubscribe failed:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
  };
}
