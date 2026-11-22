"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@prepora/ui/components/button";
import { signOut } from "@/lib/actions";

export function SignOutButton({ label = "Sign out", className }: { label?: string; className?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => signOut())}
      className={className}
    >
      <LogOut aria-hidden /> {pending ? "Signing out…" : label}
    </Button>
  );
}
