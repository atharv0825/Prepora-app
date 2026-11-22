"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@prepora/ui/components/button";
import { cn } from "@prepora/ui/lib/utils";
import { routes, waitlistMode } from "@/lib/routes";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";

type Tone = "dark" | "light";

/**
 * Navbar (design doc §1). It overlays the page (sticky with -mb-16, so the first section runs
 * underneath it) and adapts to what's behind it:
 *   - top of the page: fully transparent, no border, no blur;
 *   - scrolled over a dark section: very light black glass + blur;
 *   - scrolled over a light section: light white glass + blur, with dark text (tokens flip
 *     because the `dark` class is removed).
 * Every page's first section must leave room for it (≥ 4rem / pt-16 extra top padding).
 */
export function SiteHeader() {
  const ref = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [tone, setTone] = useState<Tone>("light");

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const header = ref.current;
      if (!header) return;
      setScrolled(window.scrollY > 8);
      // What's directly under the middle of the header bar?
      const y = header.offsetHeight / 2;
      const under = document
        .elementsFromPoint(window.innerWidth / 2, y)
        .find((el) => !header.contains(el));
      setTone(under?.closest(".dark") ? "dark" : "light");
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <header
      ref={ref}
      data-tone={tone}
      className={cn(
        "sticky top-0 z-40 -mb-16 border-b text-foreground transition-[background-color,border-color,backdrop-filter] duration-300",
        tone === "dark" && "dark",
        !scrolled && "border-transparent bg-transparent",
        scrolled &&
          tone === "dark" &&
          "border-white/10 bg-[rgb(10_10_10/0.35)] backdrop-blur-xl backdrop-saturate-150",
        scrolled &&
          tone === "light" &&
          "border-black/5 bg-white/65 backdrop-blur-xl backdrop-saturate-150",
      )}
    >
      <div className="container-page flex h-16 items-center justify-between gap-6">
        <Logo />
        <NavLinks />
        <div className="flex items-center gap-2 sm:gap-4">
          {!waitlistMode && (
            <Link
              href={routes.login}
              className="hidden text-sm text-foreground underline-offset-4 hover:underline sm:inline"
            >
              Log in
            </Link>
          )}
          <Link
            href={waitlistMode ? routes.waitlist : routes.signup}
            className={buttonVariants({ size: "sm" })}
          >
            {waitlistMode ? "Join waitlist" : "Start free"}
          </Link>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
