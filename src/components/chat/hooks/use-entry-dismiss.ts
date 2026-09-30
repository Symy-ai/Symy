'use client';

/**
 * useEntryDismiss — chat 顶部固定入口条的「彻底关闭」状态 (2026-09-30, owner 需求)
 *
 * 需求: 「本周守护复盘 / 守护时刻 / 进行中守护 / 守护日记」4 张卡要能打开再关闭后
 * 彻底消失, 而不是永远常驻。但「彻底」限定在本会话内 — 刷新/明天回来入口还在
 * (入口是功能发现的主要途径, 跨会话隐藏等于功能蒸发)。
 *
 * 语义: dismissed = true → 入口条与卡片都不渲染, 直到 sessionStorage 清除
 * (关闭标签页/刷新) 或用户重开页面。同会话内无论怎么切 tab 都不再出现。
 *
 * 存储键: 每个入口一个 key (chat-dismiss:<id>), sessionStorage 而非
 * localStorage — 跨会话不残留, 新会话入口自然回归。
 */

import { useCallback, useState } from 'react';

const PREFIX = 'chat-dismiss:';

function readDismissed(id: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(PREFIX + id) === '1';
  } catch {
    // safe to ignore: sessionStorage 不可用(隐私模式等)时退化为会话内 state
    return false;
  }
}

export interface EntryDismissState {
  /** 入口条是否已被用户关闭 (true = 入口与卡片都不渲染) */
  dismissed: boolean;
  /** 关闭入口 (持久到 sessionStorage, 本会话不再出现) */
  dismiss: () => void;
}

export function useEntryDismiss(id: string): EntryDismissState {
  const [dismissed, setDismissed] = useState(() => readDismissed(id));

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(PREFIX + id, '1');
    } catch {
      // safe to ignore: 存储失败时仅内存态生效 (本组件实例生命周期内隐藏)
    }
  }, [id]);

  return { dismissed, dismiss };
}
