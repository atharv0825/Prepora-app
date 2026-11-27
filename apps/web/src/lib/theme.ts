// Dark mode for the signed-in app. Light by default; the student can pick Dark, or System (follow
// the device), in the account menu. The choice is kept on this device (localStorage). The marketing site and the
// sign-in pages keep their light brand design.
//
// The `dark` class on <html> switches the design tokens (packages/ui globals.css). It's set by a
// tiny inline script before the app paints (no white flash), then kept in sync by ThemeProvider.

export const themes = ["system", "light", "dark"] as const;
export type Theme = (typeof themes)[number];
export const THEME_KEY = "prepora:theme";

/** Until the student chooses, the app is light. */
export const DEFAULT_THEME: Theme = "light";

/** A stored value → a theme (nothing stored, or anything unknown, is the default: light). */
export function parseTheme(value: string | null | undefined): Theme {
  return themes.includes(value as Theme) ? (value as Theme) : DEFAULT_THEME;
}

/** What actually shows: the choice, or the device setting for "system". */
export function resolveTheme(theme: Theme, systemDark: boolean): "light" | "dark" {
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

/**
 * Runs inline before the app's first paint. Must stay self-contained (it's a string), and must
 * not throw: storage can be blocked.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";}catch(_){}})();`;
