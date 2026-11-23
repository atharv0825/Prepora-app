// Admin waitlist contract (M2-A2): list filters (from the URL) and the CSV export format.
// Data: public.waitlist through RLS (admins only) and public.admin_waitlist_by_country().
import { z } from "zod";
import type { Database, Tables } from "../db";

export type WaitlistEntry = Pick<Tables<"waitlist">, "id" | "email" | "country_code" | "source" | "created_at" | "invited_at">;

/** Waiting/invited counts per country; country_code null = unknown (generated type says string). */
export type WaitlistCountryCount = Omit<
  Database["public"]["Functions"]["admin_waitlist_by_country"]["Returns"][number],
  "country_code"
> & { country_code: string | null };

export const ADMIN_WAITLIST_PAGE_SIZE = 50;
export const waitlistStatuses = ["waiting", "invited", "all"] as const;
export type WaitlistStatus = (typeof waitlistStatuses)[number];

/** `country=unknown` selects entries without a country. */
export const UNKNOWN_COUNTRY = "unknown";

/** ?country=&status=&page=, parsed leniently (shareable links): invalid values are dropped. */
export const AdminWaitlistQuery = z.object({
  country: z
    .string()
    .trim()
    .transform((s) => (s.toLowerCase() === UNKNOWN_COUNTRY ? UNKNOWN_COUNTRY : s.toUpperCase()))
    .pipe(z.union([z.literal(UNKNOWN_COUNTRY), z.string().regex(/^[A-Z]{2}$/)]))
    .optional()
    .catch(undefined),
  status: z.enum(waitlistStatuses).catch("waiting").default("waiting"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});

export type AdminWaitlistQuery = z.infer<typeof AdminWaitlistQuery>;

export function parseAdminWaitlistQuery(params: Record<string, string | string[] | undefined>): AdminWaitlistQuery {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return AdminWaitlistQuery.parse({ country: first(params.country), status: first(params.status), page: first(params.page) });
}

/** Query string for links (list pages, CSV export); defaults are left out. */
export function adminWaitlistSearch(query: Partial<AdminWaitlistQuery>): string {
  const params = new URLSearchParams();
  if (query.country) params.set("country", query.country);
  if (query.status && query.status !== "waiting") params.set("status", query.status);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

// ── CSV ─────────────────────────────────────────────────────────────────────────────────────
export const WAITLIST_CSV_COLUMNS = ["email", "country_code", "source", "joined_at", "invited_at"] as const;

/**
 * One CSV field (RFC 4180): quoted when it contains a comma, quote or line break. Values starting
 * with = + - @ (or tab / carriage return) are prefixed with ' so spreadsheet apps don't run them
 * as formulas: emails and sources come from the public form.
 */
export function csvField(value: string | null | undefined): string {
  let v = value ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function waitlistCsvRow(entry: WaitlistEntry): string {
  return [entry.email, entry.country_code, entry.source, entry.created_at, entry.invited_at].map(csvField).join(",");
}

/** Header + rows, CRLF line endings (what Excel expects), UTF-8 BOM so Excel reads it as UTF-8. */
export function waitlistCsv(entries: readonly WaitlistEntry[]): string {
  return `﻿${[WAITLIST_CSV_COLUMNS.join(","), ...entries.map(waitlistCsvRow)].join("\r\n")}\r\n`;
}

/** "prepora-waitlist-VN-waiting-2026-11-23.csv" */
export function waitlistCsvFilename(query: Pick<AdminWaitlistQuery, "country" | "status">, today: string): string {
  return ["prepora-waitlist", query.country, query.status, today].filter(Boolean).join("-") + ".csv";
}
