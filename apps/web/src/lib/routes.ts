// Every link used by the shell, in one place. Pages that don't exist yet are marked with the
// milestone that adds them; until then they resolve to the 404 page.

/**
 * true: the header shows "Join waitlist" (→ the landing form) and hides "Log in".
 * false since M1-F1: sign-up and login exist (Google), so the header shows "Log in" / "Start free".
 * While Google's consent screen is in "Testing", only listed test users can actually sign in.
 */
export const waitlistMode = false;

export const routes = {
  home: "/",
  waitlist: "/#waitlist", // M0-F4 landing form
  modules: "/#modules", // landing sections (M0-F4)
  howItWorks: "/#how-it-works",
  pricing: "/#pricing", // full pricing page in M9
  contact: "/#contact", // final CTA section; a real contact page/email later
  login: "/login", // M1-F1
  signup: "/signup", // M1-F1
  waitlistPage: "/waitlist", // M2-F1: where /signup sends visitors from countries not launched yet
  authCallback: "/auth/callback", // M1-F1, Google OAuth return (docs/auth.md)
  app: "/app", // signed-in home (M1-F1 placeholder)
  profile: "/app/profile", // M1-F3
  onboarding: "/app/onboarding", // M2-F2: 3 steps after the first sign-in
  credits: "/app/credits", // M3-F1: "Credits & usage"
  // M3-F3: where the upgrade / top-up buttons go. A placeholder page until billing (M9-F3).
  upgrade: "/app/plans",
  topUp: "/app/plans#top-up",
  reading: "/app/reading", // M4-F1: test list (+ ?type=academic|general|all)
  listening: "/app/listening", // Listening home: test list, allowance, attempts
  writing: "/app/writing", // M6-F1/F4: task list (+ ?type=academic|general|all), history and band trend
  speaking: "/app/speaking", // M7-F2/M8-F3: the full test, Parts 1–3 practice, the student's tests and answers
  plan: "/app/plan", // M8.7-F2: the student's study plan
  privacy: "/privacy", // M11
  terms: "/terms", // M11
  deleteAccount: "/account/delete", // M11 (required by Play Store, design doc §4)
  status: "/status",
} as const;

/** Reading pages with an id: the player (M4-F2) and one attempt's results (M4-F4). */
export const readingTestPath = (testId: string) => `/app/reading/${testId}`;
export const readingAttemptPath = (attemptId: string) => `/app/reading/attempts/${attemptId}`;

/** Listening pages with an id: the test (M5-I1) and one past attempt's results. */
export const listeningTestPath = (testId: string) => `/app/listening/${testId}`;
export const listeningAttemptPath = (attemptId: string) => `/app/listening/attempts/${attemptId}`;

/** Writing pages with an id: the editor (M6-F1/F2; ?photo=1 opens the photo flow) and one submission's feedback (M6-F3). */
export const writingTaskPath = (taskId: string, opts: { photo?: boolean } = {}) => `/app/writing/${taskId}${opts.photo ? "?photo=1" : ""}`;
/** A Writing task's topics: /app/writing/tasks/1 (+ ?type=academic|general|all). */
export const writingTaskListPath = (taskNo: 1 | 2, type?: string) => `/app/writing/tasks/${taskNo}${type ? `?type=${type}` : ""}`;
/** M8.7-F1 "Pick for me": redirects to a random item of that kind the student hasn't done. */
export const pickPath = (kind: string) => `/app/pick/${kind}`;
export const writingSubmissionPath = (submissionId: string) => `/app/writing/submissions/${submissionId}`;

/** Speaking pages with an id: a cue card's recorder (M7-F1/F2) and one scored answer (M7-F3). */
export const speakingTopicPath = (topicId: string) => `/app/speaking/${topicId}`;
/** Speaking Part 1 question sets or Part 2 cue cards: /app/speaking/parts/1 or /2. */
export const speakingPartPath = (part: 1 | 2) => `/app/speaking/parts/${part}`;
export const speakingResponsePath = (responseId: string) => `/app/speaking/responses/${responseId}`;
/** M8-F1: practise Part 1 (a question set) or Part 3 (a discussion) with the AI examiner. */
export const speakingExaminerPath = (topicId: string) => `/app/speaking/examiner/${topicId}`;
/**
 * M8-F2: the full test. `session` resumes one; p1/card/p3 are its topics (kept in the URL so a
 * reload asks the same questions); `not` avoids a cue card (for "Next cue card").
 */
export const speakingTestPath = (opts: { session?: string; p1?: string; card?: string; p3?: string; not?: string } = {}) => {
  const q = new URLSearchParams(Object.entries(opts).filter((e): e is [string, string] => Boolean(e[1])));
  return `/app/speaking/test${q.size ? `?${q}` : ""}`;
};
/** M8-F3: a session's results: the overall band and each part's. */
export const speakingSessionPath = (sessionId: string) => `/app/speaking/sessions/${sessionId}`;

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

/** The test-type dropdown's targets for a list page: ?type=academic | general | all. */
export function filterHrefs(base: string): Record<"academic" | "general" | "all", string> {
  return { academic: `${base}?type=academic`, general: `${base}?type=general`, all: `${base}?type=all` };
}
