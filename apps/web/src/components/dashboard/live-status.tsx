"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@prepora/ui/lib/utils";
import styles from "./motion.module.css";

// "● Live · Updated just now": the dashboard re-fetches itself (router.refresh) when the tab
// comes back into view, e.g. after finishing a test in another tab, and every 2 minutes while
// it's visible. The "updated" time ticks. No live region: the minute ticking isn't announced.

const EVERY_MS = 2 * 60_000;

function ago(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min === 1) return "1 min ago";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return h === 1 ? "1 hour ago" : `${h} hours ago`;
}

export function LiveStatus({ className }: { className?: string }) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();
  const last = useRef(0);

  useEffect(() => {
    last.current = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      // Not more than once every 20 seconds (focus and visibility often fire together).
      if (Date.now() - last.current < 20_000) return;
      last.current = Date.now();
      start(() => router.refresh());
      setUpdatedAt(Date.now());
    };
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const poll = setInterval(refresh, EVERY_MS);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);

  return (
    <span className={cn("inline-flex items-center gap-2 text-xs text-muted-foreground", className)} data-testid="live-status">
      <span aria-hidden className={cn("relative size-2 rounded-full bg-brand-primary text-brand-primary", styles.pulse)} />
      <span>
        <span className="font-medium text-foreground">Live</span> · {pending ? "Updating…" : `Updated ${ago(Math.max(0, now - updatedAt))}`}
      </span>
    </span>
  );
}
