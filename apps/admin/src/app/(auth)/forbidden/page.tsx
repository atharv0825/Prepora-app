import type { Metadata } from "next";
import { ShieldX } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@prepora/ui/components/card";
import { SignOutButton } from "@/components/sign-out-button";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "No access" };

// Signed in, but not admin / content_editor (M1-A1). Only reachable when signed in (middleware).
export default async function ForbiddenPage() {
  const viewer = await getViewer();

  return (
    <main id="main" className="mint flex min-h-dvh items-center justify-center bg-background px-5">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <ShieldX className="mx-auto size-8 text-destructive" strokeWidth={1.5} aria-hidden />
          <CardTitle className="mt-2">No admin access</CardTitle>
          <CardDescription>
            {viewer?.email ? <>You&apos;re signed in as {viewer.email}. </> : null}
            This account isn&apos;t an admin or content editor. Ask an admin to give you access, or sign
            in with a different Google account.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <SignOutButton label="Sign out and switch account" />
        </CardContent>
      </Card>
    </main>
  );
}
