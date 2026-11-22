import type { CSSProperties } from "react";

// Grid cell size must match `bg-grid` (packages/ui globals.css: background-size 56px).
const CELL = 56;
// Palette colours (design doc → Colour palette). Literal values: Tailwind only emits theme
// variables that some class uses, so var(--color-brand-*) may not exist here.
// The hero is white, so streaks use the saturated green/sea and squares the soft mist/mint.
const GREEN = "#3fc48c";
const PURPLE = "#37918a"; // sea teal (kept the name short for the column beams)
const MIST = "#a7e6c9";
const MINT = "#68c1a7";
const tint = (hex: string, pct: number) => `color-mix(in oklab, ${hex} ${pct}%, transparent)`;

// Fixed values (no Math.random) so server and client render identically.
// Horizontal streaks travel along row lines (green); vertical ones along column lines (sea).
const rowBeams = [
  { row: 2, duration: 9, delay: 0 },
  { row: 5, duration: 12, delay: 3.5 },
  { row: 8, duration: 10, delay: 6 },
  { row: 11, duration: 14, delay: 1.5 },
];
const colBeams = [
  { col: 3, duration: 11, delay: 2 },
  { col: 9, duration: 13, delay: 7 },
  { col: 15, duration: 10, delay: 4.5 },
  { col: 21, duration: 12, delay: 0.5 },
];
// Grid squares that softly light up and fade (alternating mist / mint).
const cells = [
  { col: 2, row: 3, delay: 0 },
  { col: 7, row: 1, delay: 2.2 },
  { col: 12, row: 6, delay: 4.1 },
  { col: 18, row: 2, delay: 1.3 },
  { col: 23, row: 7, delay: 3.4 },
  { col: 5, row: 9, delay: 5.2 },
  { col: 16, row: 10, delay: 6.3 },
];

/**
 * Hero background (design doc §2): light-grey grid on white with green / sea streaks flowing
 * along the grid lines and a few squares glowing light green. Decorative only; motion stops
 * with prefers-reduced-motion.
 */
export function HeroBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="bg-grid absolute inset-0" />
      {/* Same fade-out mask as the grid, so streaks disappear towards the bottom too. */}
      <div className="absolute inset-0 [mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)]">
        {cells.map((c, i) => (
          <span
            key={`c${i}`}
            className="absolute"
            style={{
              left: c.col * CELL + 1,
              top: c.row * CELL + 1,
              width: CELL - 1,
              height: CELL - 1,
              // Light-green fill + coloured 1px edge + soft glow.
              background: tint(i % 2 === 0 ? MIST : MINT, 45),
              boxShadow: `inset 0 0 0 1px ${tint(i % 2 === 0 ? GREEN : PURPLE, 45)}, 0 0 24px ${tint(i % 2 === 0 ? GREEN : PURPLE, 18)}`,
              opacity: 0,
              animation: `cell-glow 7s ease-in-out ${c.delay}s infinite`,
            }}
          />
        ))}
        {rowBeams.map((b, i) => (
          <span
            key={`r${i}`}
            className="absolute left-0 h-px w-48"
            style={
              {
                top: b.row * CELL,
                background: `linear-gradient(90deg, transparent, ${GREEN} 70%, transparent)`,
                boxShadow: `0 0 8px ${tint(GREEN, 60)}`,
                transform: "translateX(-30vw)",
                animation: `beam-x ${b.duration}s linear ${b.delay}s infinite`,
              } as CSSProperties
            }
          />
        ))}
        {colBeams.map((b, i) => (
          <span
            key={`v${i}`}
            className="absolute top-0 h-40 w-px"
            style={{
              left: b.col * CELL,
              background: `linear-gradient(180deg, transparent, ${PURPLE} 70%, transparent)`,
              boxShadow: `0 0 8px ${tint(PURPLE, 60)}`,
              transform: "translateY(-240px)",
              animation: `beam-y ${b.duration}s linear ${b.delay}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
