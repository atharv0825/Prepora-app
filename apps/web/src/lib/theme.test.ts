import { describe, expect, it } from "vitest";
import { parseTheme, resolveTheme, THEME_KEY, themeScript } from "./theme";

describe("dark mode", () => {
  it("reads the stored choice; nothing chosen (or anything unknown) is light", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("system")).toBe("system");
    expect(parseTheme(null)).toBe("light");
    expect(parseTheme("purple")).toBe("light");
  });

  it("system follows the device; light and dark are fixed", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("the inline script sets the class before paint, the same way", () => {
    const run = (stored: string | null, systemDark: boolean) => {
      const classes = new Set<string>();
      const html = {
        classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
        style: { colorScheme: "" },
      };
      const env = {
        localStorage: { getItem: (k: string) => (k === THEME_KEY ? stored : null) },
        window: { matchMedia: () => ({ matches: systemDark }) },
        document: { documentElement: html },
      };
      new Function("localStorage", "window", "document", themeScript)(env.localStorage, env.window, env.document);
      return { dark: classes.has("dark"), scheme: html.style.colorScheme };
    };
    expect(run("dark", false)).toEqual({ dark: true, scheme: "dark" });
    expect(run("light", true)).toEqual({ dark: false, scheme: "light" });
    expect(run("system", true)).toEqual({ dark: true, scheme: "dark" });
    expect(run("system", false)).toEqual({ dark: false, scheme: "light" });
    // Nothing chosen: light, even on a dark device.
    expect(run(null, true)).toEqual({ dark: false, scheme: "light" });
  });
});
