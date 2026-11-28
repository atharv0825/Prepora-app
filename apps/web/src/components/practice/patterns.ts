import type { CSSProperties } from "react";

// Six faint icon patterns for the practice cards (books, planes, cities, stars, bags and a few
// fillers), each a repeating 120px SVG tile drawn in one dark ink. The card shows it at a low
// opacity, so it reads as a darker shade of the card colour. A list gives each card the next
// pattern (and colour shade, themes.ts), so neighbours never match.

export const VARIANTS = 6;

/** The icons, in a 24 × 24 box. Filled unless they say otherwise. */
const ICON: Record<string, string> = {
  book: `<path d="M2 5c3-1.2 6.5-1.2 10 1 3.5-2.2 7-2.2 10-1v14c-3-1-6.5-1-10 1-3.5-2-7-2-10-1z"/>`,
  plane: `<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>`,
  city: `<path d="M2 22V11h5V4h6v7h3V7h6v15z"/>`,
  star: `<path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z"/>`,
  bag: `<path d="M5 8h14l-1.2 14H6.2z"/><path d="M9 9V6.5a3 3 0 0 1 6 0V9" fill="none" stroke-width="2"/>`,
  sparkle: `<path d="M12 2l2 8 8 2-8 2-2 8-2-8-8-2 8-2z"/>`,
  ring: `<circle cx="12" cy="12" r="6.5" fill="none" stroke-width="3"/>`,
  globe: `<circle cx="12" cy="12" r="9" fill="none" stroke-width="2"/><path d="M3 12h18M12 3c3.5 3 3.5 15 0 18M12 3c-3.5 3-3.5 15 0 18" fill="none" stroke-width="1.6"/>`,
  bubble: `<path d="M3 4h18v12H10l-5 4v-4H3z"/>`,
  pencil: `<path d="M3 21l1.2-5L16 4.2l3.8 3.8L8 19.8z"/>`,
};

/** [icon, x, y, rotation°, size px] */
type Placed = [keyof typeof ICON, number, number, number, number];

const TILES: Placed[][] = [
  [["book", 8, 10, -12, 16], ["star", 66, 4, 10, 12], ["plane", 88, 46, 35, 16], ["city", 34, 58, 0, 16], ["bag", 6, 88, 8, 14], ["sparkle", 72, 94, 0, 11]],
  [["plane", 10, 8, -30, 17], ["city", 70, 14, 0, 15], ["star", 40, 48, -8, 11], ["bag", 92, 70, -10, 15], ["book", 20, 86, 14, 15], ["ring", 62, 96, 0, 10]],
  [["city", 6, 12, 0, 17], ["bag", 58, 6, 12, 14], ["book", 86, 38, -16, 15], ["sparkle", 30, 52, 0, 12], ["plane", 60, 80, 20, 16], ["star", 8, 94, 18, 11]],
  [["star", 14, 6, 0, 13], ["globe", 58, 18, 0, 15], ["book", 96, 4, 20, 13], ["plane", 18, 52, 45, 16], ["city", 76, 66, 0, 15], ["bag", 32, 94, -6, 14]],
  [["bag", 10, 8, -8, 15], ["plane", 54, 22, -60, 15], ["star", 96, 10, 12, 11], ["bubble", 22, 58, 0, 13], ["book", 74, 70, 8, 16], ["city", 12, 96, 0, 14]],
  [["sparkle", 6, 6, 0, 11], ["book", 40, 10, 6, 15], ["city", 88, 14, 0, 15], ["pencil", 10, 52, 0, 14], ["star", 60, 56, -14, 12], ["plane", 82, 92, 70, 15], ["bag", 30, 90, 10, 14]],
];

function tile(icons: Placed[]): string {
  const body = icons
    .map(([name, x, y, rot, size]) => {
      const k = size / 24;
      return `<g transform="translate(${x} ${y}) rotate(${rot} ${size / 2} ${size / 2}) scale(${k})">${ICON[name]}</g>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><g fill="#08122a" stroke="#08122a" stroke-linecap="round" stroke-linejoin="round" stroke-width="0">${body}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const URLS = TILES.map(tile);

/** The pattern layer's style for card number `variant` (any whole number; it wraps). */
export function patternStyle(variant: number): CSSProperties {
  return { backgroundImage: URLS[((variant % VARIANTS) + VARIANTS) % VARIANTS], backgroundSize: "120px 120px" };
}
