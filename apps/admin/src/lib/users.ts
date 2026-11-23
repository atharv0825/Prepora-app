// Display helpers for the users pages (M2-A1). Pure, unit-tested.

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** "IN" → "India"; unknown or missing → the code itself, or "—". */
export function countryName(code: string | null | undefined): string {
  if (!code) return "—";
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

/** "23 Nov 2026" (UTC, so every admin sees the same date); "—" when missing or invalid. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : dateFormat.format(d);
}

/** "23 Nov 2026, 14:05 UTC"; "Never" when the user hasn't signed in. */
export function formatDateTime(value: string | null | undefined, empty = "Never"): string {
  if (!value) return empty;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? empty : dateTimeFormat.format(d);
}

/** "free" → "Free". */
export function titleCase(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function testTypeLabel(value: string | null | undefined): string {
  if (value === "academic") return "Academic";
  if (value === "general") return "General Training";
  return "—";
}

export function bandLabel(value: number | null | undefined): string {
  return value == null ? "—" : value.toFixed(1);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
