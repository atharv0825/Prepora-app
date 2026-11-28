import type { ReactNode } from "react";
import { SectionTheme } from "@/components/practice/section-theme";

// Every Speaking page (the list, tests, results) in the Speaking colour.
export default function SpeakingLayout({ children }: { children: ReactNode }) {
  return <SectionTheme module="speaking">{children}</SectionTheme>;
}
