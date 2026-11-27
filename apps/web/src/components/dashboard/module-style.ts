import { BookOpen, Headphones, Mic, PenLine, type LucideIcon } from "lucide-react";
import type { DashboardModuleKey } from "@prepora/shared/api/dashboard";

// One colour per IELTS module (chart-* tokens in packages/ui, palette-validated for light and
// dark), shared by the dashboard charts and the module tiles so a module always looks the same.
// `onBg` is the icon colour on the filled circle: white on blue/green, deep ink on amber/pink,
// the darker of the two that keeps icons ≥ 3 : 1.
export const MODULE_STYLE: Record<
  DashboardModuleKey,
  { label: string; icon: LucideIcon; bg: string; stroke: string; ring: string; onBg: string }
> = {
  reading: { label: "Reading", icon: BookOpen, bg: "bg-chart-reading", stroke: "stroke-chart-reading", ring: "ring-chart-reading/20", onBg: "text-white" },
  listening: { label: "Listening", icon: Headphones, bg: "bg-chart-listening", stroke: "stroke-chart-listening", ring: "ring-chart-listening/20", onBg: "text-brand-ink" },
  writing: { label: "Writing", icon: PenLine, bg: "bg-chart-writing", stroke: "stroke-chart-writing", ring: "ring-chart-writing/20", onBg: "text-brand-ink" },
  speaking: { label: "Speaking", icon: Mic, bg: "bg-chart-speaking", stroke: "stroke-chart-speaking", ring: "ring-chart-speaking/20", onBg: "text-white" },
};

/** Diagonal texture on coloured chart marks: a second cue besides colour (dataviz: texture for CVD). */
export const hatch = { backgroundImage: "repeating-linear-gradient(135deg, rgb(255 255 255 / 0.32) 0 2px, transparent 2px 7px)" };
