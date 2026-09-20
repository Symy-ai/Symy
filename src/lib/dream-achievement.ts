import type { DreamFund } from '@/types/buddy-state';

export function isDreamFundAchieved(fund: DreamFund): boolean {
  return fund.id !== 'savings' && fund.target > 0 && fund.current >= fund.target;
}
