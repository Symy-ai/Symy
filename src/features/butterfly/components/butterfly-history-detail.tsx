/**
 * ButterflyHistoryDetail — 历史剧情详情回看视图
 *
 * 以 Galgame 风格回放一段已结束的剧情:
 * - 顶部封面: 结局基调 + 蝴蝶效应总结
 * - 逐场景展示: 每个章节的每个场景（图片 + 台词）
 * - 分岔路口标记: 章节间展示用户的选择
 * - 底部: 原始决策回顾 + 操作按钮
 *
 * 纯只读, 不调用任何生成 API, 数据全部来自已持久化的 session。
 */

'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useI18n } from '@/i18n/provider';
import type { ButterflySession } from '../types';
import { splitScenes } from '@/features/butterfly/hooks/player';
import { logger } from '@/lib/logger';
import { formatDate } from '@/lib/utils';
import { StatBox, DetailHeader } from './tab/history-detail-helpers';
// 🔧 ARCH fix Round 73 (Finding 5.1): TONE_* imported from single source of truth
// (previously defined 5 duplicate copies locally — divergent drift risk).
import {
  TONE_EMOJI,
  TONE_ACCENT_DARK,
  TONE_ACCENT_LIGHT,
  TONE_BORDER_DARK,
  TONE_BORDER_LIGHT,
} from './tab/constants';
// 🔧 ARCH fix (2026-07-21): Extracted helper functions to lib/history-helpers.ts
//    (reduces component file size, enables independent testing)
import {
  extractScenes,
  getChoiceForChapter,
  getOptionLabel,
} from '../lib/history-helpers';

// ============================================================
// 场景分割 — 使用 player/helpers.ts 的 canonical 实现（C2 重构后统一出口）
// ============================================================
// 🔧 ARCH fix (2026-07-21): extractScenes, getChoiceForChapter, getOptionLabel,
//    and HistoryScene interface moved to lib/history-helpers.ts for independent testing.

// ============================================================
// Props
// ============================================================

interface ButterflyHistoryDetailProps {
  session: ButterflySession;
  isLight: boolean;
  onBack: () => void;
  onStartNew: () => void;
}

// ============================================================
// 组件
// ============================================================

export function ButterflyHistoryDetail({
  session,
  isLight,
  onBack,
  onStartNew,
}: ButterflyHistoryDetailProps) {
  const { t, locale } = useI18n();
  const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(false);
  const [showChapterNav, setShowChapterNav] = useState(false);
  const [activeChapter, setActiveChapter] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scenes = useMemo(() => extractScenes(session.chapters), [session.chapters]);

  // 章节列表（用于导航）
  const chapterList = useMemo(() => {
    return session.chapters.map(ch => ({
      index: ch.index,
      title: ch.title,
      tone: ch.tone,
      timeSpan: ch.timeSpan,
      sceneCount: splitScenes(ch.content).length,
    }));
  }, [session.chapters]);

  // 滚动监听：检测当前可见章节
  // 🔧 ARCH fix (Round 18 AUDIT-4 MEDIUM-6): scenes 变化时未重置 activeChapter
  //    → 旧 scenes 的 chapter index 可能不在新 scenes 中 → stale 高亮
  //    根因修复: scenes 变化时先重置 activeChapter=null, 再 handleScroll 重新计算
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // 🔧 MEDIUM-6: 重置 activeChapter, 防止 stale chapter index 高亮
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on scenes change (prevents stale chapter highlight)
    setActiveChapter(null);

    const handleScroll = () => {
      const sceneElements = container.querySelectorAll('[data-chapter-index]');
      const containerTop = container.scrollTop + 100;
      let current: number | null = null;
      for (const el of sceneElements) {
        const top = (el as HTMLElement).offsetTop;
        if (top <= containerTop) {
          current = Number((el as HTMLElement).dataset.chapterIndex);
        } else {
          break;
        }
      }
      setActiveChapter(current);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    // 🔧 MEDIUM-6: 用 requestAnimationFrame 确保 DOM 已渲染后再计算
    // 🔧 ARCH fix (Round 21 ADV-REVIEW MEDIUM-1): 保存 rAF handle, cleanup 时 cancelAnimationFrame
    //    防止卸载后 setState (React warning) + 1-frame stale-highlight race
    const rafId = requestAnimationFrame(handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(rafId);
    };
  }, [scenes]);

  // 跳转到指定章节
  const scrollToChapter = useCallback((chapterIndex: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const target = container.querySelector(`[data-chapter-index="${chapterIndex}"]`);
    if (target) {
      const offset = (target as HTMLElement).offsetTop - 50;
      container.scrollTo({ top: offset, behavior: 'smooth' });
    }
    setShowChapterNav(false);
  }, []);

  const finalTone = session.finalTone || (session.chapters.length > 0 ? session.chapters[session.chapters.length - 1].tone : 'neutral');
  const isCompleted = session.status === 'completed';
  const isBought = session.decisionType === 'bought';

  const accent = isLight ? (TONE_ACCENT_LIGHT[finalTone] || '#6b7280') : (TONE_ACCENT_DARK[finalTone] || '#d1d5db');
  const borderColor = isLight ? (TONE_BORDER_LIGHT[finalTone] || 'rgba(107,114,128,0.25)') : (TONE_BORDER_DARK[finalTone] || 'rgba(156,163,175,0.25)');

  // 渐变/背景色
  const bottomGradient = isLight
    ? 'linear-gradient(to top, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.8) 15%, rgba(255,255,255,0.4) 35%, transparent 50%)'
    : 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.7) 15%, rgba(0,0,0,0.3) 35%, transparent 50%)';
  const sceneReviewBottomGradient = isLight
    ? 'linear-gradient(to top, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.75) 15%, rgba(255,255,255,0.35) 35%, transparent 55%)'
    : 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.75) 15%, rgba(0,0,0,0.35) 35%, transparent 55%)';
  const sceneReviewTopGradient = isLight
    ? 'linear-gradient(to bottom, rgba(255,255,255,0.3) 0%, transparent 12%)'
    : 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 12%)';
  const vignette = isLight ? 'inset 0 0 80px rgba(255,255,255,0.4)' : 'inset 0 0 80px rgba(0,0,0,0.5)';
  const fallbackBg = isLight
    ? 'radial-gradient(ellipse at center, rgba(220,225,235,0.8) 0%, rgba(245,247,250,1) 70%)'
    : 'radial-gradient(ellipse at center, rgba(30,30,50,0.8) 0%, rgba(10,14,26,1) 70%)';
  const dialogueBg = isLight ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.6)';
  const titleClass = isLight ? 'text-gray-900' : 'text-white';
  const subtitleClass = isLight ? 'text-gray-600' : 'text-gray-300';
  const textClass = isLight ? 'text-gray-800' : 'text-gray-100';

  const coverImage = scenes.length > 0 ? scenes[scenes.length - 1].imageUrl : '';

  // 剧情数据统计
  const stats = useMemo(() => {
    const wordCount = session.chapters.reduce((sum, ch) => sum + (ch.content?.length || 0), 0);
    const sceneCount = scenes.length;
    const choiceCount = session.choices.filter(c => c.selectedOption).length;
    // 阅读时长估算: 中文~300字/分钟, 英文~200词/分钟, 取 ~250 字符/分钟平均
    const readMin = Math.max(1, Math.round(wordCount / 250));
    return { wordCount, sceneCount, choiceCount, readMin };
  }, [session, scenes]);

  // 导出剧情为文本
  const [exportToast, setExportToast] = useState<string | null>(null);
  // 🔧 PM-NEW-47 fix: 加 isExporting 状态, 按钮显示 spinner
  const [isExporting, setIsExporting] = useState(false);
  // 🔧 ARCH fix (Round 12 M4): 跟踪 export toast timer, 防止 unmount 后 setState
  // 🔧 ARCH fix (Round 44 R44-A-4): 外层 setTimeout(0) + revokeObjectURL setTimeout 也追踪
  // 🔧 ARCH fix (Round 45 REVIEW-A-2): revoke timer 不在 cleanup 中清 (Blob URL 需释放防内存泄漏)
  const exportToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportDeferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportRevokeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (exportToastTimerRef.current) clearTimeout(exportToastTimerRef.current);
    if (exportDeferTimerRef.current) clearTimeout(exportDeferTimerRef.current);
    // 🔧 不清 exportRevokeTimerRef — a.click() 是同步的, unmount 后 revokeObjectURL 仍安全执行,
    //    清掉会导致 Blob URL 永不释放 (内存泄漏)。
  }, []);
  const handleExport = useCallback(() => {
    // 🔧 Bug 21 fix: 立即显示 "Generating..." toast, 让用户知道点击生效了
    // 🔧 PM-NEW-47 fix: 加 isExporting 状态, 按钮显示 spinner
    setExportToast(t('butterfly.historyExportGenerating', { defaultValue: 'Generating export...' }));
    setIsExporting(true);
    if (exportToastTimerRef.current) clearTimeout(exportToastTimerRef.current);

    // 🔧 Bug 8 fix (P1): 用 setTimeout(100) 让 toast + spinner 先渲染, 再执行同步的 Blob 构建
    // 🔧 PM-NEW-47 fix: 0ms → 100ms, 给 React 足够时间渲染 isExporting 状态
    // 🔧 ARCH fix (Round 44 R44-A-4): 用 ref 追踪外层 setTimeout, 防止 unmount 后触发下载
    if (exportDeferTimerRef.current) clearTimeout(exportDeferTimerRef.current);
    exportDeferTimerRef.current = setTimeout(() => {
      exportDeferTimerRef.current = null;
      try {
        logger.info('[ButterflyHistory] handleExport called, session:', session?.id);
        const lines: string[] = [];
        lines.push('='.repeat(50));
        lines.push(`Symy Future Gacha — Story Export`);
        lines.push('='.repeat(50));
        lines.push('');
        lines.push(`Decision: ${isBought ? 'Bought' : 'Resisted'} — ${session.decisionDescription}`);
        if (session.amount) lines.push(`Amount: $${session.amount.toFixed(2)}`);
        if (session.platform) lines.push(`Platform: ${session.platform}`);
        lines.push(`Date: ${formatDate(session.createdAt, locale)}`);
        lines.push(`Status: ${isCompleted ? 'Completed' : 'Incomplete'}`);
        lines.push(`Tone: ${finalTone}`);
        lines.push('');
        if (session.butterflyEffect) {
          lines.push('--- Butterfly Effect Summary ---');
          lines.push(session.butterflyEffect);
          lines.push('');
        }
        session.chapters.forEach((ch, _i) => {
          lines.push(`--- Chapter ${ch.index}: ${ch.title} ---`);
          lines.push(`Time: ${ch.timeSpan} | Tone: ${ch.tone}`);
          lines.push('');
          // 🔧 P1-13 fix: 把内部存储的 scene 分隔符 ||| 替换为换行 + 空行,
          //   让导出的 txt 文件对普通用户可读 (旧代码直接输出 ||| 分隔的文本, 用户看到一长串 ||| 困惑).
          const rawContent = ch.content || '(no content)';
          const readableContent = rawContent.split('|||').map(s => s.trim()).filter(s => s.length > 0).join('\n\n');
          lines.push(readableContent);
          lines.push('');
          const choice = getChoiceForChapter(session, ch.index);
          if (choice) {
            lines.push(`[Crossroads] ${choice.prompt}`);
            lines.push(`Your choice: ${getOptionLabel(choice, choice.selectedOption)}`);
            lines.push('');
          }
        });
        lines.push('='.repeat(50));
        // 🔧 P0-5 fix: 移除硬编码 symy.ai, 用当前域名 (测试环境跳测试环境, 生产跳生产)
        lines.push(`Exported from Symy AI — ${typeof window !== 'undefined' ? window.location.origin : 'https://symy.ai'}`);
        lines.push('='.repeat(50));

        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `symy-story-${session.id.slice(0, 8)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // 🔧 Bug 8 fix: 延迟 revokeObjectURL, 部分浏览器需要 URL 存在到下载启动
        // 🔧 ARCH fix (Round 44 R44-A-4): 用 ref 追踪 revoke timer, 防止 unmount 后 URL 已失效
        if (exportRevokeTimerRef.current) clearTimeout(exportRevokeTimerRef.current);
        exportRevokeTimerRef.current = setTimeout(() => {
          URL.revokeObjectURL(url);
          exportRevokeTimerRef.current = null;
        }, 1000);
        setExportToast(t('butterfly.historyExportDone', { defaultValue: 'Story exported as text' }));
        setIsExporting(false);
        if (exportToastTimerRef.current) clearTimeout(exportToastTimerRef.current);
        exportToastTimerRef.current = setTimeout(() => setExportToast(null), 2500);
      } catch (err) {
        logger.error('[ButterflyHistory] handleExport error:', err);
        setExportToast('Export failed');
        setIsExporting(false);
        if (exportToastTimerRef.current) clearTimeout(exportToastTimerRef.current);
        exportToastTimerRef.current = setTimeout(() => setExportToast(null), 2500);
      }
    }, 100);
  }, [session, isBought, isCompleted, finalTone, locale, t]);

  // 空内容
  if (session.chapters.length === 0) {
    return (
      <div className={`h-full flex flex-col ${isLight ? 'bg-gray-50' : 'bg-surface-1'}`}>
        <DetailHeader isLight={isLight} onBack={onBack} title={t('butterfly.historyViewDetail')} />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="text-5xl opacity-40">📭</div>
          <p className={`text-sm ${isLight ? 'text-gray-500' : 'text-text-tertiary'}`}>
            {t('butterfly.historyNoChapters')}
          </p>
          <p className={`text-sm font-medium ${isLight ? 'text-gray-700' : 'text-text-secondary'}`}>
            {session.decisionDescription}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col ${isLight ? 'bg-gray-50' : 'bg-surface-1'}`}>
      <DetailHeader isLight={isLight} onBack={onBack} title={t('butterfly.historyViewDetail')} />

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto relative">
        {/* ==================================================== */}
        {/* 封面: 结局基调 + 蝴蝶效应总结 */}
        {/* ==================================================== */}
        <div className="relative w-full aspect-[3/4] max-h-[60vh] overflow-hidden">
          {coverImage ? (
            <>
              <img
                src={coverImage}
                alt={t('butterfly.yourFutureUnlocked')}
                className="w-full h-full object-cover"
                style={{ filter: isLight ? 'brightness(1.15) saturate(0.85)' : 'none' }}
              />
              <div className="absolute inset-0 pointer-events-none" style={{ background: bottomGradient }} />
              <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: vignette }} />
            </>
          ) : (
            <div className="w-full h-full" style={{ background: fallbackBg }} />
          )}

          <div className="absolute bottom-0 left-0 right-0 px-5 pb-6 pt-20">
            <div className="text-4xl mb-3 text-center">{TONE_EMOJI[finalTone] || '🎰'}</div>
            <h2 className={`text-2xl font-bold ${titleClass} text-center mb-2`} style={{
              textShadow: isLight ? '0 0 20px rgba(168,85,247,0.2)' : '0 0 20px rgba(168,85,247,0.4)'
            }}>
              {isCompleted ? t('butterfly.yourFutureUnlocked') : t('butterfly.storyInProgress', { defaultValue: 'Story in progress' })}
            </h2>
            <p className={`text-xs ${subtitleClass} text-center mb-4`}>
              {session.chapters.length} {t('butterfly.chapters')} · {session.choices.filter(c => c.selectedOption).length} {t('butterfly.crossroads')} · {t('butterfly.oneDecision')}
            </p>

            {/* 蝴蝶效应总结（可折叠） */}
            {session.butterflyEffect && (
              <div className="rounded-2xl backdrop-blur-md cursor-pointer" style={{
                backgroundColor: dialogueBg,
                border: `1px solid ${borderColor}`,
              }} onClick={() => setIsSummaryCollapsed(prev => !prev)}>
                <div className="flex items-center justify-between px-5 py-3">
                  <span className={`text-xs font-medium ${subtitleClass}`}>
                    {t('butterfly.futureGachaResult')}
                  </span>
                  <svg
                    viewBox="0 0 16 16"
                    className={`w-3.5 h-3.5 ${subtitleClass} transition-transform duration-300 ${isSummaryCollapsed ? '' : 'rotate-180'}`}
                    fill="currentColor"
                  >
                    <path d="M8 11L3 6h10l-5 5z" />
                  </svg>
                </div>
                {!isSummaryCollapsed && (
                  <div className="px-5 pb-4">
                    <p className={`${textClass} leading-relaxed text-[14px] italic`}>
                      {session.butterflyEffect}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 状态标记 */}
            {!isCompleted && (
              <div className="flex justify-center mt-3">
                <span className={`text-[10px] font-medium px-3 py-1 rounded-full ${isLight ? 'text-gray-500 bg-gray-200/60' : 'text-text-tertiary bg-glass-fill-strong'}`}>
                  {t('butterfly.historyAbandoned')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ==================================================== */}
        {/* 原始决策信息卡 */}
        {/* ==================================================== */}
        <div className="px-4 py-4">
          <div className={`max-w-md mx-auto rounded-2xl p-4 border ${isLight ? 'bg-white border-gray-200' : 'bg-glass-fill border-glass-border'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${isBought ? (isLight ? 'text-red-600 bg-red-500/10 border-red-500/20' : 'text-red-400 bg-red-400/10 border-red-400/20') : (isLight ? 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' : 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20')}`}>
                {isBought ? t('butterfly.bought') : t('butterfly.resisted')}
              </span>
              <span className={`text-[11px] ${isLight ? 'text-gray-400' : 'text-text-tertiary'}`}>
                {formatDate(session.createdAt, locale)}
              </span>
            </div>
            <p className={`text-sm font-medium mb-1 ${isLight ? 'text-gray-800' : 'text-text-primary'}`}>
              {session.decisionDescription}
            </p>
            {(session.amount || session.platform) && (
              <div className="flex items-center gap-2">
                {session.amount && (
                  <span className={`text-xs font-mono ${isLight ? 'text-gray-500' : 'text-text-tertiary'}`}>${session.amount.toFixed(2)}</span>
                )}
                {session.platform && (
                  <span className={`text-xs ${isLight ? 'text-gray-400' : 'text-text-tertiary'}`}>· {session.platform}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ==================================================== */}
        {/* 剧情数据统计卡 */}
        {/* ==================================================== */}
        <div className="px-4 pb-4">
          <div className={`max-w-md mx-auto rounded-2xl p-4 border ${isLight ? 'bg-white border-gray-200' : 'bg-glass-fill border-glass-border'}`}>
            <div className={`flex items-center gap-1.5 mb-3 text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-gray-400' : 'text-text-tertiary'}`}>
              <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor">
                <path d="M1.5 1a.5.5 0 0 1 .5.5v13a.5.5 0 0 1-1 0v-13a.5.5 0 0 1 .5-.5zm13 0a.5.5 0 0 1 .5.5v13a.5.5 0 0 1-1 0v-13a.5.5 0 0 1 .5-.5zM3 3.5a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9z" />
              </svg>
              {t('butterfly.historyDetailStats')}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatBox
                icon="📝"
                label={t('butterfly.historyDetailWordCount')}
                value={stats.wordCount.toLocaleString()}
                isLight={isLight}
              />
              <StatBox
                icon="🎬"
                label={t('butterfly.historyDetailSceneCount')}
                value={String(stats.sceneCount)}
                isLight={isLight}
              />
              <StatBox
                icon="🛤️"
                label={t('butterfly.crossroads')}
                value={String(stats.choiceCount)}
                isLight={isLight}
              />
              <StatBox
                icon="⏱️"
                label={t('butterfly.historyDetailTimeSpent')}
                value={stats.readMin >= 60 ? `${Math.floor(stats.readMin / 60)}h${stats.readMin % 60}m` : `${stats.readMin}m`}
                isLight={isLight}
              />
            </div>
          </div>
        </div>

        {/* ==================================================== */}
        {/* 逐场景 Galgame 风格回放 */}
        {/* ==================================================== */}
        <div className="space-y-0">
          {scenes.map((scene, idx) => {
            const sAccent = isLight ? (TONE_ACCENT_LIGHT[scene.tone] || '#6b7280') : (TONE_ACCENT_DARK[scene.tone] || '#d1d5db');
            const sBorder = isLight ? (TONE_BORDER_LIGHT[scene.tone] || 'rgba(107,114,128,0.25)') : (TONE_BORDER_DARK[scene.tone] || 'rgba(156,163,175,0.25)');

            // 该场景后是否有选择
            const isLastSceneOfChapter = scene.sceneIndex === scene.totalScenes - 1;
            const choice = isLastSceneOfChapter ? getChoiceForChapter(session, scene.chapterIndex) : null;

            return (
              <div key={idx} data-chapter-index={scene.sceneIndex === 0 ? scene.chapterIndex : undefined}>
                {/* 场景帧 */}
                <div className="relative w-full" style={{ aspectRatio: '3/4' }}>
                  {scene.imageUrl ? (
                    <>
                      <img
                        src={scene.imageUrl}
                        alt={`Chapter ${scene.chapterIndex}, Scene ${scene.sceneIndex + 1}`}
                        className="w-full h-full object-cover"
                        style={{ filter: isLight ? 'brightness(1.15) saturate(0.85)' : 'none' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div className="absolute inset-0 pointer-events-none" style={{ background: sceneReviewBottomGradient }} />
                      <div className="absolute inset-0 pointer-events-none" style={{ background: sceneReviewTopGradient }} />
                      <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: vignette }} />
                    </>
                  ) : (
                    <div className={`w-full h-full ${isLight ? 'bg-gray-100' : 'bg-gray-950'}`} style={{ background: fallbackBg }} />
                  )}

                  {/* 章节标记 */}
                  <div className="absolute top-3 left-3 z-10">
                    {scene.sceneIndex === 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${sAccent}22`, color: sAccent, border: `1px solid ${sBorder}` }}>
                          {t('butterfly.chapterLabelShort', { n: scene.chapterIndex, defaultValue: 'CH.{n}' })}
                        </span>
                        <span className={`text-[11px] ${isLight ? 'text-gray-700' : 'text-gray-300/70'}`}>{scene.chapterTitle}</span>
                        {scene.timeSpan && (
                          <span className={`text-[10px] ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>· {scene.timeSpan}</span>
                        )}
                      </div>
                    ) : (
                      <span className={`text-[10px] ${isLight ? 'text-gray-500' : 'text-gray-500'} font-mono`}>
                        {t('butterfly.chapterLabelShort', { n: scene.chapterIndex, defaultValue: 'CH.{n}' })} · {scene.sceneIndex + 1}/{scene.totalScenes}
                      </span>
                    )}
                  </div>

                  {/* 台词框 */}
                  <div className="absolute bottom-0 left-0 right-0 px-4 pb-5 pt-16 z-10">
                    <div className="rounded-2xl px-4 py-3 backdrop-blur-md" style={{ backgroundColor: dialogueBg, border: `1px solid ${sBorder}`, boxShadow: `0 0 15px ${sBorder}` }}>
                      <p className={`${textClass} leading-relaxed text-[15px] font-normal`} style={{ color: sAccent }}>
                        {scene.text}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 分岔路口选择回顾 */}
                {choice && (
                  <div className={`px-4 py-5 ${isLight ? 'bg-purple-50/50' : 'bg-glass-fill'}`}>
                    <div className={`max-w-md mx-auto rounded-2xl border p-4 ${isLight ? 'bg-white border-purple-200' : 'bg-glass-fill-strong border-purple-400/20'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm">🛤️</span>
                        <span className={`text-xs font-bold ${isLight ? 'text-purple-700' : 'text-purple-300'}`}>
                          {t('butterfly.crossroadsPrompt')}
                        </span>
                      </div>
                      <p className={`text-sm mb-3 ${isLight ? 'text-gray-700' : 'text-text-secondary'}`}>
                        {choice.prompt}
                      </p>
                      {/* 选项列表（高亮已选） */}
                      <div className="space-y-1.5">
                        {choice.options.map((opt) => {
                          const isSelected = opt.id === choice.selectedOption;
                          return (
                            <div
                              key={opt.id}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                                isSelected
                                  ? (isLight ? 'bg-purple-500/15 border border-purple-400/40 text-purple-700 font-medium' : 'bg-purple-400/15 border border-purple-400/40 text-purple-300 font-medium')
                                  : (isLight ? 'bg-gray-50 border border-gray-200 text-gray-400' : 'bg-glass-fill border border-glass-border text-text-tertiary')
                              }`}
                            >
                              <span className={`text-[10px] font-mono font-bold ${isSelected ? '' : 'opacity-50'}`}>{opt.id}</span>
                              <span className="flex-1">{opt.label}</span>
                              {isSelected && (
                                <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
                                  <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.5 7.5a.75.75 0 0 1-1.06 0L2.22 9.78a.75.75 0 1 1 1.06-1.06L5.75 11.19l7.19-7.19a.75.75 0 0 1 1.06 0z" />
                                </svg>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ==================================================== */}
        {/* 底部: 操作按钮 */}
        {/* ==================================================== */}
        <div className="px-4 py-6 space-y-3">
          <div className="max-w-md mx-auto space-y-3">
            <p className={`text-center text-sm ${isLight ? 'text-gray-500' : 'text-text-tertiary'}`}>
              {/* 🔧 N36 fix: 不用 t() 传 desc 参数，ICU MessageFormat 会把 $5 解析为变量吞掉
                  改用字符串拼接，保留 $ 完整 */}
              {/* 🔧 2026-07-17 (task 1): 加 considering 类型显示 */}
              {isBought
                ? `${t('butterfly.originalDecisionBoughtPrefix')} "${session.decisionDescription}"`
                : session.decisionType === 'considering'
                  ? `${t('butterfly.originalDecisionConsideringPrefix', { defaultValue: 'You are considering' })} "${session.decisionDescription}"`
                  : `${t('butterfly.originalDecisionResistedPrefix')} "${session.decisionDescription}"`}
            </p>
            <button
              onClick={onStartNew}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-bold text-sm hover:from-cyan-400 hover:to-purple-400 transition-all active:scale-95 cursor-pointer shadow-lg shadow-cyan-500/20"
            >
              {t('butterfly.historyStartNew')}
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className={`w-full py-2.5 rounded-2xl text-sm font-medium transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 ${isExporting ? 'opacity-60 cursor-wait' : ''} ${isLight ? 'text-gray-600 hover:bg-gray-100 border border-gray-200' : 'text-text-secondary hover:bg-glass-fill-strong border border-glass-border'}`}
            >
              {/* 🔧 PM-NEW-47 fix: isExporting 时显示 spinner, 否则显示下载图标 */}
              {isExporting ? (
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 animate-spin" fill="currentColor">
                  <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
                  <path d="M8 0a.5.5 0 0 1 .5.5v9.793l2.146-2.147a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 1 1 .708-.708L7.5 10.293V.5A.5.5 0 0 1 8 0zM2 13.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z" />
                </svg>
              )}
              {isExporting ? t('butterfly.historyExportGenerating', { defaultValue: 'Generating export...' }) : t('butterfly.historyExportStory')}
            </button>
            {/* 🔧 PM-5 fix: Share 按钮 — 生成无需注册直接打开故事的链接 */}
            <button
              onClick={async () => {
                try {
                  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://symy.ai';
                  const shareUrl = `${origin}/?tab=butterfly&session=${session.id}`;
                  const lines: string[] = [];
                  lines.push('🎰 My butterfly-effect story on Symy');
                  lines.push('');
                  lines.push(`${isBought ? 'I bought' : session.decisionType === 'considering' ? 'I\'m considering' : 'I didn\'t buy'}: "${session.decisionDescription}"`);
                  if (session.amount) lines.push(`Amount: $${session.amount.toFixed(2)}`);
                  lines.push('');
                  if (session.butterflyEffect) {
                    lines.push(session.butterflyEffect);
                  }
                  lines.push('');
                  lines.push(`Read the full story: ${shareUrl}`);

                  const text = lines.join('\n');
                  // 🔧 2026-07-17 fix: 优先用 navigator.share (移动端原生分享), fallback 复制到剪贴板
                  if (typeof navigator !== 'undefined' && navigator.share) {
                    await navigator.share({ title: 'My Symy Story', text, url: shareUrl });
                  } else {
                    await navigator.clipboard.writeText(text);
                    setExportToast(t('butterfly.historyShareCopied', { defaultValue: 'Story link copied to clipboard! 📋' }));
                    if (exportToastTimerRef.current) clearTimeout(exportToastTimerRef.current);
                    exportToastTimerRef.current = setTimeout(() => setExportToast(null), 2500);
                  }
                } catch (err) {
                  logger.error('[ButterflyHistory] Share failed:', err);
                  setExportToast('Share failed');
                  if (exportToastTimerRef.current) clearTimeout(exportToastTimerRef.current);
                  exportToastTimerRef.current = setTimeout(() => setExportToast(null), 2500);
                }
              }}
              className={`w-full py-2.5 rounded-2xl text-sm font-medium transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 ${isLight ? 'text-gray-600 hover:bg-gray-100 border border-gray-200' : 'text-text-secondary hover:bg-glass-fill-strong border border-glass-border'}`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              {t('butterfly.historyShareStory', { defaultValue: 'Share Story' })}
            </button>
          </div>
        </div>

        {/* 导出成功 toast */}
        {exportToast && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-medium shadow-lg animate-fade-in">
            ✓ {exportToast}
          </div>
        )}

        {/* 浮动章节导航按钮（滚动时显示当前章节） */}
        {chapterList.length > 1 && (
          <button
            onClick={() => setShowChapterNav(prev => !prev)}
            className="fixed bottom-24 right-4 z-40 flex items-center gap-1.5 px-3 py-2 rounded-full backdrop-blur-md shadow-lg transition-all active:scale-95 cursor-pointer"
            style={{
              backgroundColor: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.7)',
              border: `1px solid ${borderColor}`,
            }}
            aria-label="chapter navigation"
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill={accent} >
              <path d="M2.5 1a.5.5 0 0 1 .5.5v13a.5.5 0 0 1-1 0v-13a.5.5 0 0 1 .5-.5zm11 0a.5.5 0 0 1 .5.5v13a.5.5 0 0 1-1 0v-13a.5.5 0 0 1 .5-.5zM5 3.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5v-9z" />
            </svg>
            <span className={`text-xs font-bold font-mono ${isLight ? 'text-gray-700' : 'text-white'}`}>
              {activeChapter !== null ? `CH.${activeChapter}` : 'CH.1'}
            </span>
            <span className={`text-[10px] ${isLight ? 'text-gray-400' : 'text-text-tertiary'}`}>
              / {chapterList.length}
            </span>
          </button>
        )}

        {/* 章节导航 overlay */}
        {showChapterNav && (
          <>
            {/* 背景遮罩 */}
            <div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-fade-in"
              onClick={() => setShowChapterNav(false)}
            />
            {/* 章节列表面板 */}
            <div className={`fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl max-h-[60vh] overflow-y-auto animate-slide-up ${isLight ? 'bg-white' : 'bg-gray-900'}`}>
              {/* 拖拽指示器 */}
              <div className="sticky top-0 flex justify-center py-2.5">
                <div className={`w-10 h-1 rounded-full ${isLight ? 'bg-gray-300' : 'bg-gray-600'}`} />
              </div>
              <div className={`px-4 pb-2 flex items-center justify-between`}>
                <h3 className={`text-sm font-bold ${isLight ? 'text-gray-900' : 'text-white'}`}>
                  {t('butterfly.historyChapterNav')}
                </h3>
                <span className={`text-[11px] ${isLight ? 'text-gray-400' : 'text-text-tertiary'}`}>
                  {chapterList.length} {t('butterfly.chapters')}
                </span>
              </div>
              <div className="px-3 pb-6 space-y-1">
                {chapterList.map((ch) => {
                  const chAccent = isLight ? (TONE_ACCENT_LIGHT[ch.tone] || '#6b7280') : (TONE_ACCENT_DARK[ch.tone] || '#d1d5db');
                  const isActive = activeChapter === ch.index;
                  return (
                    <button
                      key={ch.index}
                      onClick={() => scrollToChapter(ch.index)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all active:scale-[0.98] cursor-pointer text-left ${
                        isActive
                          ? (isLight ? 'bg-gray-100' : 'bg-glass-fill-strong')
                          : (isLight ? 'hover:bg-gray-50' : 'hover:bg-glass-fill')
                      }`}
                    >
                      <span
                        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-mono font-bold"
                        style={{
                          backgroundColor: `${chAccent}22`,
                          color: chAccent,
                          border: `1px solid ${chAccent}44`,
                        }}
                      >
                        {ch.index}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isLight ? 'text-gray-800' : 'text-text-primary'}`}>
                          {ch.title}
                        </p>
                        <p className={`text-[11px] ${isLight ? 'text-gray-400' : 'text-text-tertiary'}`}>
                          {ch.timeSpan} · {ch.sceneCount} {t('butterfly.historyDetailSceneCount').toLowerCase()}
                        </p>
                      </div>
                      {isActive && (
                        <span className="flex-shrink-0 w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: chAccent }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
