import Link from "next/link";
import { buttonVariants } from "@prepora/ui/components/button";
import { routes, waitlistMode } from "@/lib/routes";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";

/** Navbar on dark (design doc §1). Sticky and solid black: a translucent header turns grey over
 *  the white sections, which breaks the "navbar on dark" look. */
export function SiteHeader() {
  return (
    <header className="dark sticky top-0 z-40 border-b border-border bg-background">
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
