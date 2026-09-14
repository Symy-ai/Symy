/**
 * Shared type definitions for Supabase tables
 *
 * Only the types actually used by application code are kept here.
 * The runtime `supabase` object was removed — it was never imported.
 * Actual DB operations use supabase-api.ts (API routes) or
 * supabase-browser.ts / supabase-admin.ts directly.
 */

export interface EmailConnection {
  id: string;
  user_id: string;
  email_address: string;
  provider: 'gmail' | 'outlook' | `imap_${string}`;
  access_token: string;
  refresh_token?: string;
  token_expiry: string;
  scopes: string[];
  status: 'active' | 'expired' | 'revoked' | 'error';
  last_sync_at?: string;
  last_history_id?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface EmailReceipt {
  id: string;
  user_id: string;
  connection_id: string;
  message_id: string;
  thread_id?: string;
  from_address: string;
  subject: string;
  snippet: string;
  platform: string;
  order_id?: string;
  item_name?: string;
  amount?: number;
  currency: string;
  received_at: string;
  impulse_score: number;
  refund_eligible: boolean;
  refund_deadline?: string;
  status: 'detected' | 'actionable' | 'refunding' | 'refunded' | 'ignored';
  created_at: string;
}
