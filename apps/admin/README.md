# @prepora/admin

Admin panel: Next.js 16 (App Router), shared design system `@prepora/ui`, deployed to Cloudflare Workers via OpenNext. Mirrors `apps/web`'s setup.

| Command (from repo root) | What it does |
|---|---|
| `pnpm dev:admin` | Dev server at http://localhost:3001 |
| `pnpm preview:admin` | OpenNext build + run in workerd (needs Linux/WSL or Windows Developer Mode) |
| `pnpm deploy:admin` | Build + deploy to **staging** → https://admin-staging.prepora.site |

- Modules (sidebar, pages, dashboard) are defined once in `src/lib/nav.ts` (plan §6 + milestone per module).
- Module pages share `src/app/(admin)/[section]/page.tsx`, prerendered for the slugs in `nav.ts`; anything else is a 404.
- Never indexed: `robots.txt` disallows all, `noindex` metadata and an `X-Robots-Tag` header; `X-Frame-Options: DENY`.
- **No authentication yet**: admin login + role guard (admin / content_editor) arrive in **M1-A1**. The shell shows no user data until then. Consider putting `admin-staging.prepora.site` behind Cloudflare Access (free for small teams).
- Add shadcn components from this folder (`pnpm dlx shadcn@4.23.0 add <name>`); they're written into `packages/ui`.
