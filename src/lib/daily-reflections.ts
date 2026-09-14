/**
 * Daily Guardian Lines — 每日守护文案池
 *
 * 绿色守护叙事 (batch6-c, 2026-09-06): 每天对用户说一句话，不是建议，不是任务，
 * 是小象陪你停顿一下。旧魔镜哲学的照见/镜子/自由话术已清零 (见 __tests__ 旧词守卫)。
 *
 * 设计原则：
 * - 每天轮换一句 (按日期 index)
 * - 仪式用 index N，主页用 index N+1 (不重复)
 * - 14 条文案，覆盖两周轮换
 * - 中英文双语
 * - 守护系温度 (语气基准见 src/lib/elephant-tone.ts): 荣誉框架, 不说教, 不羞辱,
 *   禁碳足迹数值; "看见" 只用于守护语境 (与 home.dailyGreenQuietFirst 口径一致)
 */

export interface GuardianLine {
  /** 英文文案 */
  en: string;
  /** 中文文案 */
  zh: string;
}

/**
 * 14 条守护文案
 * 顺序固定，按日期轮换
 */
export const DAILY_GUARDIAN_LINES: GuardianLine[] = [
  {
    en: 'A forest keeps growing because you keep showing up. Your little elephant checked — it\'s true.',
    zh: '森林因为你每天都在，又悄悄长大了一点点。小象去看过，是真的。',
  },
  {
    en: 'What you kept today is more than money. It\'s a corner of quiet for the planet.',
    zh: '你今天留下的不只是钱，还有给地球的一小块安静。',
  },
  {
    en: 'Slow is okay. Guarding was never a race — the little elephant walks beside you, not ahead.',
    zh: '慢一点也没关系。守护从来不是比赛——小象走在你身边，不在你前面。',
  },
  {
    en: 'The planet can\'t say thank you. So this little elephant says it for everyone: thank you.',
    zh: '地球不会说谢谢。所以小象替它说：谢谢你呀。',
  },
  {
    en: 'The things you wanted are still out there. What you guarded — your own pace — is here.',
    zh: '想要的东西还在那里。你守住的自己的节奏，在这里。',
  },
  {
    en: 'Not every day needs to be spectacular. Showing up, like you did today, is the whole secret.',
    zh: '不是每天都要了不起。像今天这样一直在，就是全部的秘密。',
  },
  {
    en: 'Everything you keep is quietly becoming shade for someone, someday.',
    zh: '你留下的每一点，都在悄悄变成某个人某天的绿荫。',
  },
  {
    en: 'Guarding doesn\'t have to be perfect. Every honest look today counted — all of them.',
    zh: '守护不需要完美。今天每一次诚实的看见，都算数。',
  },
  {
    en: 'Other people\'s noise is theirs. Your quiet guarding is yours — and it\'s enough.',
    zh: '别人的热闹是别人的。你安静的守护是你自己的，已经足够。',
  },
  {
    en: 'This little elephant wrote today\'s guards in its ledger. Not one page will be lost.',
    zh: '小象把今天的守护都记在账本上啦，一页都不会丢。',
  },
  {
    en: 'Guarding isn\'t about wanting nothing. It\'s about making room for what you truly love.',
    zh: '守护不是什么都不想要，是把你真正喜欢的，留出位置来。',
  },
  {
    en: 'Rest well tonight. The little elephant has the door — tomorrow we guard again, together.',
    zh: '今晚好好休息。门有小象看着——明天我们再一起守护。',
  },
  {
    en: 'One green choice today, and the whole grove felt it. Nicely done.',
    zh: '今天一个绿色的选择，整片小树林都感觉到了。干得漂亮。',
  },
  {
    en: 'You don\'t have to guard alone. Symy is here — quietly, every single day.',
    zh: '守护不用一个人来。小象在的——安安静静，每一天都在。',
  },
];

/**
 * 根据日期获取今日守护文案 index
 * 按 UTC 日期计算，确保全球一致
 *
 * @param date 日期对象 (默认 new Date())
 * @returns 0-13 的 index
 */
export function getDailyGuardianIndex(date: Date = new Date()): number {
  // 用 UTC 日期的 day-of-year 作为 index
  const startOfYear = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
  const diff = date.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  return dayOfYear % DAILY_GUARDIAN_LINES.length;
}

/**
 * 获取仪式用的守护文案 (index N)
 */
export function getRitualGuardianLine(date: Date = new Date()): GuardianLine {
  return DAILY_GUARDIAN_LINES[getDailyGuardianIndex(date)];
}

/**
 * 获取主页用的守护文案 (index N+1, 不与仪式重复)
 */
export function getTodayGuardianLine(date: Date = new Date()): GuardianLine {
  const ritualIndex = getDailyGuardianIndex(date);
  const todayIndex = (ritualIndex + 1) % DAILY_GUARDIAN_LINES.length;
  return DAILY_GUARDIAN_LINES[todayIndex];
}

/**
 * 获取今日日期 key (YYYY-MM-DD, 本地时区)
 * 用于 localStorage 判断"今天是否已看过仪式"
 * 🔧 Round 115 fix: 用本地时区而非 UTC, 确保用户午夜后正确重置
 */
export function getTodayKey(date: Date = new Date()): string {
  // 使用本地时区的 YYYY-MM-DD
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 判断今天是否已经看过每日仪式
 *
 * @param storageKey localStorage key
 * @returns true = 今天还没看过 (需要显示), false = 今天已看过
 */
export function shouldShowDailyRitual(storageKey: string = 'symy-daily-ritual'): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const lastShown = localStorage.getItem(storageKey);
    const today = getTodayKey();
    return lastShown !== today;
      // safe to ignore: non-critical background operation, error already logged
  } catch {
            // safe to ignore: non-critical background operation, error already logged
    return false;
  }
}

/**
 * 标记今日仪式已看过
 */
export function markDailyRitualShown(storageKey: string = 'symy-daily-ritual'): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey, getTodayKey());
  } catch {
    // localStorage 不可用 — 静默失败，下次还会显示
  }
}
