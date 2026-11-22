import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@prepora/ui/components/button";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-start justify-center gap-5 px-6 sm:px-16">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-h1">
        This page <span className="text-accent-serif">isn&apos;t</span> here.
      </h1>
      <p className="text-muted-foreground">There&apos;s no admin page at this address.</p>
      <Link href="/dashboard" className={buttonVariants()}>
        Back to the dashboard
      </Link>
    </main>
  );
}
