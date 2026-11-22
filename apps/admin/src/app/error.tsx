"use client";

import { useEffect } from "react";
// @sentry/core, not @sentry/nextjs: reports to the client created in instrumentation-client.ts
// without pulling the Node.js SDK into the server render of this page (Worker size).
import { captureException } from "@sentry/core";
import { Button } from "@prepora/ui/components/button";

// Next 16 error boundary API: { error: unknown, retry }.
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    error instanceof Error && "digest" in error ? String((error as { digest?: string }).digest) : null;

  useEffect(() => {
    captureException(error);
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="flex min-h-dvh flex-col items-start justify-center gap-5 px-6 sm:px-16">
      <p className="font-mono text-sm text-muted-foreground">Error</p>
      <h1 className="text-h1">Something went wrong.</h1>
      <Button onClick={() => retry()}>Try again</Button>
      {digest && <p className="font-mono text-xs text-muted-foreground">Reference: {digest}</p>}
    </main>
  );
}
