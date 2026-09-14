/**
 * Web Push 配置 — VAPID 密钥 + web-push 库初始化
 *
 * 🔧 2026-07-20: 营销报告 P2 #16 — 推送通知功能
 *
 * VAPID 密钥从环境变量读取:
 * - VAPID_PUBLIC_KEY
 * - VAPID_PRIVATE_KEY
 * - VAPID_SUBJECT (mailto: 或 https://)
 */

import 'server-only';
import webpush from 'web-push';
import { logger } from '@/lib/logger';

let isConfigured = false;

/**
 * 初始化 web-push 库 (设置 VAPID details)
 * 幂等: 多次调用安全
 */
export function configureWebPush(): void {
  if (isConfigured) return;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:hcl.mygtt@gmail.com';

  if (!publicKey || !privateKey) {
    logger.warn('[WebPush] VAPID keys not configured. Push notifications disabled.');
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  isConfigured = true;
  logger.info('[WebPush] VAPID configured successfully');
}

/**
 * 检查 Web Push 是否已配置
 */
export function isWebPushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/**
 * 获取 VAPID 公钥 (前端订阅时需要)
 */
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/**
 * 发送推送通知
 *
 * @param subscription - 用户的推送订阅信息
 * @param payload - 通知内容 (JSON string)
 * @returns Promise<void> - 发送失败会 throw
 */
export async function sendPushNotification(
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  },
  payload: string,
): Promise<void> {
  configureWebPush();

  if (!isConfigured) {
    throw new Error('Web Push not configured');
  }

  await webpush.sendNotification(subscription, payload);
}

/**
 * web-push 库的 PushSubscription 类型 (与浏览器 PushSubscription 对齐)
 */
export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}
