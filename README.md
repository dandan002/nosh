# nosh

Restaurant/cafe management platform: seating, order entry, kitchen display,
and (Phase B) billing. This repo is a monorepo holding the web app today,
with native iOS and Android clients planned for later phases (`ios/` and
`android/` are currently empty placeholders).

## Status

Phase A foundation is in place in `web/`:

- Auth (email/password signup + login) via Supabase Auth
- Restaurant onboarding — any signed-in user creates a restaurant and
  becomes its owner; URL handled on the `restaurant` name with slug
  collision retries
- Tenant-scoped routing under `[restaurantSlug]/`, with a `floor` route
  (floor plan editor placeholder)
- Supabase schema + RLS tenancy model (`restaurants`, `staff_members`) in
  `web/supabase/migrations/0001_init.sql`
- shadcn/ui-style primitives in `web/components/ui/` and design tokens in
  `web/app/globals.css` (extracted from the Stitch mockups in
  `web/stitch-export/`)

Floor plan editor, order entry, kitchen display, and billing are not yet
implemented.

## Repo layout

```
.
├── .github/workflows/ci.yml   # lint + typecheck + test, runs in web/
├── android/                    # native client (placeholder)
├── ios/                        # native client (placeholder)
├── web/                        # see web/README.md for the full breakdown
│   ├── app/                    # Next.js App Router routes
│   ├── components/             # ui primitives, auth, nav
│   ├── lib/                    # supabase wiring, server actions, validations
│   └── supabase/migrations/    # schema source of truth
└── README.md                   # this file
```

## Stack

- **Web:** Next.js 16 (App Router) + TypeScript + React 19, Tailwind v4,
  Supabase (Postgres + Auth + Realtime), Zod, React Hook Form, Vitest
- **Package manager:** pnpm (workspace rooted at `web/`)
- **Deploy:** Vercel (target)
- **CI:** GitHub Actions runs `lint`, `typecheck`, and `test` in `web/`

## Getting started

Everything runs out of `web/`. From there:

1. `pnpm install`
2. Copy `web/.env.example` to `web/.env.local` and fill in your Supabase
   project's URL / publishable key (Project Settings → API in the
   Supabase dashboard). See `web/supabase/README.md` for creating the
   project and applying migrations.
3. `pnpm dev` and open http://localhost:3000

### Test login

A persistent `owner`-role account on the "rev" Supabase project, for manual
testing without signing up a new one each time:

- Email: `test@rev.dev`
- Password: `RevTest123!`
- Restaurant: `test-kitchen` (lands on `/test-kitchen/floor` after login)

## Useful commands

From `web/`:

| Command            | What it does                          |
| ------------------ | ------------------------------------- |
| `pnpm dev`         | Start the Next.js dev server          |
| `pnpm build`       | Production build                      |
| `pnpm start`       | Run the production build              |
| `pnpm lint`        | ESLint                                |
| `pnpm typecheck`   | `tsc --noEmit`                        |
| `pnpm test`        | Vitest (single run)                   |

## Tenancy model

Every tenant table carries a non-null `restaurant_id`, has RLS enabled,
and defaults to deny. Policies check membership via a
`SECURITY DEFINER` helper (`is_restaurant_member`) that bypasses RLS on
`staff_members` itself to avoid recursive-policy issues; a
`staff_role_for` helper gates owner/admin-only operations. New tenant
tables should follow the same pattern established in
`web/supabase/migrations/0001_init.sql`. Schema changes only ever go
through migrations — never hand-edit via the Supabase dashboard.