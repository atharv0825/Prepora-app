import { MobileBar } from "@/components/mobile-bar";
import { Sidebar } from "@/components/sidebar";

// Admin shell: mint sidebar on desktop, top bar + sheet menu on phones, white content area.
// Access control (Supabase Auth + role guard) arrives in M1-A1.
export default function AdminLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBar />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8 sm:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
