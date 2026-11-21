"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@prepora/ui/components/button";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { routes } from "@/lib/routes";

// "500" page: any error thrown while rendering a page (the root layout still works).
// Next 16 passes `error: unknown` and `retry()` (re-fetches and re-renders the segment).
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    error instanceof Error && "digest" in error ? String((error as { digest?: string }).digest) : null;

  useEffect(() => {
    // Sentry capture is wired in M0-I2.
    console.error(error);
  }, [error]);

  return (
    <>
      <SiteHeader />
      <main id="main" className="dark relative flex flex-1 items-center overflow-hidden">
        <div aria-hidden className="bg-grid pointer-events-none absolute inset-0" />
        <div className="container-page relative flex flex-col items-start gap-6 pt-40 pb-24 sm:pt-48 sm:pb-32">
          <p className="font-mono text-sm text-muted-foreground">Error</p>
          <h1 className="text-display">Something went wrong.</h1>
          <p className="max-w-md text-lead text-muted-foreground">
            It&apos;s not you, it&apos;s us. Try again, and if it keeps happening, let us know.
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button size="lg" onClick={() => retry()}>
              Try again
            </Button>
            <Link href={routes.home} className={buttonVariants({ variant: "outline", size: "lg" })}>
              Go to home
            </Link>
          </div>
          {digest && (
            <p className="font-mono text-xs text-muted-foreground">Reference: {digest}</p>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
