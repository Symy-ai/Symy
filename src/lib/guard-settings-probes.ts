/**
 * guard-settings-probes — 守护总控索引的两组轻量数据探测 (batch68-b)
 *
 * 设置页各既有区块 (守护规则自检 / 守护数据管理) 已各自拉取 health-events;
 * 索引只需要结论级状态 (覆盖健康度 + 未覆盖品类数 / 守护记录规模),
 * 这里用受限 limit 的轻量 GET 自取, 模块级 promise 去重 + 60s TTL 缓存,
 * 设置页反复开关不重复请求; 失败不缓存, 供「重新检查」轻试。
 *
 * 隐私红线: 探测产物只含级别与计数 — 不透传事件明细 (商品名/金额/碳值不出此层)。
 */

import { GREEN_ALTERNATIVES } from '@/lib/green-alternatives';
import { analyzeGreenRuleCoverage, type GreenRuleCoverageEvent } from '@/lib/green-rule-coverage';
import { normalizePushPreferences, type PushFrequency } from '@/lib/push/preferences';
import type { GuardCoverageSnapshot, GuardEvidenceSnapshot } from '@/lib/guard-settings-summary';

const PROBE_TTL_MS = 60_000;
/** 覆盖健康度与既有「守护规则自检」区块同一窗口口径 (近 100 条) */
const COVERAGE_PROBE_LIMIT = 100;
/** 证据规模探测只判存在与稀疏 (0 / 1–4 / ≥5), limit=5 足够 */
const EVIDENCE_PROBE_LIMIT = 5;

async function fetchEventsOfType(eventType: string, limit: number): Promise<GreenRuleCoverageEvent[]> {
  const url = new URL('/api/buddy/health-events', window.location.origin);
  url.searchParams.set('event_type', eventType);
  url.searchParams.set('limit', String(limit));
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`guard-probe-${eventType}-failed`);
  const data = (await response.json()) as { events?: GreenRuleCoverageEvent[] };
  return data.events ?? [];
}

// ============ 覆盖健康度探测 (challenge_completed + manual_adjustment) ============
let coverageCache: { at: number; value: GuardCoverageSnapshot } | null = null;
let coverageInFlight: Promise<GuardCoverageSnapshot> | null = null;

export function loadGuardCoverageProbe(force = false): Promise<GuardCoverageSnapshot> {
  if (!force && coverageCache && Date.now() - coverageCache.at < PROBE_TTL_MS) {
    return Promise.resolve(coverageCache.value);
  }
  if (!force && coverageInFlight) return coverageInFlight;
  coverageInFlight = Promise.all([
    fetchEventsOfType('challenge_completed', COVERAGE_PROBE_LIMIT),
    fetchEventsOfType('manual_adjustment', COVERAGE_PROBE_LIMIT),
  ])
    .then(([challenge, manual]) => {
      const result = analyzeGreenRuleCoverage(GREEN_ALTERNATIVES, [...challenge, ...manual]);
      const value: GuardCoverageSnapshot = {
        health: result.status,
        uncoveredCategories: result.categoryGaps.length,
      };
      coverageCache = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      coverageInFlight = null;
    });
  return coverageInFlight;
}

// ============ 证据规模探测 (challenge_completed + mindful_recovery) ============
let evidenceCache: { at: number; value: GuardEvidenceSnapshot } | null = null;
let evidenceInFlight: Promise<GuardEvidenceSnapshot> | null = null;

export function loadGuardEvidenceProbe(force = false): Promise<GuardEvidenceSnapshot> {
  if (!force && evidenceCache && Date.now() - evidenceCache.at < PROBE_TTL_MS) {
    return Promise.resolve(evidenceCache.value);
  }
  if (!force && evidenceInFlight) return evidenceInFlight;
  evidenceInFlight = Promise.all([
    fetchEventsOfType('challenge_completed', EVIDENCE_PROBE_LIMIT),
    fetchEventsOfType('mindful_recovery', EVIDENCE_PROBE_LIMIT),
  ])
    .then(([challenge, recovery]) => {
      const value: GuardEvidenceSnapshot = { totalEvents: challenge.length + recovery.length };
      evidenceCache = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      evidenceInFlight = null;
    });
  return evidenceInFlight;
}

// ============ push 偏好探测 (GET /api/push/preferences, 只取节奏与四通道) ============
// 不复用 usePushPreferences: 它静默吞掉加载失败, 索引需要显式 unknown + 轻试语义。
export interface GuardPushProbe {
  frequency: PushFrequency;
  channels: {
    missYou: boolean;
    dreamFund: boolean;
    challenge: boolean;
    weeklyGuardian: boolean;
  };
}

let pushCache: { at: number; value: GuardPushProbe } | null = null;
let pushInFlight: Promise<GuardPushProbe> | null = null;

export function loadGuardPushProbe(force = false): Promise<GuardPushProbe> {
  if (!force && pushCache && Date.now() - pushCache.at < PROBE_TTL_MS) {
    return Promise.resolve(pushCache.value);
  }
  if (!force && pushInFlight) return pushInFlight;
  pushInFlight = fetch('/api/push/preferences', { credentials: 'include' }).then(async (response) => {
    if (!response.ok) throw new Error('guard-probe-push-preferences-failed');
    const body = (await response.json()) as { preferences?: unknown };
    const prefs = normalizePushPreferences(body?.preferences);
    const value: GuardPushProbe = {
      frequency: prefs.frequency,
      channels: {
        missYou: prefs.missYou,
        dreamFund: prefs.dreamFund,
        challenge: prefs.challenge,
        weeklyGuardian: prefs.weeklyGuardian,
      },
    };
    pushCache = { at: Date.now(), value };
    return value;
  }).finally(() => {
    pushInFlight = null;
  });
  return pushInFlight;
}

/** 测试专用 — 清空两个探测的缓存, 隔离用例间状态 */
export function _resetGuardProbeCachesForTest(): void {
  coverageCache = null;
  coverageInFlight = null;
  evidenceCache = null;
  evidenceInFlight = null;
  pushCache = null;
  pushInFlight = null;
}
