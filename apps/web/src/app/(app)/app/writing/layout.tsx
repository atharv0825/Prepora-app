import type { ReactNode } from "react";
import { SectionTheme } from "@/components/practice/section-theme";

// Every Writing page (the list, tests, results) in the Writing colour.
export default function WritingLayout({ children }: { children: ReactNode }) {
  return <SectionTheme module="writing">{children}</SectionTheme>;
}
