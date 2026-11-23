// Admin users list contract (M2-A1). Backed by the admin-only RPCs public.admin_list_users and
// public.admin_get_user (SECURITY DEFINER, refuse non-admins with 42501).
import { z } from "zod";
import type { Database } from "../db";
import { plans } from "../types/profile";

type Functions = Database["public"]["Functions"];

// Generated RPC result types mark every column non-null (Postgres can't say otherwise for
// `returns table`); these columns really can be null, so they're widened here.
type WithNulls<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };

/** One row of the users list (total_count = matches across all pages). */
export type AdminUserRow = WithNulls<
  Functions["admin_list_users"]["Returns"][number],
  "email" | "full_name" | "country_code" | "last_sign_in_at"
>;
/** One user's profile for the detail page. */
export type AdminUserDetail = WithNulls<
  Functions["admin_get_user"]["Returns"][number],
  | "email"
  | "full_name"
  | "country_code"
  | "timezone"
  | "test_type"
  | "target_band"
  | "exam_date"
  | "last_sign_in_at"
  | "auth_provider"
>;

export const ADMIN_USERS_PAGE_SIZE = 25;
export const ADMIN_USERS_SEARCH_MAX = 100;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s || undefined)
    .optional()
    .catch(undefined);

/**
 * The list's URL query (?q=&country=&plan=&page=), parsed leniently: the page is a shareable
 * link, so anything invalid is dropped (falls back to "all") instead of erroring.
 */
export const AdminUsersQuery = z.object({
  q: optionalText(ADMIN_USERS_SEARCH_MAX),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional()
    .catch(undefined),
  plan: z.enum(plans).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});

export type AdminUsersQuery = z.infer<typeof AdminUsersQuery>;

/** First value of each search param (Next gives string | string[] | undefined). */
export function parseAdminUsersQuery(params: Record<string, string | string[] | undefined>): AdminUsersQuery {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return AdminUsersQuery.parse({
    q: first(params.q),
    country: first(params.country),
    plan: first(params.plan),
    page: first(params.page),
  });
}

/** RPC arguments for a parsed query. */
export function adminListUsersArgs(query: AdminUsersQuery): Functions["admin_list_users"]["Args"] {
  return {
    p_search: query.q,
    p_country: query.country,
    p_plan: query.plan,
    p_limit: ADMIN_USERS_PAGE_SIZE,
    p_offset: (query.page - 1) * ADMIN_USERS_PAGE_SIZE,
  };
}

/** The same query as a URL search string, without empty values (for links and pagination). */
export function adminUsersSearch(query: Partial<AdminUsersQuery>): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.country) params.set("country", query.country);
  if (query.plan) params.set("plan", query.plan);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / ADMIN_USERS_PAGE_SIZE));
}
