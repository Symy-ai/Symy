export type DuplicatePrecheckCategory = 'electronics' | 'food' | 'home' | 'other';

export type DuplicatePrecheckDecision = 'reuse' | 'wait';

export interface DuplicatePrecheckCardData {
  itemTitle: string;
  category: DuplicatePrecheckCategory;
}

export interface DuplicatePrecheckEvent {
  id: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}
