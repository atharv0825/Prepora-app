import { Logo } from "@/components/layout/logo";

// Sign-in / sign-up shell (M1-F1): logo bar on a mint background with the grid texture, content
// centred. No site navigation, so the only choices are "Continue with Google" or go back home.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mint relative flex min-h-dvh flex-1 flex-col overflow-hidden bg-background text-foreground">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0" />
      <header className="container-page relative flex h-16 items-center">
        <Logo />
      </header>
      <main
        id="main"
        className="relative flex flex-1 items-center justify-center px-5 pt-8 pb-[max(4rem,env(safe-area-inset-bottom))]"
      >
        {children}
      </main>
    </div>
  );
}
