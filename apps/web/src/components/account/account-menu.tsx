"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Coins, LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@prepora/ui/components/dropdown-menu";
import { initials } from "@/lib/account";
import { resetUser } from "@/lib/analytics";
import { signOut } from "@/lib/account-actions";
import { routes } from "@/lib/routes";
import { parseTheme } from "@/lib/theme";
import { useTheme } from "../theme/theme-provider";

/**
 * Avatar button → menu with the person's name/email, Profile, Credits & usage (M3-F1),
 * Appearance (System / Light / Dark) and Log out (M1-F3).
 */
export function AccountMenu({ name, email }: { name: string; email: string | null }) {
  const [pending, startTransition] = useTransition();
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${name}`}
        className="flex size-11 cursor-pointer items-center justify-center rounded-full border border-brand-line bg-primary text-sm font-semibold text-primary-foreground outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring/40 data-popup-open:ring-3 data-popup-open:ring-ring/30"
      >
        {initials(name)}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <p className="truncate text-sm font-medium">{name}</p>
          {email && email !== name && <p className="truncate text-xs text-muted-foreground">{email}</p>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLinkItem render={<Link href={routes.profile} />}>
          <UserRound aria-hidden /> Profile
        </DropdownMenuLinkItem>
        <DropdownMenuLinkItem render={<Link href={routes.credits} />}>
          <Coins aria-hidden /> Credits &amp; usage
        </DropdownMenuLinkItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="pb-1 text-xs font-medium text-muted-foreground" id="appearance-label">
          Appearance
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(parseTheme(String(v)))} aria-labelledby="appearance-label">
          <DropdownMenuRadioItem value="system">
            <Monitor aria-hidden /> System
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">
            <Sun aria-hidden /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon aria-hidden /> Dark
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending}
          closeOnClick={false}
          onClick={() => {
            // Forget the user in PostHog and Sentry first (M1-F4), then end the session.
            resetUser();
            startTransition(() => signOut());
          }}
        >
          <LogOut aria-hidden /> {pending ? "Logging out…" : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
