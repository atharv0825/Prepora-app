import { redirect } from "next/navigation";
import { isStaff } from "@prepora/shared/types/profile";
import { MobileBar } from "@/components/mobile-bar";
import { Sidebar } from "@/components/sidebar";
import { adminRoutes } from "@/lib/access";
import { getViewer } from "@/lib/session";

// Admin shell: mint sidebar on desktop, top bar + sheet menu on phones, white content area.
// Access (M1-A1): src/middleware.ts lets only admin/content_editor through; this layout checks
// again (getUser + own profile role) before rendering anything.
export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();
  if (!viewer) redirect(adminRoutes.login);
  if (!isStaff(viewer.role)) redirect(adminRoutes.forbidden);
  const account = { name: viewer.name, email: viewer.email, role: viewer.role };

  return (
    <div className="flex min-h-dvh">
      <Sidebar account={account} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBar account={account} />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8 sm:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
