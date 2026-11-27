import Link from "next/link";
import type { AdminAuditEntry } from "@prepora/shared/api/admin-credits";
import { auditBy, auditNote, auditText } from "@/lib/credits";
import { formatDateTime } from "@/lib/users";

/** audit_log rows, newest first (M3-A1/A2): what changed, the admin's note, who and when. */
export function AuditList({
  entries,
  costLabels,
  empty,
  linkUsers = false,
}: {
  entries: AdminAuditEntry[];
  costLabels: Record<string, string>;
  empty: string;
  /** Link user entities to their page (the Credits overview lists several users). */
  linkUsers?: boolean;
}) {
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol className="divide-y divide-border rounded-2xl border border-border">
      {entries.map((e) => {
        const note = auditNote(e);
        return (
          <li key={e.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
            <span className="font-medium">{auditText(e, costLabels)}</span>
            {note && <span className="text-muted-foreground">&ldquo;{note}&rdquo;</span>}
            <span className="text-xs text-muted-foreground">
              {auditBy(e)} · <time dateTime={e.at}>{formatDateTime(e.at)}</time>
              {linkUsers && e.entity === "user" && e.entity_id && (
                <>
                  {" · "}
                  <Link href={`/users/${e.entity_id}`} className="underline underline-offset-4 hover:text-foreground">
                    View user
                  </Link>
                </>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
