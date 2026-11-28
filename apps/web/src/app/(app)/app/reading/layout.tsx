import type { ReactNode } from "react";
import { SectionTheme } from "@/components/practice/section-theme";

// Every Reading page (the list, tests, results) in the Reading colour.
export default function ReadingLayout({ children }: { children: ReactNode }) {
  return <SectionTheme module="reading">{children}</SectionTheme>;
}
