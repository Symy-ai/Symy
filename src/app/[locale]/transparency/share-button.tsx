/**
 * TransparencyShareButton — 「分享到 X」一键转发按钮 (batch82-a)
 *
 * BP 0918 p20: 周报每一周数据都要能一键转发到 X.com (种子平台)。行为 = 复制
 * 文案 + 打开 x.com/intent/tweet，文案模板 (transparency.shareText) 含周报
 * 三数字 + 页面链接。
 *
 * 文案纪律: 数字是平台聚合 (我们的账)，不涉及用户个人金额；无 FOMO 话术，
 * 守护叙事平静呈现 — 模板文案在 i18n 词典，本组件不做二次拼接。
 *
 * 键面契约: 不做兜底文案 — 缺键宁可暴露原始 key，也绝不悄悄回退默认文案。
 */

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface TransparencyShareButtonProps {
  /** 本周拦截次数 (已按 locale 格式化) */
  intercepts: string;
  /** 本周赢回小时 (已格式化，最多一位小数) */
  hoursWon: string;
}

export function TransparencyShareButton({
  intercepts,
  hoursWon,
}: TransparencyShareButtonProps) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const text = t('transparency.shareText', {
      intercepts,
      hours: hoursWon,
    });
    const url = `${window.location.origin}/transparency`;

    // 剪贴板失败不阻断转发 (部分浏览器拒权) — intent 照开
    try {
      await navigator.clipboard?.writeText(`${text}\n${url}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // safe to ignore: 剪贴板拒权时用户仍可在 X 编辑器里看到预填文案
    }

    window.open(
      `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      data-testid="transparency-share"
      className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      {copied ? t('transparency.shareCopied') : t('transparency.shareButton')}
    </button>
  );
}
