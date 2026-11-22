import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthPanel } from "@/components/auth/auth-panel";
import { nextPath } from "@/lib/auth";
import { routes } from "@/lib/routes";
import { getCurrentUser } from "@/lib/supabase/session";

export const metadata: Metadata = {
  title: "Create your account · Prepora",
  description: "Start practising IELTS with AI feedback. Sign up free with Google.",
};

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const params = await searchParams;
  const next = nextPath(params.next);
  if (await getCurrentUser()) redirect(next);

  const error = typeof params.error === "string" ? params.error : null;
  const loginHref = next === routes.app ? routes.login : `${routes.login}?next=${encodeURIComponent(next)}`;

  return (
    <AuthPanel
      title={
        <>
          Start practising <span className="text-accent-serif">free</span>
        </>
      }
      description="Create your Prepora account with Google. No password to remember."
      next={next}
      error={error}
      footer={
        <>
          Already have an account?{" "}
          <Link href={loginHref} className="font-medium text-foreground underline underline-offset-4">
            Log in
          </Link>
        </>
      }
    >
      <p className="text-center text-xs text-muted-foreground">
        By continuing you agree to our{" "}
        <Link href={routes.terms} className="underline underline-offset-4">
          Terms
        </Link>{" "}
        and{" "}
        <Link href={routes.privacy} className="underline underline-offset-4">
          Privacy Policy
        </Link>
        .
      </p>
    </AuthPanel>
  );
}
