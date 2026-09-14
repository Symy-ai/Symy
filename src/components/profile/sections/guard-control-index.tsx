'use client';

/**
 * GuardControlIndex — 设置页顶部「守护总控索引」(batch68-b)
 *
 * 一屏看清守护系统全貌: 当前守护风格 (一句话解释) + 四组守护状态
 * (对话 / 购物车 / push / 资料与证据, 各 on/partial/off/unknown) +
 * 绿色规则覆盖健康度 (只到级别与未覆盖品类数, 不出长列表)。
 * 分组行是锚点跳转按钮 — 不移动任何既有设置项, 只做定位;
 * 键盘可达 (原生 button + 焦点 ring + 落点 focus)。
 *
 * 降级红线: 任一探测失败只把该维度置 unknown, 设置页照常打开, 不整页 loading;
 * unknown 时给出「重新检查」轻试。partial 直接指出待完成项。
 * 隐私红线: 只出现次数/天数/状态 — 零金额、零商品名、零碳数值。
 */

import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { Bell, ChevronRight, FileText, Gauge, Leaf, MessageCircle, ShoppingCart, Sparkles } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useGuardIntensity } from '@/hooks/use-guard-intensity';
import { useNightWindow } from '@/hooks/use-night-window';
import { useGuardScope } from '@/hooks/use-guard-scope';
import { usePushNotifications } from '@/lib/push/use-push-notifications';
import {
  loadGuardCoverageProbe,
  loadGuardEvidenceProbe,
  loadGuardPushProbe,
  type GuardPushProbe,
} from '@/lib/guard-settings-probes';
import {
  summarizeGuardSettings,
  type GuardCoverageSnapshot,
  type GuardEvidenceSnapshot,
  type GuardGroupStatus,
} from '@/lib/guard-settings-summary';
import { PRESET_DESC_KEY, PRESET_LABEL_KEY } from './guardian-style-copy';

type ProbeState<T> = T | 'unknown' | null;

const GROUP_META = [
  { id: 'chat', labelKey: 'profile.guardControlGroupChat', icon: MessageCircle, anchorId: 'guard-anchor-chat' },
  { id: 'cart', labelKey: 'profile.guardControlGroupCart', icon: ShoppingCart, anchorId: 'guard-anchor-cart' },
  { id: 'push', labelKey: 'profile.guardControlGroupPush', icon: Bell, anchorId: 'guard-anchor-push' },
  { id: 'evidence', labelKey: 'profile.guardControlGroupEvidence', icon: FileText, anchorId: 'guard-anchor-evidence' },
] as const;

type GroupId = (typeof GROUP_META)[number]['id'];

const STATUS_KEY: Record<GuardGroupStatus, string> = {
  on: 'profile.guardControlStatusOn',
  partial: 'profile.guardControlStatusPartial',
  off: 'profile.guardControlStatusOff',
  unknown: 'profile.guardControlStatusUnknown',
};

const STATUS_CLASS: Record<GuardGroupStatus, string> = {
  on: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  partial: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  off: 'border-glass-border bg-glass-fill text-text-tertiary',
  unknown: 'border-glass-border bg-glass-fill text-text-tertiary italic',
};

const PARTIAL_HINT_KEY: Record<GroupId, string> = {
  chat: 'profile.guardControlChatPartialHint',
  cart: 'profile.guardControlCartPartialHint',
  push: 'profile.guardControlPushPartialHint',
  evidence: 'profile.guardControlEvidencePartialHint',
};

const COVERAGE_HEALTH_KEY: Record<NonNullable<GuardCoverageSnapshot>['health'], string> = {
  healthy: 'profile.guardControlCoverageHealthy',
  partial: 'profile.guardControlCoveragePartial',
  noData: 'profile.guardControlCoverageNoData',
  noEntries: 'profile.guardControlCoverageNoEntries',
};

const COVERAGE_TONE_CLASS: Record<NonNullable<GuardCoverageSnapshot>['health'], string> = {
  healthy: 'text-emerald-300',
  partial: 'text-amber-300',
  noData: 'text-text-tertiary',
  noEntries: 'text-text-tertiary',
};

function jumpToAnchor(anchorId: string): void {
  const el = document.getElementById(anchorId);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
}

export function GuardControlIndex({ greenGuardEnabled }: { greenGuardEnabled: boolean }) {
  const { t } = useI18n();
  const { guardIntensity } = useGuardIntensity();
  const { nightWindow } = useNightWindow();
  const { guardScope } = useGuardScope();
  const { isSubscribed } = usePushNotifications();

  const [coverage, setCoverage] = useState<ProbeState<GuardCoverageSnapshot>>(null);
  const [evidence, setEvidence] = useState<ProbeState<GuardEvidenceSnapshot>>(null);
  const [pushProbe, setPushProbe] = useState<ProbeState<GuardPushProbe>>(null);

  const refreshProbes = useCallback((force: boolean) => {
    loadGuardCoverageProbe(force).then(setCoverage).catch(() => setCoverage('unknown'));
    loadGuardEvidenceProbe(force).then(setEvidence).catch(() => setEvidence('unknown'));
    loadGuardPushProbe(force).then(setPushProbe).catch(() => setPushProbe('unknown'));
  }, []);

  useEffect(() => {
    refreshProbes(false);
  }, [refreshProbes]);

  const summary = summarizeGuardSettings({
    greenGuardEnabled,
    guardIntensity,
    nightWindow,
    guardScope,
    push: pushProbe === 'unknown' || pushProbe === null ? 'unknown' : { subscribed: isSubscribed, ...pushProbe },
    evidence: evidence === 'unknown' || evidence === null ? 'unknown' : evidence,
    coverage: coverage === 'unknown' || coverage === null ? 'unknown' : coverage,
  });
  const globalGuardOff = summary.groups.chat === 'off';

  const handleGroupJump = (id: GroupId, anchorId: string) => {
    // push 设置就在下方面板里就地生效 — 跳转时顺手重取偏好, 索引不滞留旧状态
    if (id === 'push') refreshProbes(true);
    jumpToAnchor(anchorId);
  };

  const styleLabel =
    summary.style.kind === 'preset'
      ? t(PRESET_LABEL_KEY[summary.style.preset])
      : summary.style.kind === 'custom'
        ? t('profile.guardControlStyleCustom')
        : t('profile.guardControlStyleUnknown');
  const styleHint =
    summary.style.kind === 'preset'
      ? t(PRESET_DESC_KEY[summary.style.preset])
      : summary.style.kind === 'custom'
        ? t('profile.guardControlStyleCustomHint')
        : t('profile.guardControlStyleUnknownHint');

  const hasUnknown = coverage === 'unknown' || evidence === 'unknown' || pushProbe === 'unknown';

  const partialHint = (id: GroupId): string => {
    if (globalGuardOff) return t('profile.guardControlGlobalOffHint');
    if (id === 'cart') return t(PARTIAL_HINT_KEY[id], { count: summary.cartExemptCount ?? 0 });
    return t(PARTIAL_HINT_KEY[id]);
  };

  return (
    <section
      data-testid="guard-control-index"
      aria-label={t('profile.guardControlTitle')}
      className="p-3 rounded-xl border border-cyan-500/20 bg-glass-fill"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
          <Gauge className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">{t('profile.guardControlTitle')}</p>
          <p className="text-xs text-text-tertiary">{t('profile.guardControlDesc')}</p>
        </div>
      </div>

      {/* 当前守护风格 — 复用守护风格向导的预设文案做一句话解释 */}
      <button
        type="button"
        data-testid="guard-control-style"
        data-style={summary.style.kind}
        onClick={() => jumpToAnchor('guard-anchor-style')}
        className="mt-2 w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-glass-border bg-glass-fill hover:bg-glass-hover transition-colors text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
      >
        <span className="flex items-center gap-2 text-xs text-text-secondary flex-shrink-0">
          <Sparkles className="w-3.5 h-3.5" />
          {t('profile.guardControlStyleLabel')}
        </span>
        <span className="text-xs font-medium text-text-primary truncate">{styleLabel}</span>
        <ChevronRight className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
      </button>
      <p className="mt-1 px-1 text-[11px] leading-relaxed text-text-tertiary">{styleHint}</p>

      {/* 绿色规则覆盖 — 只到健康度级别 + 未覆盖品类数 */}
      <button
        type="button"
        data-testid="guard-control-coverage"
        data-health={coverage === 'unknown' || coverage === null ? 'unknown' : coverage.health}
        onClick={() => jumpToAnchor('guard-anchor-coverage')}
        className="mt-1.5 w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-glass-border bg-glass-fill hover:bg-glass-hover transition-colors text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
      >
        <span className="flex items-center gap-2 text-xs text-text-secondary flex-shrink-0">
          <Leaf className="w-3.5 h-3.5" />
          {t('profile.guardControlCoverageLabel')}
        </span>
        <span className={`text-xs font-medium text-right truncate ${coverage && coverage !== 'unknown' ? COVERAGE_TONE_CLASS[coverage.health] : 'text-text-tertiary italic'}`}>
          {coverage && coverage !== 'unknown'
            ? coverage.health === 'partial' && coverage.uncoveredCategories > 0
              ? `${t(COVERAGE_HEALTH_KEY[coverage.health])} · ${t('profile.guardControlCoverageUncovered', { count: coverage.uncoveredCategories })}`
              : t(COVERAGE_HEALTH_KEY[coverage.health])
            : t('profile.guardControlStatusUnknown')}
        </span>
      </button>

      {/* 四组守护状态 — 每组一个锚点跳转按钮 */}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {GROUP_META.map(({ id, labelKey, icon: Icon, anchorId }: { id: GroupId; labelKey: string; icon: ComponentType<{ className?: string }>; anchorId: string }) => {
          const status = summary.groups[id];
          return (
            <button
              key={id}
              type="button"
              data-testid={`guard-control-group-${id}`}
              data-status={status}
              aria-label={t('profile.guardControlJumpAria', { group: t(labelKey) })}
              onClick={() => handleGroupJump(id, anchorId)}
              className="flex flex-col items-start gap-1 px-2.5 py-2 rounded-lg border border-glass-border bg-glass-fill hover:bg-glass-hover transition-colors text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            >
              <span className="flex w-full items-center justify-between gap-1">
                <span className="flex items-center gap-1.5 min-w-0">
                  <Icon className="w-3.5 h-3.5 flex-shrink-0 text-icon-muted" />
                  <span className="text-xs font-medium text-text-primary truncate">{t(labelKey)}</span>
                </span>
                <span className={`px-1.5 py-0.5 text-[10px] rounded-md border flex-shrink-0 ${STATUS_CLASS[status]}`}>
                  {t(STATUS_KEY[status])}
                </span>
              </span>
              <span className="text-[11px] text-text-tertiary leading-snug min-h-[16px]">
                {status === 'off' && globalGuardOff ? partialHint(id) : status === 'partial' ? partialHint(id) : ''}
              </span>
            </button>
          );
        })}
      </div>

      {hasUnknown && (
        <button
          type="button"
          data-testid="guard-control-retry"
          onClick={() => refreshProbes(true)}
          className="mt-2 w-full px-3 py-1.5 text-[11px] rounded-lg border border-glass-border text-text-tertiary hover:bg-glass-hover transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
        >
          {t('profile.guardControlRetry')}
        </button>
      )}
    </section>
  );
}
