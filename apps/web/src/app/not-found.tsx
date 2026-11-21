import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@prepora/ui/components/button";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { routes } from "@/lib/routes";

export const metadata: Metadata = { title: "Page not found · Prepora" };

// 404 for any unknown URL (and notFound() calls). Renders the shell itself because it sits
// outside the (marketing) layout.
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="dark relative flex flex-1 items-center overflow-hidden">
        <div aria-hidden className="bg-grid pointer-events-none absolute inset-0" />
        <div className="container-page relative flex animate-fade-up flex-col items-start gap-6 pt-40 pb-24 sm:pt-48 sm:pb-32">
          <p className="font-mono text-sm text-muted-foreground">404</p>
          <h1 className="text-display">
            This page <span className="text-accent-serif">isn&apos;t</span> here.
          </h1>
          <p className="max-w-md text-lead text-muted-foreground">
            The link may be broken, or the page may have moved. Let&apos;s get you back to practice.
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link href={routes.home} className={buttonVariants({ size: "lg" })}>
              Go to home
            </Link>
            <Link href={routes.contact} className={buttonVariants({ variant: "outline", size: "lg" })}>
              Contact us
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
