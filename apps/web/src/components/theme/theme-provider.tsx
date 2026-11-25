"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_THEME, parseTheme, resolveTheme, type Theme, THEME_KEY } from "@/lib/theme";

type ThemeState = { theme: Theme; setTheme: (theme: Theme) => void };
const ThemeContext = createContext<ThemeState>({ theme: DEFAULT_THEME, setTheme: () => {} });

const systemQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function apply(theme: Theme) {
  const dark = resolveTheme(theme, systemQuery().matches) === "dark";
  const html = document.documentElement;
  html.classList.toggle("dark", dark);
  html.style.colorScheme = dark ? "dark" : "light";
}

/**
 * The signed-in app's theme (Light by default; Dark or System on request). The inline script in the app layout already
 * set the class before paint; this keeps it in sync with the choice and with the device setting,
 * and removes it again when the student leaves the app (the marketing pages stay light).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    let stored: Theme = DEFAULT_THEME;
    try {
      stored = parseTheme(localStorage.getItem(THEME_KEY));
    } catch {
      // Storage blocked: the default.
    }
    // Apply it again: the inline script did on first load, but this also runs after client-side
    // navigation into the app, and after React's development remount (whose clean-up below
    // removed it).
    apply(stored);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a browser-only value once
    setThemeState(stored);
    return () => {
      const html = document.documentElement;
      html.classList.remove("dark");
      html.style.colorScheme = "";
    };
  }, []);

  // "System" follows the device when it changes (e.g. at sunset).
  useEffect(() => {
    if (theme !== "system") return;
    const query = systemQuery();
    const onChange = () => apply("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage blocked: it still applies for this visit.
    }
    apply(next);
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
