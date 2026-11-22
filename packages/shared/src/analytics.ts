// PostHog event contract (Prepora_Implementation_Plan.md §7). Event names and their properties
// live here so the web app can only send events we've agreed on. Each milestone's contract step
// adds or adjusts entries; M0-I2 only defines them, nothing is captured yet.

import type { Plan, TestType } from "./types/profile";

/** How someone signed in. Google only (M1-B1); kept as a property so new methods stay comparable. */
export type AuthMethod = "google";
type Module = "speaking" | "writing" | "reading" | "listening";
type Provider = "razorpay" | "paddle";

export interface AnalyticsEvents {
  landing_viewed: { country?: string; utm_source?: string; page: string };
  /** Someone joined the waitlist (M2-C2). country = CF-IPCountry (ISO-2) when known; source = utm_source or the form location ("hero", "final_cta", "gate"). */
  waitlist_joined: { country?: string; source: string };
  /** First sign-in of a new account (profile just created). */
  signup_completed: { method: AuthMethod; country?: string };
  /** Every later sign-in. */
  login_completed: { method: AuthMethod };
  /** The 3-step onboarding was finished (M2-C2). exam_date null = skipped; days_to_exam for funnels without date maths. */
  onboarding_completed: {
    test_type: TestType;
    target_band: number;
    exam_date: string | null;
    days_to_exam: number | null;
  };
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
  "login_completed",
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

/** Auth events (M1-C2), sent by the web app after sign-in (M1-F1/F4). */
export const authEvents = ["signup_completed", "login_completed"] as const satisfies readonly AnalyticsEvent[];

/** Onboarding and waitlist events (M2-C2). */
export const onboardingEvents = ["onboarding_completed", "waitlist_joined"] as const satisfies readonly AnalyticsEvent[];
