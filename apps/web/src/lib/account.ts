// Account display helpers (M1-F3). Pure, so they're unit-tested.

type Metadata = Record<string, unknown> | null | undefined;

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Name to show: the profile's name, else the name Google gave us, else the email. */
export function displayName(profileName: string | null | undefined, metadata: Metadata, email?: string | null): string {
  return text(profileName) ?? text(metadata?.full_name) ?? text(metadata?.name) ?? text(email) ?? "Account";
}

/** Up to two initials for the avatar: "Atharv Babar" → "AB", "asha" → "A", "x@y.com" → "X". */
export function initials(name: string): string {
  const words = name.split("@")[0]!.split(/[\s._-]+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0]![0], words[words.length - 1]![0]] : [words[0]?.[0]];
  return letters.filter(Boolean).join("").toUpperCase() || "?";
}
