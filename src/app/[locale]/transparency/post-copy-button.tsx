/**
 * TransparencyPostCopyButton — 「复制发帖文案」按钮 (batch89-a)
 *
 * BP p20 内容引擎落地辅助: owner 发周报到 X 前还得手写文案 — 这里一键生成
 * + 复制 (buildWeeklyPostCopy 纯函数, 三非金额指标), 下拉选 zh/en, 默认跟随
 * 当前 locale。只复制不自动发布。
 *
 * 文案本体在纯函数内 (双语模板), 本组件只管 UI。数字以原始 props 传入
 * (仅三个非金额指标), 组件内 Intl 格式化。键面契约: 不做兜底文案 — 缺键
 * 宁可暴露原始 key, 也绝不悄悄回退默认文案。
 */

'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { buildWeeklyPostCopy } from '@/lib/transparency-post-copy';

interface TransparencyPostCopyButtonProps {
  /** 本周拦截次数 (原始数, 组件内 Intl 格式化) */
  intercepts: number;
  /** 本周赢回小时 (原始数) */
  hoursWon: number;
  /** 守护者数 (原始数) */
  guards: number;
}

const COPIED_RESET_MS = 1500;

export function TransparencyPostCopyButton({
  intercepts,
  hoursWon,
  guards,
}: TransparencyPostCopyButtonProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [copyLocale, setCopyLocale] = useState(locale === 'zh' ? 'zh' : 'en');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(
        buildWeeklyPostCopy(
          { intercepts: { week: intercepts }, hoursWon: { week: hoursWon }, guards },
          copyLocale,
        ),
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      // safe to ignore: 剪贴板拒权 — 成功胶囊不亮, owner 可改用「分享到 X」
    }
  };

  return (
    <div className="mt-3 flex items-center justify-center gap-2" data-testid="transparency-post-copy">
      <label className="flex items-center gap-1.5 text-xs text-text-tertiary">
        {t('transparency.postCopyLangLabel')}
        <select
          value={copyLocale}
          onChange={(e) => setCopyLocale(e.target.value)}
          data-testid="transparency-post-copy-lang"
          className="rounded-full border border-emerald-500/30 bg-white/60 px-2.5 py-1.5 text-xs text-text-primary dark:bg-black/20"
        >
          <option value="zh">{t('transparency.postCopyLangZh')}</option>
          <option value="en">{t('transparency.postCopyLangEn')}</option>
        </select>
      </label>
      <button
        type="button"
        onClick={handleCopy}
        data-testid="transparency-post-copy-button"
        className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 px-5 py-2.5 text-sm font-semibold text-emerald-700 transition-all hover:opacity-90 active:scale-95 dark:text-emerald-300"
      >
        {t('transparency.postCopyButton')}
      </button>
      {copied && (
        <span
          className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
          data-testid="transparency-post-copy-copied"
        >
          {t('transparency.postCopyCopied')}
        </span>
      )}
    </div>
  );
}
