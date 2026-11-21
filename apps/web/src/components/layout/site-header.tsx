import Link from "next/link";
import { buttonVariants } from "@prepora/ui/components/button";
import { routes, waitlistMode } from "@/lib/routes";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";

/** Navbar on dark (design doc §1). Frosted glass: a dark tint with a faint white wash and a 1px
 *  top highlight, blurred, ~80% opaque. Over the black hero it reads as lighter, see-through
 *  glass; over white sections it stays dark enough for the nav text (white ≥ 8:1, inactive links ≥ 6:1). */
export function SiteHeader() {
  return (
    <header className="dark sticky top-0 z-40 border-b border-white/10 bg-[rgb(28_28_28/0.8)] shadow-[inset_0_1px_0_rgb(255_255_255/0.06)] backdrop-blur-xl backdrop-saturate-150">
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
