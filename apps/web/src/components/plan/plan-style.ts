import { BookOpen, FileText, Headphones, MessageCircle, Mic, PenLine, Timer, type LucideIcon } from "lucide-react";
import type { StudyItemKind } from "@prepora/shared/api/study-plan";

// Each kind of plan item: its icon and its module's dashboard colour (literal class names, so
// Tailwind keeps them).
export const KIND_STYLE: Record<StudyItemKind, { icon: LucideIcon; circle: string; outline: string; dot: string }> = {
  reading_test: { icon: BookOpen, circle: "bg-chart-reading text-white", outline: "ring-chart-reading/50", dot: "bg-chart-reading" },
  listening_test: { icon: Headphones, circle: "bg-chart-listening text-brand-ink", outline: "ring-chart-listening/50", dot: "bg-chart-listening" },
  writing_t1: { icon: FileText, circle: "bg-chart-writing text-brand-ink", outline: "ring-chart-writing/50", dot: "bg-chart-writing" },
  writing_t2: { icon: PenLine, circle: "bg-chart-writing text-brand-ink", outline: "ring-chart-writing/50", dot: "bg-chart-writing" },
  speaking_p1: { icon: MessageCircle, circle: "bg-chart-speaking text-white", outline: "ring-chart-speaking/50", dot: "bg-chart-speaking" },
  speaking_p2: { icon: Mic, circle: "bg-chart-speaking text-white", outline: "ring-chart-speaking/50", dot: "bg-chart-speaking" },
  speaking_full: { icon: Timer, circle: "bg-chart-speaking text-white", outline: "ring-chart-speaking/50", dot: "bg-chart-speaking" },
};
