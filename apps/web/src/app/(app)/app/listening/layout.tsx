import type { ReactNode } from "react";
import { SectionTheme } from "@/components/practice/section-theme";

// Every Listening page (the list, tests, results) in the Listening colour.
export default function ListeningLayout({ children }: { children: ReactNode }) {
  return <SectionTheme module="listening">{children}</SectionTheme>;
}
