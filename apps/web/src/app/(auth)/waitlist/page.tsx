import type { Metadata } from "next";
import Link from "next/link";
import { WaitlistForm } from "@/components/waitlist/waitlist-form";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Join the waitlist · Prepora",
  description: "Prepora is opening country by country. Join the waitlist for a free beta invite.",
};

// M2-F1: where src/middleware.ts sends visitors on /signup from a country that isn't launched yet
// (country_regions.is_enabled = false). Anyone can open it directly too; it never signs anyone up.
// Log in stays available: existing users may be travelling, and the gate is about new sign-ups.
export default function WaitlistPage() {
  return (
    <div className="flex w-full max-w-md flex-col gap-8">
      <div className="flex flex-col gap-3 text-center">
        <h1 className="text-h1">
          Not in your country <span className="text-accent-serif">yet</span>
        </h1>
        <p className="text-muted-foreground">
          We&apos;re opening Prepora country by country. Join the waitlist and we&apos;ll email you a free
          beta invite as soon as it opens where you are.
        </p>
      </div>

      <WaitlistForm location="signup_gate" className="[&_p]:text-center" />

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={routes.login} className="font-medium text-foreground underline underline-offset-4">
          Log in
        </Link>
      </p>
    </div>
  );
}
