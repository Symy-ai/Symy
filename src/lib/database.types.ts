/**
 * Symy AI — Supabase Database Types
 *
 * Auto-generated from Supabase PostgREST OpenAPI spec.
 * Source: https://fcgpxrujhnqramggupjm.supabase.co/rest/v1/
 *
 * ⚠️ DO NOT EDIT MANUALLY — run `python3 scripts/gen-types-from-api.py` to regenerate.
 *
 * Generated: 2026-07-11T09:29:44.559282
 * Tables: 22
 * Functions: 20
 */

/* eslint-disable @typescript-eslint/no-empty-object-type -- auto-generated file */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      active_challenges: {
        Row: {
      id: string;
      user_id: string;
      item_name: string;
      amount: number;
      challenge_type: 'quick_pass' | 'standard' | 'boss';
      status: 'active' | 'passed' | 'failed' | 'expired';
      created_at: string;
      completed_at: string | null;
      metadata: Json | null;
      updated_at: string;
      deposit_status: 'unsettled' | 'processing' | 'deposited' | 'skipped';
      deposited_at: string | null;
        };
        Insert: {
      id?: string | null;
      user_id: string;
      item_name: string;
      amount: number;
      challenge_type?: 'quick_pass' | 'standard' | 'boss' | null;
      status?: 'active' | 'passed' | 'failed' | 'expired' | null;
      created_at?: string | null;
      completed_at?: string | null;
      metadata?: Json | null;
      updated_at?: string | null;
      deposit_status?: 'unsettled' | 'processing' | 'deposited' | 'skipped' | null;
      deposited_at?: string | null;
        };
        Update: {
      id?: string | null;
      user_id?: string | null;
      item_name?: string | null;
      amount?: number | null;
      challenge_type?: 'quick_pass' | 'standard' | 'boss' | null;
      status?: 'active' | 'passed' | 'failed' | 'expired' | null;
      created_at?: string | null;
      completed_at?: string | null;
      metadata?: Json | null;
      updated_at?: string | null;
      deposit_status?: 'unsettled' | 'processing' | 'deposited' | 'skipped' | null;
      deposited_at?: string | null;
        };
        Relationships: [];
      };
      admin_audit_logs: {
        Row: {
      id: string;
      actor: string;
      route: string;
      method: string;
      action: string | null;
      target_user_id: string | null;
      request_body: Json | null;
      request_query: Json | null;
      status_code: number;
      response_summary: string | null;
      error_message: string | null;
      ip_address: string | null;
      user_agent: string | null;
      request_id: string | null;
      created_at: string;
        };
        Insert: {
      id?: string | null;
      actor: string;
      route: string;
      method: string;
      action?: string | null;
      target_user_id?: string | null;
      request_body?: Json | null;
      request_query?: Json | null;
      status_code: number;
      response_summary?: string | null;
      error_message?: string | null;
      ip_address?: string | null;
      user_agent?: string | null;
      request_id?: string | null;
      created_at?: string | null;
        };
        Update: {
      id?: string | null;
      actor?: string | null;
      route?: string | null;
      method?: string | null;
      action?: string | null;
      target_user_id?: string | null;
      request_body?: Json | null;
      request_query?: Json | null;
      status_code?: number | null;
      response_summary?: string | null;
      error_message?: string | null;
      ip_address?: string | null;
      user_agent?: string | null;
      request_id?: string | null;
      created_at?: string | null;
        };
        Relationships: [];
      };
      admin_jobs: {
        Row: {
      id: string;
      job_type: 'embeddings_backfill' | 'cultivation_reassess' | 'challenge_cleanup' | 'expired_challenge_cleanup';
      user_id: string | null;
      status: 'pending' | 'running' | 'completed' | 'failed';
      error: string | null;
      metadata: Json | null;
      created_at: string;
      updated_at: string;
      completed_at: string | null;
        };
        Insert: {
      id?: string | null;
      job_type: 'embeddings_backfill' | 'cultivation_reassess' | 'challenge_cleanup' | 'expired_challenge_cleanup';
      user_id?: string | null;
      status?: 'pending' | 'running' | 'completed' | 'failed' | null;
      error?: string | null;
      metadata?: Json | null;
      created_at?: string | null;
      updated_at?: string | null;
      completed_at?: string | null;
        };
        Update: {
      id?: string | null;
      job_type?: 'embeddings_backfill' | 'cultivation_reassess' | 'challenge_cleanup' | 'expired_challenge_cleanup' | null;
      user_id?: string | null;
      status?: 'pending' | 'running' | 'completed' | 'failed' | null;
      error?: string | null;
      metadata?: Json | null;
      created_at?: string | null;
      updated_at?: string | null;
      completed_at?: string | null;
        };
        Relationships: [];
      };
      ai_audit_logs: {
        Row: {
      id: string;
      user_id: string;
      action: 'consume_recommend' | 'consume_intercept' | 'tool_call' | 'challenge_judge' | 'constitution_violation';
      risk_level: 'low' | 'medium' | 'high';
      user_input: string | null;
      ai_output: string | null;
      tool_calls: Json | null;
      context: Json | null;
      ai_path: string | null;
      agent_id: string | null;
      compensated: boolean | null;
      review_status: 'pending' | 'reviewed_ok' | 'reviewed_violation';
      review_note: string | null;
      reviewed_at: string | null;
      created_at: string;
        };
        Insert: {
      id?: string | null;
      user_id: string;
      action: 'consume_recommend' | 'consume_intercept' | 'tool_call' | 'challenge_judge' | 'constitution_violation';
      risk_level?: 'low' | 'medium' | 'high' | null;
      user_input?: string | null;
      ai_output?: string | null;
      tool_calls?: Json | null;
      context?: Json | null;
      ai_path?: string | null;
      agent_id?: string | null;
      compensated?: boolean | null;
      review_status?: 'pending' | 'reviewed_ok' | 'reviewed_violation' | null;
      review_note?: string | null;
      reviewed_at?: string | null;
      created_at?: string | null;
        };
        Update: {
      id?: string | null;
      user_id?: string | null;
      action?: 'consume_recommend' | 'consume_intercept' | 'tool_call' | 'challenge_judge' | 'constitution_violation' | null;
      risk_level?: 'low' | 'medium' | 'high' | null;
      user_input?: string | null;
      ai_output?: string | null;
      tool_calls?: Json | null;
      context?: Json | null;
      ai_path?: string | null;
      agent_id?: string | null;
      compensated?: boolean | null;
      review_status?: 'pending' | 'reviewed_ok' | 'reviewed_violation' | null;
      review_note?: string | null;
      reviewed_at?: string | null;
      created_at?: string | null;
        };
        Relationships: [];
      };
      app_config: {
        Row: {
      key: string;
      value: string;
      notes: string | null;
        };
        Insert: {
      key: string;
      value: string;
      notes?: string | null;
        };
        Update: {
      key?: string | null;
      value?: string | null;
      notes?: string | null;
        };
        Relationships: [];
      };
      buddy_state: {
        Row: {
      user_id: string;
      vitality: number;
      tokens: number;
      health: string;
      level: number;
      xp: number;
      xp_to_next: number;
      streak: number;
      // 🔧 Round 126: dream_funds JSONB column dropped (migration 103) — dream_funds table is sole source of truth
      badges: Json;
      total_saved: number;
      challenges_completed: number;
      last_drain_at: string;
      updated_at: string;
      last_healing_kit_at: string | null;
      version: number;
      // 🔧 Round 126 用户决策 3: 合并为 daily_see_it_count/date (原 challenge_count/date + gacha_pulls_count/date)
      daily_see_it_count: number;
      daily_see_it_date: string | null;
      growth_stage: string | null;
      personality: string | null;
      intimacy: number | null;
      daily_needs: Json | null;
      proactive_messages: Json | null;
      personality_awakened_at: string | null;
      last_active_at: string | null;
        };
        Insert: {
      user_id: string;
      vitality?: number | null;
      tokens?: number | null;
      health?: string | null;
      level?: number | null;
      xp?: number | null;
      xp_to_next?: number | null;
      streak?: number | null;
      // 🔧 Round 126: dream_funds JSONB column dropped (migration 103)
      badges: Json;
      total_saved?: number | null;
      challenges_completed?: number | null;
      last_drain_at?: string | null;
      updated_at?: string | null;
      last_healing_kit_at?: string | null;
      version?: number | null;
      // 🔧 Round 126 用户决策 3: 合并为 daily_see_it_count/date
      daily_see_it_count?: number | null;
      daily_see_it_date?: string | null;
      growth_stage?: string | null;
      personality?: string | null;
      intimacy?: number | null;
      daily_needs?: Json | null;
      proactive_messages?: Json | null;
      personality_awakened_at?: string | null;
      last_active_at?: string | null;
        };
        Update: {
      user_id?: string | null;
      vitality?: number | null;
      tokens?: number | null;
      health?: string | null;
      level?: number | null;
      xp?: number | null;
      xp_to_next?: number | null;
      streak?: number | null;
      // 🔧 Round 126: dream_funds JSONB column dropped (migration 103)
      badges?: Json | null;
      total_saved?: number | null;
      challenges_completed?: number | null;
      last_drain_at?: string | null;
      updated_at?: string | null;
      last_healing_kit_at?: string | null;
      version?: number | null;
      // 🔧 Round 126 用户决策 3: 合并为 daily_see_it_count/date
      daily_see_it_count?: number | null;
      daily_see_it_date?: string | null;
      growth_stage?: string | null;
      personality?: string | null;
      intimacy?: number | null;
      daily_needs?: Json | null;
      proactive_messages?: Json | null;
      personality_awakened_at?: string | null;
      last_active_at?: string | null;
        };
        Relationships: [];
      };
      butterfly_sessions: {
        Row: {
      id: string;
      user_id: string;
      decision_type: string;
      decision_description: string;
      amount: number | null;
      platform: string | null;
      context: string | null;
      outline: Json | null;
      current_chapter: number;
      chapters: Json;
      choices: Json;
      status: string;
      created_at: string;
      updated_at: string;
      butterfly_effect: string | null;
      final_tone: string | null;
      is_example: boolean;
      is_bookmarked: boolean | null;  // 🔧 2026-07-17 (migration 118)
        };
        Insert: {
      id?: string | null;
      user_id: string;
      decision_type: string;
      decision_description: string;
      amount?: number | null;
      platform?: string | null;
      context?: string | null;
      outline?: Json | null;
      current_chapter?: number | null;
      chapters: Json;
      choices: Json;
      status?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
      butterfly_effect?: string | null;
      final_tone?: string | null;
      is_example?: boolean | null;
      is_bookmarked?: boolean | null;  // 🔧 2026-07-17 (migration 118)
        };
        Update: {
      id?: string | null;
      user_id?: string | null;
      decision_type?: string | null;
      decision_description?: string | null;
      amount?: number | null;
      platform?: string | null;
      context?: string | null;
      outline?: Json | null;
      current_chapter?: number | null;
      chapters?: Json | null;
      choices?: Json | null;
      status?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
      butterfly_effect?: string | null;
      final_tone?: string | null;
      is_example?: boolean | null;
      is_bookmarked?: boolean | null;  // 🔧 2026-07-17 (migration 118)
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
      id: string;
      user_id: string;
      role: string;
      content: string;
      reasoning: string | null;
      created_at: string;
      mode: string;
        };
        Insert: {
      id?: string | null;
      user_id: string;
      role: string;
      content: string;
      reasoning?: string | null;
      created_at?: string | null;
      mode?: string | null;
        };
        Update: {
      id?: string | null;
      user_id?: string | null;
      role?: string | null;
      content?: string | null;
      reasoning?: string | null;
      created_at?: string | null;
      mode?: string | null;
        };
        Relationships: [];
      };
      daily_reflections: {
        Row: {
      id: string;
      user_id: string | null;
      avatar: string;
      text: string;
      text_zh: string | null;
      resonates: number;
      is_seed: boolean;
      created_at: string;
        };
        Insert: {
      id?: string | null;
      user_id?: string | null;
      avatar?: string | null;
      text?: string | null;
      text_zh?: string | null;
      resonates?: number | null;
      is_seed?: boolean | null;
      created_at?: string | null;
        };
        Update: {
      id?: string | null;
      user_id?: string | null;
      avatar?: string | null;
      text?: string | null;
      text_zh?: string | null;
      resonates?: number | null;
      is_seed?: boolean | null;
      created_at?: string | null;
        };
        Relationships: [];
      };
      daily_reflection_votes: {
        Row: {
      reflection_id: string;
      user_id: string;
      created_at: string;
        };
        Insert: {
      reflection_id?: string | null;
      user_id?: string | null;
      created_at?: string | null;
        };
        Update: {
      reflection_id?: string | null;
      user_id?: string | null;
      created_at?: string | null;
        };
        Relationships: [];
      };
      daily_stats: {
        Row: {
      id: string;
      user_id: string;
      date: string;
      total_events: number;
      impulse_count: number;
      total_amount: number;
      refund_count: number;
      saved_amount: number;
      created_at: string;
        };
        Insert: {
      id?: string | null;
      user_id: string;
      date: string;
      total_events?: number | null;
      impulse_count?: number | null;
      total_amount?: number | null;
      refund_count?: number | null;
      saved_amount?: number | null;
      created_at?: string | null;
        };
        Update: {
      id?: string | null;
      user_id?: string | null;
      date?: string | null;
      total_events?: number | null;
      impulse_count?: number | null;
      total_amount?: number | null;
      refund_count?: number | null;
      saved_amount?: number | null;
      created_at?: string | null;
        };
        Relationships: [];
      };
      distributed_locks: {
        Row: {
      key: string;
      value: Json;
      expires_at: string;
      created_at: string;
        };
        Insert: {
      key: string;
      value: Json;
      expires_at: string;
      created_at?: string | null;
        };
        Update: {
      key?: string | null;
      value?: Json | null;
      expires_at?: string | null;
      created_at?: string | null;
        };
        Relationships: [];
      };
      dream_funds: {
        Row: {
      id: string;
      user_id: string;
      fund_id: string;
      name: string;
      target: number;
      current: number;
      emoji: string;
      sort_order: number;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string | null;
      user_id: string;
      fund_id: string;
      name?: string | null;
      target?: number | null;
      current?: number | null;
      emoji?: string | null;
      sort_order?: number | null;
      created_at?: string | null;
      updated_at?: string | null;
        };
        Update: {
      id?: string | null;
      user_id?: string | null;
      fund_id?: string | null;
      name?: string | null;
      target?: number | null;
      current?: number | null;
      emoji?: string | null;
      sort_order?: number | null;
      created_at?: string | null;
      updated_at?: string | null;
        };
        Relationships: [];
      };
      email_connections: {
        Row: {
      id: string;
      user_id: string;
      email_address: string;
      provider: string;  // 🔧 Round 123: CHECK allows 'gmail', 'outlook', or 'imap_%' — use string to match DB constraint
      access_token: string;
      refresh_token: string | null;
      token_expiry: string | null;
      scopes: string[];
      status: 'active' | 'expired' | 'revoked' | 'error' | 'pending';
      last_sync_at: string | null;
      last_history_id: string | null;
      error_message: string | null;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string | null;
      user_id: string;
      email_address: string;
      provider?: string | null;  // 🔧 Round 123: string to match DB CHECK constraint
      access_token: string;
      refresh_token?: string | null;
      token_expiry?: string | null;
      scopes: string[];
      status?: 'active' | 'expired' | 'revoked' | 'error' | 'pending' | null;
      last_sync_at?: string | null;
      last_history_id?: string | null;
      error_message?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
        };
        Update: {
      id?: string | null;
      user_id?: string | null;
      email_address?: string | null;
      provider?: string | null;  // 🔧 Round 123: string to match DB CHECK constraint
      access_token?: string | null;
      refresh_token?: string | null;
      token_expiry?: string | null;
      scopes?: string[] | null;
      status?: 'active' | 'expired' | 'revoked' | 'error' | 'pending' | null;
      last_sync_at?: string | null;
      last_history_id?: string | null;
      error_message?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
        };
        Relationships: [];
      };
      email_receipts: {
        Row: {
      id: string;
      user_id: string;
      connection_id: string;
      message_id: string;
      thread_id: string | null;
      from_address: string | null;
      subject: string | null;
      snippet: string | null;
      platform: string | null;
      order_id: string | null;
      item_name: string | null;
      amount: number | null;
      currency: string | null;
      received_at: string | null;
      impulse_score: number;
      refund_eligible: boolean;
      refund_deadline: string | null;
      status: 'detected' | 'actionable' | 'ignored' | 'refunding' | 'refunded';
      created_at: string;
        };
        Insert: {
      id?: string | null;
      user_id: string;
      connection_id: string;
      message_id: string;
      thread_id?: string | null;
      from_address?: string | null;
      subject?: string | null;
      snippet?: string | null;
      platform?: string | null;
      order_id?: string | null;
      item_name?: string | null;
      amount?: number | null;
      currency?: string | null;
      received_at?: string | null;
      impulse_score?: number | null;
      refund_eligible?: boolean | null;
      refund_deadline?: string | null;
      status?: 'detected' | 'actionable' | 'ignored' | 'refunding' | 'refunded' | null;
      created_at?: string | null;
        };
        Update: {
      id?: string | null;
      user_id?: string | null;
      connection_id?: string | null;
      message_id?: string | null;
      thread_id?: string | null;
      from_address?: string | null;
      subject?: string | null;
      snippet?: string | null;
      platform?: string | null;
      order_id?: string | null;
      item_name?: string | null;
      amount?: number | null;
      currency?: string | null;
      received_at?: string | null;
      impulse_score?: number | null;
      refund_eligible?: boolean | null;
      refund_deadline?: string | null;
      status?: 'detected' | 'actionable' | 'ignored' | 'refunding' | 'refunded' | null;
      created_at?: string | null;
        };
        Relationships: [];
      };
      heal_sessions: {
        Row: {
      id: string;
      user_id: string;
      event_id: string | null;
      platform: string | null;
      amount: number | null;
      messages: Json;
      technique: string | null;
      resolved: boolean;
      model_used: string | null;
      token_count: number;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string | null;
      user_id: string;
      event_id?: string | null;
      platform?: string | null;
      amount?: number | null;
      messages: Json;
      technique?: string | null;
      resolved?: boolean | null;
      model_used?: string | null;
      token_count?: number | null;
      created_at?: string | null;
      updated_at?: string | null;
        };
        Update: {
      id?: string | null;
      user_id?: string | null;
      event_id?: string | null;
      platform?: string | null;
      amount?: number | null;
      messages?: Json | null;
      technique?: string | null;
      resolved?: boolean | null;
      model_used?: string | null;
      token_count?: number | null;
      created_at?: string | null;
      updated_at?: string | null;
        };
        Relationships: [];
      };
      health_events: {
        Row: {
      id: string;
      user_id: string;
      event_type: 'impulse_damage' | 'impulse_confessed' | 'mindful_recovery' | 'refund_boost' | 'challenge_reward' | 'challenge_completed' | 'challenge_failed' | 'passive_recovery' | 'drain' | 'revive' | 'manual_adjustment' | 'butterfly_completed' | 'butterfly_chapter_viewed' | 'invitation_reward_failed';
      vitality_change: number;
      new_vitality: number;
      token_change: number;
      trigger_source: string;
      trigger_id: string | null;
      description: string;
      metadata: Json | null;
      created_at: string;
        };
        Insert: {
      id?: string | null;
      user_id: string;
      event_type: 'impulse_damage' | 'impulse_confessed' | 'mindful_recovery' | 'refund_boost' | 'challenge_reward' | 'challenge_completed' | 'challenge_failed' | 'passive_recovery' | 'drain' | 'revive' | 'manual_adjustment' | 'butterfly_completed' | 'butterfly_chapter_viewed' | 'invitation_reward_failed';
      vitality_change: number;
      new_vitality: number;
      token_change?: number | null;
      trigger_source: string;
      trigger_id?: string | null;
      description: string;
      metadata?: Json | null;
      created_at?: string | null;
        };
        Update: {
      id?: string | null;
      user_id?: string | null;
      event_type?: 'impulse_damage' | 'impulse_confessed' | 'mindful_recovery' | 'refund_boost' | 'challenge_reward' | 'challenge_completed' | 'challenge_failed' | 'passive_recovery' | 'drain' | 'revive' | 'manual_adjustment' | 'butterfly_completed' | 'butterfly_chapter_viewed' | 'invitation_reward_failed' | null;
      vitality_change?: number | null;
      new_vitality?: number | null;
      token_change?: number | null;
      trigger_source?: string | null;
      trigger_id?: string | null;
      description?: string | null;
      metadata?: Json | null;
      created_at?: string | null;
        };
        Relationships: [];
      };
      impulse_events: {
        Row: {
      id: string;
      user_id: string;
      platform: string;
      source: 'notification' | 'accessibility' | 'patrol' | 'manual';
      title: string | null;
      amount: number | null;
      category: string | null;
      is_livestream: boolean;
      is_flash_sale: boolean;
      impulse_score: number;
      reasons: Json;
      raw_text: string | null;
      created_at: string;
      receipt_id: string | null;
        };
        Insert: {
      id?: string | null;
      user_id: string;
      platform: string;
      source?: 'notification' | 'accessibility' | 'patrol' | 'manual' | null;
      title?: string | null;
      amount?: number | null;
      category?: string | null;
      is_livestream?: boolean | null;
      is_flash_sale?: boolean | null;
      impulse_score?: number | null;
      reasons: Json;
      raw_text?: string | null;
      created_at?: string | null;
      receipt_id?: string | null;
        };
        Update: {
      id?: string | null;
      user_id?: string | null;
      platform?: string | null;
      source?: 'notification' | 'accessibility' | 'patrol' | 'manual' | null;
      title?: string | null;
      amount?: number | null;
      category?: string | null;
      is_livestream?: boolean | null;
      is_flash_sale?: boolean | null;
      impulse_score?: number | null;
      reasons?: Json | null;
      raw_text?: string | null;
      created_at?: string | null;
      receipt_id?: string | null;
        };
        Relationships: [];
      };
      invitations: {
        Row: {
      id: string;
      referrer_user_id: string;
      referee_user_id: string;
      referee_email: string | null;
      status: string;
      reward_amount: number;
      created_at: string;
      completed_at: string | null;
        };
        Insert: {
      id?: string | null;
      referrer_user_id: string;
      referee_user_id: string;
      referee_email?: string | null;
      status?: string | null;
      reward_amount?: number | null;
      created_at?: string | null;
      completed_at?: string | null;
        };
        Update: {
      id?: string | null;
      referrer_user_id?: string | null;
      referee_user_id?: string | null;
      referee_email?: string | null;
      status?: string | null;
      reward_amount?: number | null;
      created_at?: string | null;
      completed_at?: string | null;
        };
        Relationships: [];
      };
      // Round 96: 群体防御网络
      community_challenges: {
        Row: {
      id: string;
      title: string;
      title_key: string | null;
      description: string | null;
      platform: string | null;
      max_amount: number | null;
      start_date: string;
      end_date: string;
      is_active: boolean | null;
      created_at: string | null;
        };
        Insert: {
      id?: string | null;
      title: string;
      title_key?: string | null;
      description?: string | null;
      platform?: string | null;
      max_amount?: number | null;
      start_date: string;
      end_date: string;
      is_active?: boolean | null;
      created_at?: string | null;
        };
        Update: {
      id?: string | null;
      title?: string | null;
      title_key?: string | null;
      description?: string | null;
      platform?: string | null;
      max_amount?: number | null;
      start_date?: string | null;
      end_date?: string | null;
      is_active?: boolean | null;
      created_at?: string | null;
        };
        Relationships: [];
      };
      challenge_participants: {
        Row: {
      id: string;
      challenge_id: string;
      user_id: string;
      joined_at: string | null;
      status: string | null;
      current_day: number | null;
      last_checkin_date: string | null;
        };
        Insert: {
      id?: string | null;
      challenge_id: string;
      user_id: string;
      joined_at?: string | null;
      status?: string | null;
      current_day?: number | null;
      last_checkin_date?: string | null;
        };
        Update: {
      id?: string | null;
      challenge_id?: string | null;
      user_id?: string | null;
      joined_at?: string | null;
      status?: string | null;
      current_day?: number | null;
      last_checkin_date?: string | null;
        };
        Relationships: [];
      };
      cart_lines: {
        Row: {
      id: string;
      user_ref: string;
      product_ref: string;
      title: string;
      price_cents: number;
      currency: string;
      qty: number;
      image_url: string | null;
      updated_at: string | null;
        };
        Insert: {
      id?: string | null;
      user_ref: string;
      product_ref: string;
      title: string;
      price_cents: number;
      currency?: string | null;
      qty?: number | null;
      image_url?: string | null;
      updated_at?: string | null;
        };
        Update: {
      id?: string | null;
      user_ref?: string | null;
      product_ref?: string | null;
      title?: string | null;
      price_cents?: number | null;
      currency?: string | null;
      qty?: number | null;
      image_url?: string | null;
      updated_at?: string | null;
        };
        Relationships: [];
      };
      shopping_facts: {
        Row: {
      id: string;
      user_id: string;
      category: string;
      key: string;
      value: string;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string | null;
      user_id: string;
      category: string;
      key: string;
      value: string;
      created_at?: string | null;
      updated_at?: string | null;
        };
        Update: {
      id?: string | null;
      user_id?: string | null;
      category?: string | null;
      key?: string | null;
      value?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
        };
        Relationships: [];
      };
      premium_waitlist: {
        Row: {
      user_id: string;
      email: string;
      created_at: string;
        };
        Insert: {
      user_id: string;
      email: string;
      created_at?: string | null;
        };
        Update: {
      user_id?: string | null;
      email?: string | null;
      created_at?: string | null;
        };
        Relationships: [];
      };
      landing_waitlist: {
        Row: {
      id: string;
      email: string;
      source: string;
      is_registered: boolean;
      registered_user_id: string | null;
      registered_at: string | null;
      created_at: string;
        };
        Insert: {
      id?: string | null;
      email: string;
      source?: string | null;
      is_registered?: boolean | null;
      registered_user_id?: string | null;
      registered_at?: string | null;
      created_at?: string | null;
        };
        Update: {
      id?: string | null;
      email?: string | null;
      source?: string | null;
      is_registered?: boolean | null;
      registered_user_id?: string | null;
      registered_at?: string | null;
      created_at?: string | null;
        };
        Relationships: [];
      };
      inward_why_wall: {
        Row: {
      id: string;
      user_id: string | null;
      content: string;
      is_anonymous: boolean;
      display_order: number;
      is_featured: boolean;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string | null;
      user_id?: string | null;
      content: string;
      is_anonymous?: boolean | null;
      display_order?: number | null;
      is_featured?: boolean | null;
      created_at?: string | null;
      updated_at?: string | null;
        };
        Update: {
      id?: string | null;
      user_id?: string | null;
      content?: string | null;
      is_anonymous?: boolean | null;
      display_order?: number | null;
      is_featured?: boolean | null;
      created_at?: string | null;
      updated_at?: string | null;
        };
        Relationships: [];
      };
      inward_daily_reflection: {
        Row: {
      id: string;
      user_id: string | null;
      prompt_key: string;
      content: string;
      is_anonymous: boolean;
      resonates_count: number;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string | null;
      user_id?: string | null;
      prompt_key: string;
      content: string;
      is_anonymous?: boolean | null;
      resonates_count?: number | null;
      created_at?: string | null;
      updated_at?: string | null;
        };
        Update: {
      id?: string | null;
      user_id?: string | null;
      prompt_key?: string | null;
      content?: string | null;
      is_anonymous?: boolean | null;
      resonates_count?: number | null;
      created_at?: string | null;
      updated_at?: string | null;
        };
        Relationships: [];
      };
      inward_reflection_resonates: {
        Row: {
      id: string;
      reflection_id: string;
      user_id: string | null;
      created_at: string;
        };
        Insert: {
      id?: string | null;
      reflection_id: string;
      user_id?: string | null;
      created_at?: string | null;
        };
        Update: {
      id?: string | null;
      reflection_id?: string | null;
      user_id?: string | null;
      created_at?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
      id: string;
      email: string | null;
      display_name: string | null;
      avatar_url: string | null;
      plan: 'free' | 'premium';
      avg_amount: number;
      timezone: string;
      created_at: string;
      updated_at: string;
      onboarding_completed: boolean;
      letta_agent_id: string | null;
      locale: string | null;
      last_ritual_at: string | null;
      hourly_rate: number;
      ref_code: string | null;
      trial_until: string | null;  // 🔧 2026-07-17 (migration 119): 7-day VIP trial
      banned: boolean | null;
      banned_until: string | null;
      banned_reason: string | null;
        };
        Insert: {
      id: string;
      email?: string | null;
      display_name?: string | null;
      avatar_url?: string | null;
      plan?: 'free' | 'premium' | null;
      avg_amount?: number | null;
      timezone?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
      onboarding_completed?: boolean | null;
      letta_agent_id?: string | null;
      locale?: string | null;
      last_ritual_at?: string | null;
      hourly_rate?: number | null;
      ref_code?: string | null;
      trial_until?: string | null;  // 🔧 2026-07-17 (migration 119)
      banned?: boolean | null;
      banned_until?: string | null;
      banned_reason?: string | null;
        };
        Update: {
      id?: string | null;
      email?: string | null;
      display_name?: string | null;
      avatar_url?: string | null;
      plan?: 'free' | 'premium' | null;
      avg_amount?: number | null;
      timezone?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
      onboarding_completed?: boolean | null;
      letta_agent_id?: string | null;
      locale?: string | null;
      last_ritual_at?: string | null;
      hourly_rate?: number | null;
      ref_code?: string | null;
      trial_until?: string | null;  // 🔧 2026-07-17 (migration 119)
      banned?: boolean | null;
      banned_until?: string | null;
      banned_reason?: string | null;
        };
        Relationships: [];
      };
      refund_requests: {
        Row: {
      id: string;
      user_id: string;
      event_id: string | null;
      platform: string;
      order_id: string | null;
      item_name: string | null;
      refund_reason: string | null;
      refund_amount: number | null;
      status: 'pending' | 'submitted' | 'confirmed' | 'rejected' | 'error';
      created_at: string;
      completed_at: string | null;
        };
        Insert: {
      id?: string | null;
      user_id: string;
      event_id?: string | null;
      platform: string;
      order_id?: string | null;
      item_name?: string | null;
      refund_reason?: string | null;
      refund_amount?: number | null;
      status?: 'pending' | 'submitted' | 'confirmed' | 'rejected' | 'error' | null;
      created_at?: string | null;
      completed_at?: string | null;
        };
        Update: {
      id?: string | null;
      user_id?: string | null;
      event_id?: string | null;
      platform?: string | null;
      order_id?: string | null;
      item_name?: string | null;
      refund_reason?: string | null;
      refund_amount?: number | null;
      status?: 'pending' | 'submitted' | 'confirmed' | 'rejected' | 'error' | null;
      created_at?: string | null;
      completed_at?: string | null;
        };
        Relationships: [];
      };
      user_embeddings: {
        Row: {
      id: string;
      user_id: string;
      source_type: 'impulse_event' | 'email_receipt' | 'chat_message';
      source_id: string;
      content: string;
      metadata: Json;
      embedding: number[];
      embedded_at: string;
        };
        Insert: {
      id?: string | null;
      user_id: string;
      source_type: 'impulse_event' | 'email_receipt' | 'chat_message';
      source_id: string;
      content: string;
      metadata: Json;
      embedding: number[];
      embedded_at?: string | null;
        };
        Update: {
      id?: string | null;
      user_id?: string | null;
      source_type?: 'impulse_event' | 'email_receipt' | 'chat_message' | null;
      source_id?: string | null;
      content?: string | null;
      metadata?: Json | null;
      embedding?: number[] | null;
      embedded_at?: string | null;
        };
        Relationships: [];
      };
      user_intervention_profile: {
        Row: {
      user_id: string;
      severity_tier: 'severe' | 'moderate' | 'light';
      cultivation_stage: 'zhi_yu' | 'zhi_zhi' | 'cheng_yi' | 'zheng_xin';
      stage_entered_at: string;
      weekly_impulse_count: number;
      weekly_total_amount: number;
      weekly_avg_impulse_score: number;
      weekly_refund_count: number;
      monthly_impulse_count: number;
      monthly_resisted_count: number;
      monthly_challenge_pass_rate: number;
      self_reported_severity: 'none' | 'mild' | 'moderate' | 'severe' | null;
      self_reported_debt: number | null;
      self_reported_triggers: string[] | null;
      responsive_interventions: string[] | null;
      unresponsive_interventions: string[] | null;
      stage_assessment_history: Json;
      last_reassessed_at: string;
      professional_referral_recommended: boolean;
      referral_reason: string | null;
      updated_at: string;
        };
        Insert: {
      user_id: string;
      severity_tier?: 'severe' | 'moderate' | 'light' | null;
      cultivation_stage?: 'zhi_yu' | 'zhi_zhi' | 'cheng_yi' | 'zheng_xin' | null;
      stage_entered_at?: string | null;
      weekly_impulse_count?: number | null;
      weekly_total_amount?: number | null;
      weekly_avg_impulse_score?: number | null;
      weekly_refund_count?: number | null;
      monthly_impulse_count?: number | null;
      monthly_resisted_count?: number | null;
      monthly_challenge_pass_rate?: number | null;
      self_reported_severity?: 'none' | 'mild' | 'moderate' | 'severe' | null;
      self_reported_debt?: number | null;
      self_reported_triggers?: string[] | null;
      responsive_interventions?: string[] | null;
      unresponsive_interventions?: string[] | null;
      stage_assessment_history: Json;
      last_reassessed_at?: string | null;
      professional_referral_recommended?: boolean | null;
      referral_reason?: string | null;
      updated_at?: string | null;
        };
        Update: {
      user_id?: string | null;
      severity_tier?: 'severe' | 'moderate' | 'light' | null;
      cultivation_stage?: 'zhi_yu' | 'zhi_zhi' | 'cheng_yi' | 'zheng_xin' | null;
      stage_entered_at?: string | null;
      weekly_impulse_count?: number | null;
      weekly_total_amount?: number | null;
      weekly_avg_impulse_score?: number | null;
      weekly_refund_count?: number | null;
      monthly_impulse_count?: number | null;
      monthly_resisted_count?: number | null;
      monthly_challenge_pass_rate?: number | null;
      self_reported_severity?: 'none' | 'mild' | 'moderate' | 'severe' | null;
      self_reported_debt?: number | null;
      self_reported_triggers?: string[] | null;
      responsive_interventions?: string[] | null;
      unresponsive_interventions?: string[] | null;
      stage_assessment_history?: Json | null;
      last_reassessed_at?: string | null;
      professional_referral_recommended?: boolean | null;
      referral_reason?: string | null;
      updated_at?: string | null;
        };
        Relationships: [];
      };
      // 🔧 Round 133: Agent pool tables
      letta_agent_pool: {
        Row: {
          id: string;
          letta_agent_id: string;
          status: 'available' | 'assigned' | 'creating' | 'failed';
          assigned_to: string | null;
          created_at: string;
          assigned_at: string | null;
          failure_reason: string | null;
        };
        Insert: {
          id?: string;
          letta_agent_id: string;
          status?: 'available' | 'assigned' | 'creating' | 'failed';
          assigned_to?: string | null;
          created_at?: string;
          assigned_at?: string | null;
          failure_reason?: string | null;
        };
        Update: {
          id?: string;
          letta_agent_id?: string;
          status?: 'available' | 'assigned' | 'creating' | 'failed';
          assigned_to?: string | null;
          created_at?: string;
          assigned_at?: string | null;
          failure_reason?: string | null;
        };
        Relationships: [];
      };
      letta_agent_pool_config: {
        Row: {
          id: number;
          pool_size: number;
          initial_pool_size: number;
          last_cron_check: string | null;
          last_refill_at: string | null;
          last_doubled_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: number;
          pool_size?: number;
          initial_pool_size?: number;
          last_cron_check?: string | null;
          last_refill_at?: string | null;
          last_doubled_at?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: number;
          pool_size?: number;
          initial_pool_size?: number;
          last_cron_check?: string | null;
          last_refill_at?: string | null;
          last_doubled_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      // 🔧 2026-07-20 (migration 121): push_subscriptions — Web Push 通知订阅
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh_key: string;
          auth_key: string;
          preferences: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh_key: string;
          auth_key: string;
          preferences?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          endpoint?: string;
          p256dh_key?: string;
          auth_key?: string;
          preferences?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      // 🔧 2026-07-20 (migration 122): push_notification_log — 推送通知历史记录
      push_notification_log: {
        Row: {
          id: string;
          user_id: string;
          notification_type: string;
          reference_id: string | null;
          milestone: string | null;
          sent_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          notification_type: string;
          reference_id?: string | null;
          milestone?: string | null;
          sent_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          notification_type?: string;
          reference_id?: string | null;
          milestone?: string | null;
          sent_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      // 🔧 Round 126 用户决策 4: 手动添加 community views (migration 095)
      // ⚠️ 注意: Supabase 的类型推断在 Views 非空时会与 Tables 产生 union 类型冲突
      //    导致 286 个 TS 错误 (所有 .from(table) 调用都被影响)
      //    临时方案: Views 保持空, community 路由继续用 as never (已验证可工作)
      //    根因修复: 需要更新 gen-types 脚本正确生成 Views 类型
      // 🔧 ARCH fix (2026-07-21): Attempted to add Views types but confirmed the
      //    Supabase type conflict (286 TS errors). Reverted to empty Views.
      //    The community routes use 'as never' as a documented workaround.
      //    Architecture guard exempts community routes from the 'as never' check.
      // community_total_stats: { Row: {...}, Insert: never, Update: never },
      // community_platform_stats: { Row: {...}, Insert: never, Update: never },
    };
    Functions: {
      // 🔧 Round 133: Agent pool functions
      assign_pool_agent: {
        Args: { p_user_id: string };
        Returns: string | null;
      };
      get_available_agent_count: {
        Args: Record<string, never>;
        Returns: number;
      };
      add_proactive_message: {
        Args: {
          p_text_fallback?: string | null;
          p_text_key?: string | null;
          p_trigger?: string | null;
          p_user_id?: string | null;
        };
        Returns: unknown;
      };
      append_chapter: {
        Args: {
          p_session_id?: string;
          p_chapter?: Json;
          p_current_chapter?: number;
          p_choices?: Json | null;
        };
        Returns: Json;
      };
      apply_buddy_state_delta: {
        Args: {
          p_add_badges?: string[] | null;
          p_challenges_delta?: number | null;
          p_dream_fund_amount?: number | null;
          p_dream_fund_id?: string | null;
          p_level_override?: number | null;
          p_token_delta?: number | null;
          p_total_saved_delta?: number | null;
          p_user_id?: string | null;
          p_vitality_delta?: number | null;
          p_xp_delta?: number | null;
          p_xp_override?: number | null;
          p_xp_to_next_override?: number | null;
        };
        Returns: Json;
      };
      awaken_buddy_personality: {
        Args: {
          p_user_id?: string;
          p_personality?: string;
        };
        Returns: string;
      };
      bump_intimacy: {
        Args: {
          p_delta?: number | null;
          p_user_id?: string | null;
        };
        Returns: unknown;
      };
      complete_challenge_atomic: {
        Args: {
          p_add_badges?: string[] | null;
          p_challenge_id?: string | null;
          p_challenge_status?: string | null;
          p_challenges_delta?: number | null;
          p_completed_description?: string | null;
          p_completed_metadata?: Json | null;
          p_completed_trigger_id?: string | null;
          p_dream_fund_amount?: number | null;
          p_dream_fund_id?: string | null;
          p_reward_description?: string | null;
          p_reward_metadata?: Json | null;
          p_reward_trigger_id?: string | null;
          p_token_delta?: number | null;
          p_total_saved_delta?: number | null;
          p_user_id?: string | null;
          p_vitality_delta?: number | null;
          p_xp_delta?: number | null;
        };
        Returns: Json;
      };
      create_challenge_atomic: {
        Args: {
          p_amount?: number | null;
          p_item_name?: string | null;
          p_user_id?: string | null;
        };
        Returns: string;
      };
      create_weekly_challenges: {
        Args: {
          p_week_offset?: number | null;
        };
        Returns: undefined;
      };
      create_health_event_atomic: {
        Args: {
          p_add_badges?: string[] | null;
          p_description?: string | null;
          p_dream_fund_id?: string | null;
          p_event_type?: string | null;
          p_metadata?: Json | null;
          p_refund_amount?: number | null;
          p_token_change?: number | null;
          p_trigger_id?: string | null;
          p_trigger_source?: string | null;
          p_user_id?: string | null;
          p_vitality_change?: number | null;
        };
        Returns: Json;
      };
      decay_daily_needs: {
        Args: {
          p_decay_amount?: number | null;
          p_user_id?: string | null;
        };
        Returns: unknown;
      };
      decay_daily_needs_all: {
        Args: {
          p_decay_amount?: number | null;
        };
        Returns: unknown;
      };
      increment_buddy_state_version: {
        Args: {
          p_user_id?: string | null;
        };
        Returns: void;
      };
      increment_rate_limit: {
        Args: {
          p_key?: string | null;
          p_max_hits?: number | null;
          p_window_ms?: number | null;
        };
        Returns: Json;
      };
      mark_proactive_message_read: {
        Args: {
          p_user_id?: string;
          p_message_id?: string;
        };
        Returns: Json;
      };
      replenish_daily_need: {
        Args: {
          p_user_id?: string;
          p_need_type?: string;
          p_amount?: number;
        };
        Returns: Json;
      };
      resume_challenge_atomic: {
        Args: {
          p_challenge_id?: string | null;
          p_user_id?: string | null;
        };
        Returns: Json;
      };
      retrieve_user_context: {
        Args: {
          p_query_embedding?: number[];
          p_source_types?: ('impulse_event' | 'email_receipt' | 'chat_message')[] | null;
          p_top_k?: number | null;
          p_user_id?: string | null;
        };
        Returns: Json;
      };
      rls_auto_enable: {
        Args: Record<string, never>;
        Returns: void;
      };
      set_chapter_field: {
        Args: {
          p_session_id?: string;
          p_chapter_index?: number;
          p_field_name?: string;
          p_field_value?: Json;
        };
        Returns: boolean;
      };
      update_buddy_growth_stage: {
        Args: {
          p_user_id?: string | null;
        };
        Returns: unknown;
      };
      use_healing_kit: {
        Args: {
          p_timezone?: string | null;
          p_user_id?: string | null;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: {};
  };
}
