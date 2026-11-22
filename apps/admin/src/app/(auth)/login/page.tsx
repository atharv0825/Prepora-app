import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@prepora/ui/components/card";
import { GoogleButton } from "@/components/google-button";
import { Logo } from "@/components/logo";
import { adminNext } from "@/lib/access";

export const metadata: Metadata = { title: "Sign in" };

const errors: Record<string, string> = {
  cancelled: "Google sign-in was cancelled.",
  callback: "We couldn't finish signing you in. Please try again.",
  config: "Sign-in isn't available right now.",
};

// Admin sign-in (M1-A1). Signed-in staff never see this page (middleware sends them on);
// signed-in non-staff are sent to /forbidden.
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = adminNext(typeof params.next === "string" ? params.next : null);
  const error = typeof params.error === "string" && Object.hasOwn(errors, params.error) ? errors[params.error] : null;

  return (
    <main id="main" className="mint flex min-h-dvh items-center justify-center bg-background px-5">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo className="mx-auto" />
          <CardTitle className="mt-4 flex items-center justify-center gap-2">
            <Lock className="size-4" strokeWidth={1.5} aria-hidden /> Admin sign-in
          </CardTitle>
          <CardDescription>For Prepora admins and content editors.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <GoogleButton next={next} />
        </CardContent>
      </Card>
    </main>
  );
}
