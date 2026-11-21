import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

// Public pages: dark navbar + black footer. The signed-in app area ((app)/) gets its own shell.
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
