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
  reading: { from: "#3b6fe0", to: "#2250b8", text: "light", rgb: "34 80 184", tint: "#eaf1fd", tintRing: "#bcd2f6", pickTint: "#dbe7fb", accent: "#2250b8" },
  listening: { from: "#f2a93f", to: "#e08a00", text: "dark", rgb: "224 138 0", tint: "#fdf2e1", tintRing: "#f3d29b", pickTint: "#fbe4bf", accent: "#e08a00" },
  writing: { from: "#f78fbb", to: "#f472a8", text: "dark", rgb: "244 114 168", tint: "#fde9f2", tintRing: "#f8c1d9", pickTint: "#fbd6e6", accent: "#f472a8" },
  speaking: { from: "#62d7a5", to: "#3fc48c", text: "dark", rgb: "15 164 103", tint: "#eafaf0", tintRing: "#a7e6c9", pickTint: "#d3f3e2", accent: "#3fc48c" },
};

/**
 * Six shades of each section colour, one per card in turn (with its own pattern, patterns.ts), so
 * neighbouring cards differ. Shade 0 is the section's own colour. Every shade keeps the section's
 * text readable: white on the blues 4.6 : 1 or more, deep ink on the rest 5.4 : 1 or more.
 */
const SHADES: Record<PracticeModule, [string, string][]> = {
  reading: [["#3b6fe0", "#2250b8"], ["#4a5fd6", "#2f3fa8"], ["#2a6fcc", "#1a4f9c"], ["#3a62c8", "#22409a"], ["#2378b8", "#16598c"], ["#2c6fc4", "#1d55a0"]],
  listening: [["#f2a93f", "#e08a00"], ["#f6bb4c", "#e99c12"], ["#f59a4e", "#e07a20"], ["#f7c766", "#eba42a"], ["#f2a65e", "#dd8638"], ["#f4b136", "#dc900a"]],
  writing: [["#f78fbb", "#f472a8"], ["#f4a0cc", "#e97fb8"], ["#f99aa6", "#f27a8c"], ["#ee9fd6", "#df7cc4"], ["#f9a3b8", "#f2849e"], ["#f590c4", "#e86aa8"]],
  speaking: [["#62d7a5", "#3fc48c"], ["#6dd8bd", "#43c3a2"], ["#7cd99c", "#52c57a"], ["#5dcfb2", "#37b993"], ["#8edca2", "#60ca82"], ["#68d4c6", "#3fbdaa"]],
};

const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");

/**
 * The glossy card: a vertical gradient, a 1px light line along the top, a soft inner shadow at the
 * bottom and a tinted shadow underneath (bigger on hover). The shadows are variables, so
 * LIFT_CLASS can swap them on hover (an inline box-shadow would beat any class).
 * `variant` picks the shade (it wraps).
 */
export function freshStyle(m: PracticeModule, variant = 0): CSSProperties {
  const t = THEMES[m];
  const shades = SHADES[m];
  const [from, to] = shades[((variant % shades.length) + shades.length) % shades.length];
  const rgb = rgbOf(to);
  const inner = `inset 0 1px 0 rgb(255 255 255 / ${t.text === "light" ? 0.45 : 0.6}), inset 0 -10px 16px -10px rgb(8 18 40 / 0.35)`;
  return {
    backgroundImage: `linear-gradient(to bottom, ${from}, ${to})`,
    "--pc-shadow": `${inner}, 0 12px 24px -12px rgb(${rgb} / 0.75)`,
    "--pc-shadow-hover": `${inner}, 0 24px 40px -14px rgb(${rgb} / 0.8)`,
  } as CSSProperties;
}

/**
 * Every practice card's shape and hover: a 24px radius, and on hover a slight 3D tilt (4° on X,
 * −6° on Y, light perspective) and a 4px lift over 400ms. No tilt with reduced motion.
 */
export const CARD_3D_CLASS =
  "flex h-full min-h-32 flex-col justify-between gap-4 rounded-3xl p-5 transition-[transform,box-shadow] duration-400 ease-in-out " +
  "hover:[transform:perspective(800px)_rotateX(4deg)_rotateY(-6deg)_translateY(-4px)] motion-reduce:transition-none motion-reduce:hover:[transform:none]";

/** The card's shadow from the variables, swapped for the bigger one on hover (both modes). */
export const LIFT_CLASS =
  "[box-shadow:var(--pc-shadow)] hover:[box-shadow:var(--pc-shadow-hover)] dark:[box-shadow:var(--pc-shadow-dark,var(--pc-shadow))] dark:hover:[box-shadow:var(--pc-shadow-hover-dark,var(--pc-shadow-hover))]";

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
    // Hover: the same surface, lifted further (LIFT_CLASS).
    "--pc-shadow-hover": `inset 0 1px 0 #ffffff, 0 20px 34px -14px rgb(${t.rgb} / 0.45)`,
    "--pc-shadow-hover-dark": `inset 0 1px 0 rgb(255 255 255 / 0.06), 0 22px 38px -14px rgb(0 0 0 / 0.7)`,
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
  } as CSSProperties;
}

export function pickStyle(m: PracticeModule): CSSProperties {
  const t = THEMES[m];
  return {
    // A solid border in the section colour (inline, both modes).
    border: `2px solid ${t.accent}`,
    "--pc-shadow-hover": `inset 0 1px 0 #ffffff, 0 20px 34px -14px rgb(${t.rgb} / 0.7)`,
    "--pc-shadow-hover-dark": `inset 0 1px 0 rgb(255 255 255 / 0.08), 0 22px 38px -14px rgb(0 0 0 / 0.7)`,
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
  } as CSSProperties;
}

export function accentStyle(m: PracticeModule): CSSProperties {
  const t = THEMES[m];
  return { backgroundColor: t.accent, color: t.text === "light" ? "#ffffff" : "#08222b" };
}
