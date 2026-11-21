# @prepora/web

Student web app: Next.js 16 (App Router, TypeScript), Tailwind v4, shadcn/ui (base-nova), deployed to Cloudflare Workers via [OpenNext](https://opennext.js.org/cloudflare).

| Command (from repo root) | What it does |
|---|---|
| `pnpm dev:web` | Next dev server at http://localhost:3000 |
| `pnpm preview:web` | OpenNext build + run in the real Workers runtime (workerd) at http://localhost:8787 |
| `pnpm deploy:web` | Build + deploy to **staging** (`prepora-web-staging`). Needs `wrangler login`. |
| `pnpm --filter @prepora/web run deploy -- --env production` | Deploy to production (`prepora-web`) |
| `pnpm --filter @prepora/web typecheck` / `lint` | Checks |

**Windows:** the OpenNext build creates symlinks, which Windows only allows with **Developer Mode** on (Settings → System → For developers) or in WSL. `pnpm dev:web` works without it. CI builds on Linux.

Add shadcn components with `pnpm dlx shadcn@4.23.0 add <name>` from this folder. (They move to `packages/ui` in M0-F2.)
