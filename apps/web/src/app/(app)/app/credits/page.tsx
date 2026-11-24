import type { Metadata } from "next";
import { AllowanceList, BalanceCard, BucketList, CreditsUnavailable, HistoryList } from "@/components/credits/credits-usage";
import { fetchLedger, historyRows } from "@/lib/credits";
import { validTimeZone } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";
import { getAccount, getCreditCosts, getMyCredits } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Credits & usage · Prepora", robots: { index: false } };

// "Credits & usage" (M3-F1): balance and today's limit, credits by bucket with expiry, monthly
// test allowances and the history from credit_ledger. All read through RLS (the user's own rows)
// and get_my_credits (M3-B5). The layout checks the session.
export default async function CreditsPage() {
  const account = await getAccount();
  if (!account) return null; // the layout redirects first
  const timeZone = validTimeZone(account.profile?.timezone);
  const [credits, costs, ledger] = await Promise.all([getMyCredits(), getCreditCosts(), fetchLedger(await createClient())]);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-8 pb-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">Credits &amp; usage</h1>
        <p className="text-muted-foreground">AI scoring of Writing and Speaking uses credits. Practice tests use a monthly allowance.</p>
      </div>

      {credits ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <BalanceCard credits={credits} timeZone={timeZone} />
            <BucketList credits={credits} timeZone={timeZone} />
          </div>
          <AllowanceList credits={credits} />
          <HistoryList rows={ledger ? historyRows(ledger, costs) : []} timeZone={timeZone} />
        </>
      ) : (
        <CreditsUnavailable />
      )}
    </div>
  );
}
