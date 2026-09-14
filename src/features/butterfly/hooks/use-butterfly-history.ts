/**
 * useButterflyHistory — 蝴蝶效应历史剧情记录 Hook (分页版)
 *
 * 职责：
 * - 分页拉取历史会话列表（completed + abandoned，排除 active）
 * - 管理加载/错误/刷新状态
 * - 删除单条历史剧情
 * - 选中某条进入详情回看
 *
 * 数据来源: GET /api/butterfly/sessions?page=1&pageSize=10
 * 删除: DELETE /api/butterfly/sessions/[id]
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { apiFetch, apiFetchVoid } from '@/lib/api-client';
import type { ButterflySession } from '../types';

const PAGE_SIZE = 10;

interface SessionsResponse {
  sessions: ButterflySession[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface UseButterflyHistoryReturn {
  /** 历史会话列表 (已加载的所有页) */
  sessions: ButterflySession[];
  /** 是否正在加载 (首次) */
  isLoading: boolean;
  /** 是否正在加载更多 (翻页) */
  isLoadingMore: boolean;
  /** 是否正在刷新 */
  isRefreshing: boolean;
  /** 错误信息 */
  error: string | null;
  /** 当前选中的详情会话 */
  selectedSession: ButterflySession | null;
  /** 总记录数 */
  total: number;
  /** 是否还有更多 */
  hasMore: boolean;
  /** 拉取历史列表 (首次) */
  fetchHistory: () => Promise<void>;
  /** 加载更多 (下一页) */
  loadMore: () => Promise<void>;
  /** 刷新（静默，显示 refreshing 状态） */
  refresh: () => Promise<void>;
  /** 选中某条会话查看详情 */
  selectSession: (session: ButterflySession | null) => void;
  /** 删除单条会话 */
  deleteSession: (sessionId: string) => Promise<boolean>;
  /** 🔧 PM-NEW-25 fix: 批量删除所有 incomplete 故事 */
  deleteAllIncomplete: () => Promise<{ deleted: number; failed: number; failedIds: string[] }>;
  /** 正在删除的会话 ID */
  deletingId: string | null;
}

export function useButterflyHistory(enabled: boolean): UseButterflyHistoryReturn {
  const [sessions, setSessions] = useState<ButterflySession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<ButterflySession | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const mountedRef = useRef(true);
  const isLoadingRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const isLoadingMoreRef = useRef(false);
  const currentPageRef = useRef(0); // 0 = 未加载, 1+ = 已加载到第 N 页

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchHistory = useCallback(async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<SessionsResponse>(`/api/butterfly/sessions?page=1&pageSize=${PAGE_SIZE}`);
      if (!mountedRef.current) return;
      setSessions(data.sessions || []);
      setTotal(data.total || 0);
      setHasMore(data.hasMore ?? false);
      currentPageRef.current = 1;
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (mountedRef.current) setIsLoading(false);
      isLoadingRef.current = false;
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMore) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const nextPage = currentPageRef.current + 1;
      const data = await apiFetch<SessionsResponse>(`/api/butterfly/sessions?page=${nextPage}&pageSize=${PAGE_SIZE}`);
      if (!mountedRef.current) return;
      // 🔧 ARCH fix (Round 44 R44-A-5 — loadMore 无 dedup, 新 session 在 page 1/2 之间插入 → 重复):
      //    旧代码: setSessions(prev => [...prev, ...(data.sessions || [])]) — 直接拼接。
      //    若用户在 page 1 加载后又创建了新 session (排到第一), page 2 会包含该 session → 列表重复。
      //    根因修复: 用 Map by id dedup, 保留已有顺序 + 追加新 session。
      setSessions(prev => {
        const existing = new Map(prev.map(s => [s.id, s]));
        const incoming = data.sessions || [];
        for (const s of incoming) {
          if (!existing.has(s.id)) existing.set(s.id, s);
        }
        return Array.from(existing.values());
      });
      setTotal(data.total || 0);
      setHasMore(data.hasMore ?? false);
      currentPageRef.current = nextPage;
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (mountedRef.current) setIsLoadingMore(false);
      isLoadingMoreRef.current = false;
    }
  }, [hasMore]);

  const refresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    try {
      const data = await apiFetch<SessionsResponse>(`/api/butterfly/sessions?page=1&pageSize=${PAGE_SIZE}`);
      if (!mountedRef.current) return;
      setSessions(data.sessions || []);
      setTotal(data.total || 0);
      setHasMore(data.hasMore ?? false);
      currentPageRef.current = 1;
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (mountedRef.current) setIsRefreshing(false);
      isRefreshingRef.current = false;
    }
  }, []);

  const selectSession = useCallback((session: ButterflySession | null) => {
    setSelectedSession(session);
  }, []);

  const deleteSession = useCallback(async (sessionId: string): Promise<boolean> => {
    setDeletingId(sessionId);
    try {
      await apiFetchVoid(`/api/butterfly/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      });
      if (!mountedRef.current) return false;
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      setTotal(prev => Math.max(0, prev - 1));
      setSelectedSession(prev => (prev?.id === sessionId ? null : prev));
      return true;
    } catch (err) {
      if (!mountedRef.current) return false;
      setError(err instanceof Error ? err.message : 'Delete failed');
      return false;
    } finally {
      if (mountedRef.current) setDeletingId(null);
    }
  }, []);

  // 🔧 PM-NEW-25 fix: 批量删除所有 incomplete 故事 (status !== 'completed')
  //    逐个调 delete API (无后端批量 API), 失败的累计到 failedIds 数组
  const deleteAllIncomplete = useCallback(async (): Promise<{ deleted: number; failed: number; failedIds: string[] }> => {
    // 先收集当前 sessions 中的 incomplete (可能因分页不全, 但已加载的部分先删)
    const incomplete = sessions.filter(s => s.status !== 'completed');
    let deleted = 0;
    let failed = 0;
    const failedIds: string[] = [];
    for (const s of incomplete) {
      setDeletingId(s.id);
      try {
        await apiFetchVoid(`/api/butterfly/sessions/${encodeURIComponent(s.id)}`, {
          method: 'DELETE',
        });
        if (!mountedRef.current) return { deleted, failed, failedIds };
        deleted++;
      } catch {
        if (!mountedRef.current) return { deleted, failed, failedIds };
        failed++;
        failedIds.push(s.id);
      }
    }
    if (mountedRef.current) setDeletingId(null);
    // 刷新列表 (服务端可能还有未加载的 incomplete)
    if (mountedRef.current) {
      setSessions(prev => prev.filter(s => s.status === 'completed' || failedIds.includes(s.id)));
      setTotal(prev => Math.max(0, prev - deleted));
      // 触发 refresh 拉取最新
      fetchHistory();
    }
    return { deleted, failed, failedIds };
  }, [sessions, fetchHistory]);

  useEffect(() => {
    if (enabled) {
       
      fetchHistory();
    }
  }, [enabled, fetchHistory]);

  return {
    sessions,
    isLoading,
    isLoadingMore,
    isRefreshing,
    error,
    selectedSession,
    total,
    hasMore,
    fetchHistory,
    loadMore,
    refresh,
    selectSession,
    deleteSession,
    deleteAllIncomplete,
    deletingId,
  };
}
