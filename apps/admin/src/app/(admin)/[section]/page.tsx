import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModuleIntro } from "@/components/module-intro";
import { findModule, sectionModules } from "@/lib/nav";

// One route for every module in lib/nav.ts, prerendered. Anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return sectionModules.map((m) => ({ section: m.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[section]">): Promise<Metadata> {
  const { section } = await params;
  return { title: findModule(section)?.label ?? "Not found" };
}

export default async function SectionPage({ params }: PageProps<"/[section]">) {
  const { section } = await params;
  const m = findModule(section);
  if (!m || m.slug === "dashboard") notFound();
  return <ModuleIntro module={m} />;
}
