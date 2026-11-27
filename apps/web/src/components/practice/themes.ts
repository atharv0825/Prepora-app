import type { CSSProperties } from "react";

// Each section's dashboard colour, as plain values applied with inline styles (not generated
// colour classes), so a card can never end up with white text on a missing background.
//
//   fresh   the glossy "not done" card: a gradient in the section colour
//   done    a light tint of it, with a matching outline
//   pick    "Pick for me": a stronger tint, outlined in the section colour, with an accent pill
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
  listening: { from: "#f2a93f", to: "#e08a00", text: "dark", rgb: "224 138 0", tint: "#fdf2e1", tintRing: "#f3d29b", pickTint: "#fbe4bf", accent: "#e08a00" },
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

export function doneStyle(m: PracticeModule): CSSProperties {
  const t = THEMES[m];
  return {
    backgroundImage: `linear-gradient(to bottom, #ffffff, ${t.tint})`,
    boxShadow: `inset 0 1px 0 #ffffff, 0 8px 18px -12px rgb(8 34 43 / 0.35), 0 0 0 1px ${t.tintRing}`,
  };
}

export function pickStyle(m: PracticeModule): CSSProperties {
  const t = THEMES[m];
  return {
    backgroundImage: `linear-gradient(to bottom, #ffffff, ${t.pickTint})`,
    boxShadow: `inset 0 1px 0 #ffffff, 0 8px 18px -12px rgb(${t.rgb} / 0.6), 0 0 0 2px ${t.accent}`,
  };
}

export function accentStyle(m: PracticeModule): CSSProperties {
  const t = THEMES[m];
  return { backgroundColor: t.accent, color: t.text === "light" ? "#ffffff" : "#08222b" };
}
