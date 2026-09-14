import type { ShoppingClarifyCardData } from '@/app/api/chat/parts/shopping-clarify-turn';

export type { ShoppingClarifyCardData };

export interface ShoppingClarifyMessage {
  shoppingClarifyCard?: ShoppingClarifyCardData;
}
