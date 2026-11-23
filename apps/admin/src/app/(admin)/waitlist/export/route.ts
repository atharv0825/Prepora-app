import { NextResponse, type NextRequest } from "next/server";
import {
  parseAdminWaitlistQuery,
  waitlistCsv,
  waitlistCsvFilename,
  type WaitlistEntry,
} from "@prepora/shared/api/admin-waitlist";
import { createClient } from "@/lib/supabase/server";
import { waitlistSelect } from "@/lib/waitlist";

// M2-A2: CSV export of the waitlist with the page's filters (?country=&status=).
// src/middleware.ts already requires a staff session; this checks for an admin itself, and the
// database (RLS) only returns rows to admins anyway. Cells are formula-safe (csvField).

/** PostgREST returns at most 1000 rows per request; fetch in batches up to this many. */
const BATCH = 1000;
const MAX_ROWS = 50_000;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse("Sign in first.", { status: 401 });

  const { data: isAdmin, error: roleError } = await supabase.rpc("is_admin");
  if (roleError || !isAdmin) return new NextResponse("Admins only.", { status: 403 });

  const query = parseAdminWaitlistQuery(Object.fromEntries(request.nextUrl.searchParams));
  const rows: WaitlistEntry[] = [];
  for (let from = 0; from < MAX_ROWS; from += BATCH) {
    const { data, error } = await waitlistSelect(supabase, query).range(from, from + BATCH - 1);
    if (error) {
      console.error("waitlist export failed", error.code, error.message);
      return new NextResponse("Export failed. Please try again.", { status: 500 });
    }
    rows.push(...(data as WaitlistEntry[]));
    if (data.length < BATCH) break;
  }

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(waitlistCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${waitlistCsvFilename(query, today)}"`,
      // Personal data: never store it in a shared or browser cache.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
