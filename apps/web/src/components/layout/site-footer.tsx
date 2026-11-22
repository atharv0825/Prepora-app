import Link from "next/link";
import { footerNav } from "@/lib/routes";
import { Logo } from "./logo";

const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
const commit = process.env.NEXT_PUBLIC_COMMIT_SHA ?? "dev";

/** Light-green footer with teal links, Privacy, Terms, Delete account and the app version
 *  (design doc §4, plan §9). */
export function SiteFooter() {
  return (
    <footer className="mint mt-auto border-t border-border">
      <div className="container-page grid gap-10 py-12 sm:py-16 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">
            IELTS Speaking, Writing, Reading and Listening practice with instant AI band scores.
          </p>
        </div>
        {footerNav.map((group) => (
          <nav key={group.title} aria-label={group.title} className="flex flex-col gap-3">
            <p className="text-sm font-medium text-foreground">{group.title}</p>
            <ul className="flex flex-col gap-2.5">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Prepora</p>
          <p className="font-mono" title={`Version ${version}, commit ${commit}`}>
            v{version} · {commit}
          </p>
        </div>
      </div>
    </footer>
  );
}
