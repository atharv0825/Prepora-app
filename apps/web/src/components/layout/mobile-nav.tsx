"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button, buttonVariants } from "@prepora/ui/components/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@prepora/ui/components/dialog";
import { cn } from "@prepora/ui/lib/utils";
import { isActive, mainNav, routes, waitlistMode } from "@/lib/routes";

/** Phones/tablets (< md): menu button opens a dark bottom sheet with the nav and CTAs. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = () => setOpen(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" />}
      >
        <Menu />
      </DialogTrigger>
      {/* `dark` keeps the sheet on the dark palette (it renders in a portal outside the header). */}
      <DialogContent className="dark">
        <DialogTitle className="sr-only">Menu</DialogTitle>
        <nav aria-label="Main" className="grid gap-1 pt-6">
          {mainNav.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-xl px-3 py-3 font-heading text-2xl tracking-tight transition-colors hover:bg-accent",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="grid gap-3 border-t pt-5">
          <Link
            href={waitlistMode ? routes.waitlist : routes.signup}
            onClick={close}
            className={buttonVariants({ size: "lg" })}
          >
            {waitlistMode ? "Join the waitlist" : "Start free"}
          </Link>
          {!waitlistMode && (
            <Link
              href={routes.login}
              onClick={close}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              Log in
            </Link>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
