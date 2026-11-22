// PostHog event contract (Prepora_Implementation_Plan.md §7). Event names and their properties
// live here so the web app can only send events we've agreed on. Each milestone's contract step
// adds or adjusts entries; M0-I2 only defines them, nothing is captured yet.

import type { Database } from "./db";

type Plan = Database["public"]["Enums"]["plan_tier"]; // from the profiles migration (M1-C1)
type Module = "speaking" | "writing" | "reading" | "listening";
type Provider = "razorpay" | "paddle";

export interface AnalyticsEvents {
  landing_viewed: { country?: string; utm_source?: string; page: string };
  waitlist_joined: { country?: string; source: string };
  signup_completed: { method: string; country?: string };
  onboarding_completed: { test_type: string; target_band: number; exam_date?: string };
  module_opened: { module: Module };
  speaking_part_started: { part: 1 | 2 | 3; topic_id: string };
  speaking_part_completed: { part: 1 | 2 | 3; topic_id: string; duration_sec: number };
  speaking_feedback_viewed: { band: number };
  writing_submitted: { task_no: 1 | 2; input_mode: string };
  reading_test_completed: { test_id: string; raw_score: number; band: number; time_taken: number };
  listening_test_completed: { test_id: string; raw_score: number; band: number; time_taken: number };
  paywall_viewed: { trigger: string; plan_shown: Plan };
  checkout_started: { plan: Plan; period: string; currency: string; provider: Provider };
  subscription_started: SubscriptionProps;
  subscription_upgraded: SubscriptionProps;
  subscription_cancelled: SubscriptionProps;
  ai_request: { type: string; latency_ms: number; tokens: number; success: boolean };
  credits_spent: { action_key: string; credits: number; balance_after: number; plan: Plan };
  credits_exhausted: { action_key: string; plan: Plan; day_of_period: number };
  allowance_hit: { allowance: string; plan: Plan; day_of_period: number };
  topup_purchased: { pack: string; credits: number; price: number; currency: string };
  mic_permission_denied: { browser: string; os: string };
}

interface SubscriptionProps {
  plan: Plan;
  period: string;
  price: number;
  currency: string;
  provider: Provider;
}

export type AnalyticsEvent = keyof AnalyticsEvents;

/** Person properties set with `identify` after login (§7). */
export interface AnalyticsPerson {
  plan: Plan;
  test_type?: string;
  target_band?: number;
  country_code?: string;
  exam_date?: string;
}

export const analyticsEvents = [
  "landing_viewed",
  "waitlist_joined",
  "signup_completed",
  "onboarding_completed",
  "module_opened",
  "speaking_part_started",
  "speaking_part_completed",
  "speaking_feedback_viewed",
  "writing_submitted",
  "reading_test_completed",
  "listening_test_completed",
  "paywall_viewed",
  "checkout_started",
  "subscription_started",
  "subscription_upgraded",
  "subscription_cancelled",
  "ai_request",
  "credits_spent",
  "credits_exhausted",
  "allowance_hit",
  "topup_purchased",
  "mic_permission_denied",
] as const satisfies readonly AnalyticsEvent[];
