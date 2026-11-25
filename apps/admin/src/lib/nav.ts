import {
  BookOpen,
  ClipboardList,
  Coins,
  FileClock,
  Gauge,
  Globe,
  Headphones,
  type LucideIcon,
  Mic,
  PenLine,
  ScrollText,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";

// Admin modules from Prepora_Implementation_Plan.md §6, with the milestone (plan.md) that
// builds each one. The sidebar, the module pages and the dashboard all read from here.

export type AdminModule = {
  slug: string;
  label: string;
  icon: LucideIcon;
  milestone: string;
  summary: string;
  features: string[];
  /** True once the module has its own page; the placeholder route ([section]) skips it. */
  built?: boolean;
};

export type NavGroup = { title: string; items: AdminModule[] };

export const dashboard: AdminModule = {
  slug: "dashboard",
  label: "Dashboard",
  icon: Gauge,
  milestone: "M11",
  summary: "Key numbers for the business at a glance.",
  features: [
    "Daily and monthly active users",
    "New sign-ups by country",
    "Gold and Platinum conversions, revenue by currency",
    "AI cost this month (from PostHog insights)",
  ],
};

export const navGroups: NavGroup[] = [
  { title: "Overview", items: [dashboard] },
  {
    title: "Content",
    items: [
      {
        slug: "speaking",
        label: "Speaking",
        icon: Mic,
        milestone: "M7–M8",
        summary: "Part 1 question sets, Part 2 cue cards and linked Part 3 discussions.",
        features: [
          "Part 1 question sets",
          "Part 2 cue cards with bullet points",
          "Part 3 discussions linked to a Part 2 topic",
          "Draft → review → published workflow",
        ],
      },
      {
        slug: "writing",
        label: "Writing",
        icon: PenLine,
        milestone: "M6",
        summary: "Task 1 reports and letters, Task 2 essay prompts.",
        features: [
          "Academic Task 1 with chart image upload",
          "General Training Task 1 letters",
          "Task 2 essay prompts",
        ],
      },
      {
        slug: "reading",
        label: "Reading",
        icon: BookOpen,
        milestone: "M4",
        built: true, // M4-A1: builder (3 passages, 11 question types), preview, publish
        summary: "Build tests: 3 passages and all 11 question types.",
        features: [
          "Create a test → 3 passages → questions",
          "A form for each of the 11 question types",
          "Answer keys and explanations",
          "Minimum plan per test",
        ],
      },
      {
        slug: "listening",
        label: "Listening",
        icon: Headphones,
        milestone: "M5",
        summary: "Build tests: 4 sections, audio upload, 40 questions.",
        features: [
          "4 sections with audio uploaded to R2",
          "40 questions incl. map/diagram labelling images",
          "Transcripts and accents",
          "Minimum plan per test",
        ],
      },
      {
        slug: "review-queue",
        label: "AI review queue",
        icon: Sparkles,
        milestone: "M10",
        summary: "Approve, edit or reject AI-generated content before it's published.",
        features: [
          "Generated cue cards, writing prompts and reading passages",
          "Approve / edit / reject",
          "Publish to everyone or only to the requesting Platinum user",
        ],
      },
    ],
  },
  {
    title: "People",
    items: [
      {
        slug: "users",
        label: "Users",
        icon: Users,
        milestone: "M2",
        built: true, // M2-A1: list, search, filters, profile view
        summary: "Search users, view progress, change plans for support cases.",
        features: [
          "Search by email or name, filter by country and plan",
          "Profile and progress",
          "Manual plan change, suspend",
        ],
      },
      {
        slug: "waitlist",
        label: "Waitlist",
        icon: ClipboardList,
        milestone: "M2",
        built: true, // M2-A2: list by country and status, CSV export
        summary: "Beta waitlist by country, CSV export and invites.",
        features: [
          "Sign-ups by country and source",
          "CSV export",
          "Send beta invites (M12)",
        ],
      },
    ],
  },
  {
    title: "Business",
    items: [
      {
        slug: "countries",
        label: "Countries",
        icon: Globe,
        milestone: "M2",
        built: true, // M2-A2: launch waves, one switch per country
        summary: "Launch waves: switch sign-up on or off per country.",
        features: [
          "Countries grouped by launch wave",
          "Enable or disable sign-up per country",
          "People waiting per country",
        ],
      },
      {
        slug: "plans",
        label: "Plans & pricing",
        icon: ScrollText,
        milestone: "M3",
        built: true, // M3-A1: limits per plan, credit cost per action (prices come with M9)
        summary: "Credits, allowances and caps per plan; regional prices.",
        features: [
          "Monthly credits, allowances and daily caps per plan",
          "Credit cost per action",
          "Regional prices, exam packs, top-ups",
        ],
      },
      {
        slug: "credits",
        label: "Credits",
        icon: Coins,
        milestone: "M3",
        built: true, // M3-A2: recent grants and refunds; per-user tools on the user page
        summary: "User balances and ledger; grants and refunds; real AI cost per credit.",
        features: [
          "Balance and full ledger per user",
          "Grant or refund credits (support)",
          "Real AI cost per credit from ai_usage (M11)",
        ],
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        slug: "config",
        label: "Config",
        icon: Settings,
        milestone: "M11",
        summary: "Maintenance mode, announcement banner, beta mode.",
        features: ["Maintenance mode", "Announcement banner", "Beta mode"],
      },
      {
        slug: "audit-log",
        label: "Audit log",
        icon: FileClock,
        milestone: "M11",
        summary: "Who changed what, and when.",
        features: ["Every admin change with who, what and when", "Filter by admin and entity"],
      },
    ],
  },
];

/** All modules except the dashboard (it has its own page). */
export const sectionModules = navGroups.flatMap((g) => g.items).filter((m) => m.slug !== "dashboard");

/** Modules still shown as "what you'll do here" placeholders. */
export const placeholderModules = sectionModules.filter((m) => !m.built);

export function findModule(slug: string): AdminModule | undefined {
  return navGroups.flatMap((g) => g.items).find((m) => m.slug === slug);
}

export function isActive(pathname: string, slug: string): boolean {
  return pathname === `/${slug}` || pathname.startsWith(`/${slug}/`);
}
