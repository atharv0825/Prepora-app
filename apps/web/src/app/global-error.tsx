"use client";

import { useEffect } from "react";
// @sentry/core, not @sentry/nextjs: reports to the client created in instrumentation-client.ts
// without pulling the Node.js SDK into the server render of this page (Worker size).
import { captureException } from "@sentry/core";
import "@prepora/ui/globals.css";

// Last-resort error page: replaces the ROOT layout when it fails, so it renders its own
// <html>/<body> and can't rely on fonts or the shell. Keep it dependency-free (Sentry aside).
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    error instanceof Error && "digest" in error ? String((error as { digest?: string }).digest) : null;

  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-dvh items-center bg-background text-foreground">
        <title>Something went wrong · Prepora</title>
        <main className="container-page flex flex-col items-start gap-6 py-24">
          <p className="font-mono text-sm text-muted-foreground">Error</p>
          <h1 className="text-h1">Prepora couldn&apos;t load.</h1>
          <p className="max-w-md text-muted-foreground">
            Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="h-12 rounded-full bg-primary px-7 font-medium text-primary-foreground"
          >
            Try again
          </button>
          {digest && <p className="font-mono text-xs text-muted-foreground">Reference: {digest}</p>}
        </main>
      </body>
    </html>
  );
}
