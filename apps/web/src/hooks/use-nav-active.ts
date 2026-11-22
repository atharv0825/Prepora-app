"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { isActive, mainNav } from "@/lib/routes";

// Section ids for the landing-page nav links ("/#modules" → "modules"), in page order.
const sectionIds = mainNav
  .map((item) => item.href.split("#")[1])
  .filter((id): id is string => Boolean(id));

// A section counts as current once its top passes this line (header 64px + a little).
const LINE = 120;

/**
 * Which nav link is active. On the landing page it follows the scroll position (scroll-spy):
 * Home at the top, then Modules, How it works, Pricing, Contact as their sections reach the
 * header. Clicking a link scrolls there, so it becomes active too. Other pages: by pathname.
 */
export function useNavActive(): (href: string) => boolean {
  const pathname = usePathname();
  const [section, setSection] = useState<string | null>(null);
  const onLanding = pathname === "/";

  useEffect(() => {
    if (!onLanding) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      let current: string | null = null;
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= LINE) current = id;
      }
      // At the very bottom the last section (Contact) may never reach the line.
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom && window.scrollY > 0) current = sectionIds.at(-1) ?? current;
      setSection(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", schedule);
    };
  }, [onLanding]);

  return useCallback(
    (href: string) => {
      if (!onLanding) return isActive(pathname, href);
      const id = href.split("#")[1];
      return id ? section === id : href === "/" && section === null;
    },
    [onLanding, pathname, section],
  );
}
