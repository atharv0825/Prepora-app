import type { CSSProperties } from "react";

// Each section's dashboard colour, as plain values applied with inline styles (not generated
// colour classes), so a card can never end up with white text on a missing background.
//
//   fresh   the glossy "not done" card: a gradient in the section colour
//   done    a light tint of it, with a matching outline (dark mode: the dark card, lightly tinted)
//   pick    "Pick for me": a stronger tint, outlined in the section colour, with an accent pill
//           (dark mode: the dark card with more of the colour mixed in)
// done and pick come as light + dark variables; SURFACE_CLASS picks one.
//
// Text: white on the Reading blue (4.8 : 1 or more), deep ink on amber, pink and green (6 : 1+).

export type PracticeModule = "reading" | "listening" | "writing" | "speaking";

type Theme = {
  from: string;
  to: string;
  /** Text on the fresh card and on the accent. */
  text: "light" | "dark";
  /** The section colour as "r g b", for shadows. */
  rgb: string;
  tint: string;
  tintRing: string;
  pickTint: string;
  accent: string;
};

export const THEMES: Record<PracticeModule, Theme> = {
  reading: { from: "#2f6fdb", to: "#2459bd", text: "light", rgb: "47 111 219", tint: "#eaf1fd", tintRing: "#bcd2f6", pickTint: "#dbe7fb", accent: "#2459bd" },
  listening: { from: "#fdd690", to: "#f7b955", text: "dark", rgb: "247 185 85", tint: "#fef6e8", tintRing: "#f9dcab", pickTint: "#fdebcc", accent: "#f7b955" },
  writing: { from: "#f78fbb", to: "#f472a8", text: "dark", rgb: "244 114 168", tint: "#fde9f2", tintRing: "#f8c1d9", pickTint: "#fbd6e6", accent: "#f472a8" },
  speaking: { from: "#62d7a5", to: "#3fc48c", text: "dark", rgb: "15 164 103", tint: "#eafaf0", tintRing: "#a7e6c9", pickTint: "#d3f3e2", accent: "#3fc48c" },
};

export function freshStyle(m: PracticeModule): CSSProperties {
  const t = THEMES[m];
  return {
    backgroundImage: `linear-gradient(to bottom, ${t.from}, ${t.to})`,
    boxShadow: `inset 0 1px 0 rgb(255 255 255 / ${t.text === "light" ? 0.35 : 0.55}), inset 0 -2px 0 rgb(8 34 43 / 0.1), 0 10px 22px -12px rgb(${t.rgb} / 0.8)`,
  };
}

/**
 * Classes that paint a surface from the variables below: the light pair, or the dark pair under
 * .dark. The same fixed classes for every section; only the variable values differ.
 */
export const SURFACE_CLASS =
  "[background-image:var(--pc-bg)] [box-shadow:var(--pc-shadow)] dark:[background-image:var(--pc-bg-dark)] dark:[box-shadow:var(--pc-shadow-dark)]";

/** A light and a dark surface, as variables that SURFACE_CLASS picks between. */
function surface(light: { bg: string; shadow: string }, dark: { bg: string; shadow: string }): CSSProperties {
  return { "--pc-bg": light.bg, "--pc-shadow": light.shadow, "--pc-bg-dark": dark.bg, "--pc-shadow-dark": dark.shadow } as CSSProperties;
}

/** Dark mode: the dark card colour with some of the section colour mixed in. */
const darkTint = (accent: string, top: number, bottom: number) =>
  `linear-gradient(to bottom, color-mix(in srgb, ${accent} ${top}%, #0f3b47), color-mix(in srgb, ${accent} ${bottom}%, #0f3b47))`;

export function doneStyle(m: PracticeModule): CSSProperties {
  const t = THEMES[m];
  return {
    // The outline as a real border (inline, both modes), so it shows even without the classes.
    border: `1px solid color-mix(in srgb, ${t.accent} 45%, transparent)`,
    ...surface(
    {
      bg: `linear-gradient(to bottom, #ffffff, ${t.tint})`,
      shadow: `inset 0 1px 0 #ffffff, 0 8px 18px -12px rgb(8 34 43 / 0.35)`,
    },
    {
      bg: darkTint(t.accent, 6, 14),
      shadow: `inset 0 1px 0 rgb(255 255 255 / 0.06), 0 10px 22px -12px rgb(0 0 0 / 0.6)`,
    },
    ),
  };
}

export function pickStyle(m: PracticeModule): CSSProperties {
  const t = THEMES[m];
  return {
    // A solid border in the section colour (inline, both modes).
    border: `2px solid ${t.accent}`,
    ...surface(
    {
      bg: `linear-gradient(to bottom, #ffffff, ${t.pickTint})`,
      shadow: `inset 0 1px 0 #ffffff, 0 8px 18px -12px rgb(${t.rgb} / 0.6)`,
    },
    {
      bg: darkTint(t.accent, 14, 26),
      shadow: `inset 0 1px 0 rgb(255 255 255 / 0.08), 0 10px 22px -12px rgb(0 0 0 / 0.6)`,
    },
    ),
  };
}

export function accentStyle(m: PracticeModule): CSSProperties {
  const t = THEMES[m];
  return { backgroundColor: t.accent, color: t.text === "light" ? "#ffffff" : "#08222b" };
}
