import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@prepora/ui/components/card";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Sign in" };

// Placeholder: Supabase Auth + role guard (admin / content_editor) arrive in M1-A1.
export default function LoginPage() {
  return (
    <main id="main" className="mint flex min-h-dvh items-center justify-center bg-background px-5">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo className="mx-auto" />
          <CardTitle className="mt-4 flex items-center justify-center gap-2">
            <Lock className="size-4" strokeWidth={1.5} aria-hidden /> Admin sign-in
          </CardTitle>
          <CardDescription>
            Sign-in for admins and content editors arrives in milestone M1.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Link href="/dashboard" className="text-sm underline underline-offset-4">
            Continue to the dashboard preview
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
