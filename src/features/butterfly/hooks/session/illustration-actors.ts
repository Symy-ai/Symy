/**
 * illustration-actors — XState illustration-related spawn actors
 *
 * 🔧 ARCH fix (Round 62 — machine-services.ts god component 拆分):
 *    从 machine-services.ts 提取 3 个 illustration actors (~225 行)。
 *    machine-services.ts 从 1124 行 → ~900 行。
 *
 * 高内聚低耦合: illustration actor 逻辑内聚到此文件, machine-services 只 re-export。
 */

import { fromCallback } from 'xstate';
import type { ButterflyMachineEvent } from './butterfly-machine';
import type { ButterflySession } from '../../types';
import { generateIllustrationClient } from '../../lib/client-illustration-engine';
import { getDemoSceneIllustrations } from '../../lib/demo-content';
import { ILLUSTRATION_POLLING_INTERVAL_MS, ILLUSTRATION_POLLING_MAX_RETRIES } from './constants';
import type {
  TryClientIllustrationInput,
  GenerateSceneIllustrationsInput,
  IllustrationPollingInput,
} from './service-inputs';

// ── tryClientIllustrationActor：客户端插图生成 fallback（fromCallback + sendBack）──
export const tryClientIllustrationActor = fromCallback<ButterflyMachineEvent, TryClientIllustrationInput>(({ input, sendBack }) => {
  let cancelled = false;
  const abortController = new AbortController();
  const { chapterIndex, title, tone, timeSpan, decisionDescription, decisionType } = input;

  (async () => {
    try {
      const result = await generateIllustrationClient({
        title,
        tone,
        timeSpan,
        decisionDescription,
        decisionType,
        size: '136x238',
        signal: abortController.signal,
      });

      if (cancelled) return;

      if (result.success && result.imageUrl) {
        sendBack({ type: 'CLIENT_ILLU_DONE', chapterIndex, url: result.imageUrl });
        return;
      }

      sendBack({ type: 'CLIENT_ILLU_DONE', chapterIndex, url: null });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      if (cancelled) return;
      sendBack({ type: 'CLIENT_ILLU_DONE', chapterIndex, url: null });
    }
  })();

  return () => {
    cancelled = true;
    abortController.abort();
  };
});

// ── generateSceneIllustrationsActor：场景插图生成（fromCallback + sendBack）──
export const generateSceneIllustrationsActor = fromCallback<ButterflyMachineEvent, GenerateSceneIllustrationsInput>(({ input, sendBack }) => {
  let cancelled = false;
  const abortController = new AbortController();
  let waitTimer: ReturnType<typeof setTimeout> | null = null;
  const { chapterIndex, chapterContent, chapterTitle, tone, decisionDescription, isDemo } = input;

  (async () => {
    // Demo: 用预置 CDN URL
    if (isDemo) {
      const sceneIllustrations = getDemoSceneIllustrations(chapterIndex);
      for (const [sceneIdxStr, urls] of Object.entries(sceneIllustrations)) {
        if (cancelled) return;
        const sceneIdx = parseInt(sceneIdxStr, 10);
        const url = Array.isArray(urls) ? urls[0] : undefined;
        if (url) {
          sendBack({
            type: 'SCENE_ILLU_DONE',
            chapterIndex,
            sceneIndex: sceneIdx,
            url,
          });
        }
      }
      return;
    }

    // 正常模式：AI 生成每个场景
    const scenes = chapterContent.split('|||').map(s => s.trim()).filter(s => s.length > 0);
    if (scenes.length === 0) return;

    for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
      if (cancelled) return;
      const sceneText = scenes[sceneIdx];

      try {
        const res = await fetch(input.endpoints.illustration, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isSceneLevel: true,
            sceneText,
            title: chapterTitle,
            tone,
            decisionDescription,
            size: '136x238',
            shotIndex: 0,
          }),
          signal: abortController.signal,
        });

        if (res.ok) {
          const data = await res.json() as { success: boolean; imageUrl?: string };
          if (data.success && data.imageUrl) {
            sendBack({
              type: 'SCENE_ILLU_DONE',
              chapterIndex,
              sceneIndex: sceneIdx,
              url: data.imageUrl,
            });
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }

      if (sceneIdx < scenes.length - 1) {
        await new Promise<void>(resolve => {
          waitTimer = setTimeout(() => { waitTimer = null; resolve(); }, 500);
        });
      }
    }
  })();

  return () => {
    cancelled = true;
    abortController.abort();
    if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; }
  };
});

// ── illustrationPollingActor：插图轮询（fromCallback + sendBack）──
export const illustrationPollingActor = fromCallback<ButterflyMachineEvent, IllustrationPollingInput>(({ input, sendBack }) => {
  let cancelled = false;
  const { sessionId, currentChapters, endpoints } = input;
  let retryCount = 0;
  const maxRetries = ILLUSTRATION_POLLING_MAX_RETRIES;
  let prevChapters = currentChapters;

  const poll = async () => {
    while (retryCount < maxRetries && !cancelled) {
      const hasMissing = prevChapters.some(ch => !ch.illustrationUrl);
      if (!hasMissing) {
        sendBack({ type: 'ILLUSTRATION_POLLING_DONE' } as ButterflyMachineEvent);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, ILLUSTRATION_POLLING_INTERVAL_MS));
      if (cancelled) return;

      try {
        const res = await fetch(`${endpoints.session}?sessionId=${encodeURIComponent(sessionId)}`);
        if (!res.ok) {
          sendBack({ type: 'ILLUSTRATION_POLLING_DONE' } as ButterflyMachineEvent);
          return;
        }
        const { session: freshSession } = await res.json() as { session: ButterflySession | null };
        if (!freshSession || freshSession.id !== sessionId) {
          sendBack({ type: 'ILLUSTRATION_POLLING_DONE' } as ButterflyMachineEvent);
          return;
        }

        const freshChapters = freshSession.chapters;
        const hasNewIllustrations = freshChapters.some(ch =>
          ch.illustrationUrl && !prevChapters.find(c => c.index === ch.index)?.illustrationUrl
        );
        if (hasNewIllustrations) {
          sendBack({
            type: 'ILLUSTRATION_POLLING_UPDATE',
            chapters: freshChapters,
          } as ButterflyMachineEvent);
          prevChapters = freshChapters;
        } else {
          retryCount++;
        }
      } catch {
        sendBack({ type: 'ILLUSTRATION_POLLING_DONE' } as ButterflyMachineEvent);
        return;
      }
    }
    if (!cancelled) {
      sendBack({ type: 'ILLUSTRATION_POLLING_DONE' } as ButterflyMachineEvent);
    }
  };

  poll();

  return () => { cancelled = true; };
});
