# rev — web

Restaurant/cafe management platform: seating, order entry, kitchen display,
and (Phase B) billing. This is the web app; native iOS/Android clients are a
later phase (see `../ios` and `../android`).

## Stack

Next.js (App Router) + TypeScript, Tailwind v4, hand-rolled shadcn/ui-style
components in `components/ui/`, Supabase (Postgres + Auth + Realtime), Zod +
React Hook Form. Deployed on Vercel.

## Setup

1. `pnpm install`
2. Copy `.env.example` to `.env.local` and fill in your Supabase project's
   URL / publishable key (Project Settings → API in the Supabase dashboard).
   See `supabase/README.md` for creating the project and applying migrations.
3. `pnpm dev` and open http://localhost:3000

## Design reference

`stitch-export/` contains the Stitch-generated screen mockups this app is
built against (design system: "Vancouver Modern", light theme). The tokens in
`app/globals.css` are extracted verbatim from those exports — that file is
the intended place to update if the visual design changes.

## Structure

- `app/` — routes. `[restaurantSlug]/` is the authenticated, tenant-scoped
  area (floor plan, orders, kitchen, billing, admin).
- `components/ui/` — base primitives (Button, Input, Card, Label).
- `lib/supabase/` — `@supabase/ssr` client/server wiring.
- `lib/actions/` — Server Actions (auth, onboarding).
- `lib/validations/` — Zod schemas shared by forms and Server Actions.
- `supabase/migrations/` — schema, source of truth (never hand-edit via the
  Supabase dashboard).
- `proxy.ts` — Next.js 16's replacement for `middleware.ts`; refreshes the
  Supabase session and gates unauthenticated access.
