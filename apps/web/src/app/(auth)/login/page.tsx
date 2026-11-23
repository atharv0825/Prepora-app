import type { Metadata } from "next";
import Link from "next/link";
import { AuthPanel } from "@/components/auth/auth-panel";
import { nextPath } from "@/lib/auth";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Log in · Prepora",
  description: "Log in to Prepora with your Google account.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = nextPath(params.next);
  // Signed-in visitors never reach this page: src/middleware.ts sends them on (M1-F2).

  const error = typeof params.error === "string" ? params.error : null;
  const signupHref = next === routes.app ? routes.signup : `${routes.signup}?next=${encodeURIComponent(next)}`;

  return (
    <AuthPanel
      title={
        <>
          Welcome <span className="text-accent-serif">back</span>
        </>
      }
      description="Log in to pick up where you left off."
      next={next}
      error={error}
      footer={
        <>
          New to Prepora?{" "}
          <Link href={signupHref} className="font-medium text-foreground underline underline-offset-4">
            Create a free account
          </Link>
        </>
      }
    />
  );
}
