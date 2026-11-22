"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@prepora/ui/components/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@prepora/ui/components/dialog";
import { Logo } from "./logo";
import { NavList } from "./nav-list";
import { Version } from "./version";

/** Below lg: top bar with the logo and a menu button that opens the module list as a sheet. */
export function MobileBar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-xl lg:hidden">
      <Logo />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button variant="ghost" size="icon" aria-label="Open menu" />}>
          <Menu />
        </DialogTrigger>
        <DialogContent className="mint">
          <DialogTitle className="sr-only">Admin menu</DialogTitle>
          <div className="pt-4">
            <NavList onNavigate={() => setOpen(false)} />
          </div>
          <Version className="text-xs text-muted-foreground" />
        </DialogContent>
      </Dialog>
    </header>
  );
}
