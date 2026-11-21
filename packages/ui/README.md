# @prepora/ui

Prepora's design system: theme tokens, typography and shadcn/ui components (Base UI primitives), styled from [Prepora_UI_Design.md](../../Prepora_UI_Design.md). Monochrome: black, white and greys. Mobile-first.

Live reference: **`/design`** in the web app (`pnpm dev:web` → http://localhost:3000/design).

## Using it in an app

1. `"@prepora/ui": "workspace:*"` in the app's `package.json`, and `transpilePackages: ["@prepora/ui"]` in `next.config.ts`.
2. Load the fonts with `next/font` as CSS variables `--font-hanken-grotesk`, `--font-instrument-serif` (see `apps/web/src/app/layout.tsx`).
3. `import "@prepora/ui/globals.css"` once in the root layout, and render `<Toaster />` there.
4. Import components: `import { Button } from "@prepora/ui/components/button"`.

## Light and dark

Tokens are light by default. Add the **`dark`** class to any element (a section, one card, `<html>`) and everything inside it switches to the dark tokens. That's how the landing page goes from a dark hero to white sections.

## Tokens

| Design doc | Tailwind | Value |
|---|---|---|
| bg-dark | `bg-brand-black` | #0A0A0A |
| surface-dark | `bg-brand-surface` | #141414 |
| border-dark | `border-brand-line` | #262626 |
| white | `bg-brand-white` | #FFFFFF |
| bg-light | `bg-brand-stone` | #F5F5F4 |
| text-on-dark-muted | `text-brand-grey` | #A3A3A3 |
| text-on-light-muted | `text-brand-slate` | #525252 |

Prefer the semantic tokens (`bg-background`, `text-foreground`, `text-muted-foreground`, `bg-card`, `border-border`, `bg-primary`…), which flip with `dark`. Use `brand-*` only for values that must not flip.

The only non-grey colour is `destructive` (errors, delete actions), always paired with text or an icon.

## Typography

| Class | Use | Size (phone → desktop) |
|---|---|---|
| `text-display` | Hero headline | 40 → 72px |
| `text-h1` | Page / section titles | 32 → 48px |
| `text-h2` | Section headings | 26 → 36px |
| `text-h3` | Card / sub headings | 20 → 24px |
| `text-lead` | Sub-headline copy | 17 → 20px |
| (body) | Hanken Grotesk 16px | 16px |
| `text-eyebrow` | Small labels | 13px |
| `text-accent-serif` | One emphasised phrase ("Band 8+") | inherits |

Headings and body use Hanken Grotesk (headings light–regular with tight tracking). `h1`–`h4` get `font-heading` automatically.

## Utilities

- `bg-grid`: faint grid for the dark hero, fading out at the bottom (put it on an `absolute inset-0` layer).
- `glass`: floating glass stat card (#141414 at 70%, blur, 1px border).
- `container-page`: max width 76rem with 20px (phone) / 32px (tablet+) side padding.
- `animate-fade-up`, `animate-drift`: section entrance and stat-card float. Turned off for users who prefer reduced motion.

## Components

| Component | Notes |
|---|---|
| `button` | Pill. Variants: `default` (primary CTA), `outline`, `secondary`, `ghost`, `link`, `destructive`. Sizes: `sm` (36px), `default` (44px), `lg` (48px), `icon`, `icon-sm`. Hover inverts. |
| `input`, `textarea`, `label` | 44px pill input, 16px text (stops iOS zoom on focus). `aria-invalid` shows the error state. |
| `card` | ~22px radius, 1px border. `variant`: `default`, `inverted` (solid black on light pages), `glass`, `muted` (stone). `size`: `default`, `sm`. |
| `badge` | Pill. `outline` for the eyebrow label and Platinum marker. |
| `dialog` | Bottom sheet on phones (respects the iPhone safe area), centred dialog from 640px. |
| `sonner` | `<Toaster />` (light by default, bottom-centre) and `toast()`. |

Add more shadcn components from `apps/web`: `pnpm dlx shadcn@4.23.0 add <name>`. The monorepo aliases in `components.json` put them here. Restyle them to match: pill shapes, 1px borders, no colour.
