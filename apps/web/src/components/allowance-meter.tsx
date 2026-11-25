import Link from "next/link";
import { meterPercent } from "@/lib/credits";
import { routes } from "@/lib/routes";

/**
 * "Reading tests this month: 1 of 2 used", with a meter, and an upgrade link once they're used up
 * (M4-F1; shared with the Listening page). allowance comes from get_my_credits (M3-B5).
 */
export function AllowanceMeter({ module, used, limit }: { module: "Reading" | "Listening"; used: number; limit: number }) {
  return (
    <section aria-label={`${module} tests this month`} className="flex flex-col gap-2 rounded-3xl border border-black/5 bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium">{module} tests this month</p>
        <p className="text-sm text-muted-foreground" data-testid="allowance">
          {used} of {limit} used
        </p>
      </div>
      <div
        role="meter"
        aria-label={`${module} tests used`}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${meterPercent(used, limit)}%` }} />
      </div>
      {used >= limit && (
        <p className="text-sm">
          You&apos;ve used this month&apos;s {module} tests.{" "}
          <Link href={routes.upgrade} className="font-medium underline underline-offset-4">
            See plans
          </Link>{" "}
          for more.
        </p>
      )}
    </section>
  );
}
