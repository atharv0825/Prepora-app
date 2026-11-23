import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModuleIntro } from "@/components/module-intro";
import { findModule, placeholderModules } from "@/lib/nav";

// One placeholder route for every module in lib/nav.ts that isn't built yet, prerendered.
// Built modules have their own route (e.g. users/); anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return placeholderModules.map((m) => ({ section: m.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[section]">): Promise<Metadata> {
  const { section } = await params;
  return { title: findModule(section)?.label ?? "Not found" };
}

export default async function SectionPage({ params }: PageProps<"/[section]">) {
  const { section } = await params;
  const m = findModule(section);
  if (!m || m.slug === "dashboard" || m.built) notFound();
  return <ModuleIntro module={m} />;
}
