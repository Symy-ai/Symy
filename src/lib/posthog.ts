/**
 * PostHog client singleton + analytics utilities
 *
 * Env vars:
 *   NEXT_PUBLIC_POSTHOG_KEY   — PostHog project API key (required for tracking)
 *   NEXT_PUBLIC_POSTHOG_HOST  — PostHog host (default: https://us.i.posthog.com)
 *
 * Cloud: leave host as default
 * Self-host: set NEXT_PUBLIC_POSTHOG_HOST to your instance URL
 */

import posthog, { type PostHog } from "posthog-js";

let client: PostHog | null = null;

// Sensitive key patterns for deep sanitization (F5 fix)
const SENSITIVE_PATTERNS = [
  // Identity
  "email", "phone", "mobile", "address", "ssn", "national_id",
  "dob", "birthdate", "birthday", "passport",
  // Credentials
  "password", "token", "secret", "apikey", "api_key", "authorization",
  "accesstoken", "refreshtoken", "cookie", "jwt", "session",
  // Financial
  "card", "credit", "iban", "swift", "salary", "income",
  "balance", "account_number",
  // Internal
  "userid", "user_id", "distinct_id",
];

function deepSanitize(obj: Record<string, unknown>, seen = new WeakSet()): Record<string, unknown> {
  if (!obj || typeof obj !== "object" || seen.has(obj)) return obj;
  seen.add(obj);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const lower = k.toLowerCase();
    const hit = SENSITIVE_PATTERNS.some((p) => lower.includes(p));
    if (hit) continue;
    out[k] = v && typeof v === "object" && !Array.isArray(v)
      ? deepSanitize(v as Record<string, unknown>, seen)
      : v;
  }
  return out;
}

/**
 * Initialize PostHog client (client-side only).
 * Returns null if key is not configured — all tracking calls become no-ops.
 */
export function initPostHog(): PostHog | null {
  if (typeof window === "undefined") return null;
  if (client) return client;

  const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

  if (!POSTHOG_KEY) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[PostHog] NEXT_PUBLIC_POSTHOG_KEY not set — tracking disabled"
      );
    }
    return null;
  }

  client = posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: "identified_only", // only capture person profiles after identify()
    persistence: "localStorage+cookie", // survive PWA restarts
    cross_subdomain_cookie: false,
    secure_cookie: typeof window !== "undefined" && window.location.protocol === "https:",
    autocapture: true, // auto-capture clicks, page views
    capture_pageview: true,
    capture_pageleave: true,
    disable_session_recording: false,
    // GDPR: mask inputs/text in session recording (aligned with Sentry replay)
    session_recording: {
      maskAllInputs: true,
      maskAllElementAttributes: true,
      blockSelector: '[data-ph-block], [class*="amount"], [class*="balance"], [class*="token"]',
      maskTextSelector: '[class*="message"], [class*="chat"], [class*="email"], [class*="amount"]',
    },
    // Respect Do Not Track
    respect_dnt: true,
    // Deep sanitize event properties — recursively strip PII (F5 fix)
    sanitize_properties: (props) => {
      if (!props || typeof props !== "object") return props;
      return deepSanitize(props as Record<string, unknown>);
    },
  });

  return client;
}

/**
 * Get the PostHog client (null if not initialized).
 */
export function getPostHog(): PostHog | null {
  return client;
}

/**
 * Track a custom event with properties.
 * No-op if PostHog is not initialized.
 */
export function track(
  event: string,
  properties?: Record<string, string | number | boolean | null | undefined>
) {
  const ph = getPostHog();
  if (!ph) return;
  ph.capture(event, properties);
}

/**
 * Identify a user with Supabase ID (GDPR-safe: no PII in traits).
 * PostHog sanitize_properties does NOT apply to identify() traits,
 * so we never pass email/phone/etc here. Use Supabase user ID as distinct_id
 * and join with auth.users table server-side if needed.
 */
export function identifyUser(userId: string) {
  const ph = getPostHog();
  if (!ph) return;
  ph.identify(userId);
}

/**
 * Reset user identity on logout.
 */
export function resetUser() {
  const ph = getPostHog();
  if (!ph) return;
  ph.reset();
}

/**
 * Set a person property (merged into user profile).
 */
export function setPersonProperties(
  properties: Record<string, string | number | boolean | null | undefined>
) {
  const ph = getPostHog();
  if (!ph) return;
  ph.setPersonProperties(properties);
}

// ============================================================
// Symy-specific event trackers
// ============================================================

export const symyEvents = {
  challengeCreated: (props: {
    challengeType: string;
    amount?: number;
    duration?: number;
  }) => track("challenge_created", props),

  challengeCompleted: (props: {
    challengeType: string;
    amount?: number;
    tokensEarned?: number;
  }) => track("challenge_completed", props),

  challengeDismissed: (props: { challengeType: string }) =>
    track("challenge_dismissed", props),

  challengeFailed: (props: { challengeType: string; reason?: string }) =>
    track("challenge_failed", props),

  chatMessageSent: (props: { mode?: string; hasChallengeContext?: boolean }) =>
    track("chat_message_sent", props),

  depositMade: (props: {
    amount: number;
    source: string; // 'challenge' | 'manual' | 'dream-fund'
    dreamFundId?: string;
  }) => track("deposit_made", props),

  butterflySessionStarted: (props: { isDemo?: boolean }) =>
    track("butterfly_session_started", props),

  butterflyChoiceSelected: (props: {
    chapterIndex: number;
    choiceId: string;
  }) => track("butterfly_choice_selected", props),

  userSignedUp: (props: { method: string }) =>
    track("user_signed_up", props),

  userLoggedIn: (props: { method: string }) => track("user_logged_in", props),

  dreamFundCreated: (props: { name: string; targetAmount?: number }) =>
    track("dream_fund_created", props),

  emailConnected: (props: { provider: string }) =>
    track("email_connected", props),

  gachaTriggered: (props: { source: string }) =>
    track("gacha_triggered", props),
} as const;
