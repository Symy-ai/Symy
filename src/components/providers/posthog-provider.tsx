"use client";

/**
 * PostHog Provider — initializes PostHog on the client side.
 *
 * Mounted in the root layout, wraps the entire app.
 * Uses autocapture for automatic event collection.
 * Session Replay is enabled by default (can be disabled via env).
 */

import { useEffect, type ReactNode } from "react";
import { initPostHog } from "@/lib/posthog";

export function SymyAnalyticsProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  return <>{children}</>;
}
