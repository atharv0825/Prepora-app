import type { StaffRole } from "@prepora/shared/types/profile";
import { SignOutButton } from "./sign-out-button";

export type AdminAccount = { name: string; email: string | null; role: StaffRole };

const roleLabel: Record<StaffRole, string> = { admin: "Admin", content_editor: "Content editor" };

/** Who is signed in + Sign out (M1-A1). Used in the sidebar and the mobile menu. */
export function AccountBlock({ account }: { account: AdminAccount }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{account.name}</p>
        {account.email && <p className="truncate text-xs text-muted-foreground">{account.email}</p>}
        <p className="mt-1 inline-flex rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {roleLabel[account.role]}
        </p>
      </div>
      <SignOutButton className="self-start" />
    </div>
  );
}
