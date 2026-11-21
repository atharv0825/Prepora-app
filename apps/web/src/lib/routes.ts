// Every link used by the shell, in one place. Pages that don't exist yet are marked with the
// milestone that adds them; until then they resolve to the 404 page.

export const routes = {
  home: "/",
  modules: "/#modules", // M0-F4 landing sections
  howItWorks: "/#how-it-works", // M0-F4
  pricing: "/#pricing", // M0-F4 (full pricing page in M9)
  contact: "/#contact", // M0-F4
  login: "/login", // M1
  signup: "/signup", // M1
  privacy: "/privacy", // M11
  terms: "/terms", // M11
  deleteAccount: "/account/delete", // M11 (required by Play Store, design doc §4)
  status: "/status",
} as const;

export const mainNav = [
  { label: "Home", href: routes.home },
  { label: "Modules", href: routes.modules },
  { label: "How it works", href: routes.howItWorks },
  { label: "Pricing", href: routes.pricing },
  { label: "Contact", href: routes.contact },
] as const;

export const footerNav = [
  {
    title: "Product",
    links: [
      { label: "Modules", href: routes.modules },
      { label: "How it works", href: routes.howItWorks },
      { label: "Pricing", href: routes.pricing },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Contact", href: routes.contact },
      { label: "Status", href: routes.status },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: routes.privacy },
      { label: "Terms", href: routes.terms },
      { label: "Delete account", href: routes.deleteAccount },
    ],
  },
] as const;

/** Exact match for "/", otherwise path prefix. Hash links (/#…) are never "active". */
export function isActive(pathname: string, href: string): boolean {
  if (href.includes("#")) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
