import type { ReactNode } from "react";
import type { PracticeModule } from "./themes";
import "./section-themes.css";

/**
 * Wraps a practice section's pages (its layout.tsx) in that section's colour (section-themes.css).
 * display: contents, so the page layout is unchanged; the colour tokens still pass down.
 */
export function SectionTheme({ module, children }: { module: PracticeModule; children: ReactNode }) {
  return (
    <div className={`theme-${module} contents`} data-section-theme={module}>
      {children}
    </div>
  );
}
