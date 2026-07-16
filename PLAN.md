# rev — Restaurant/Cafe Management Platform — Plan

## Context

Multi-tenant SaaS platform for restaurants/cafes: seating/floor-plan management, order entry, a kitchen display, and billing/transactions. Web first (`web/`), hosted on Vercel with Postgres on Supabase; native iOS/Android (`ios/`, `android/`) are a later phase — the web app is built responsively so it's usable on a kitchen tablet or server's phone browser in the meantime.

Branding: product name is **rev** (the repo/folder is still named "nosh" from before the Stitch mockups landed — cosmetic only, not worth a rename yet).

Key decisions:
- **Multi-tenant SaaS** — tenant isolation via `restaurant_id` + Postgres RLS from day one.
- **Real Stripe payment processing** (Phase B), not manual "mark as paid."
- **Build order: deep on the core service loop first** — seating/floor plan + order entry + kitchen ticket flow + item delivery/completion tracking (**Phase A**) — with billing/checkout/Stripe (**Phase B**) as a fast-follow. Data model is designed for both phases up front.
- **Visual design**: driven by Stitch-exported mockups in `web/stitch-export/` (design system "Vancouver Modern", light theme — forest green primary `#173124`, cream background `#fbf9f4`, Geist font, Material Symbols icons). Tokens are extracted verbatim into `web/app/globals.css`, which is the swap point if the design changes.

## Tech Stack (as built)

- Next.js 16 (App Router, Turbopack) + TypeScript, deployed to Vercel.
- Tailwind v4 with hand-rolled shadcn/ui-style primitives in `components/ui/` (`ui.shadcn.com` wasn't reachable via the CLI, so Button/Input/Card/Label were written by hand against the extracted design tokens — visually verified against the mockups in-browser).
- Supabase: Postgres + Auth + (future) Realtime, via `@supabase/supabase-js` + `@supabase/ssr`. No ORM — RLS is the tenancy enforcement layer.
- Zod + React Hook Form for forms/validation.
- pnpm. Vitest for unit tests. Playwright reserved for a later E2E smoke test once there's more UI surface.

## Status

### Phase A — core service loop

**Done (first PR-sized slice, verified end-to-end against a real Supabase project):**
- [x] Next.js/Tailwind/shadcn-style scaffold, design tokens matching Stitch mockups
- [x] `supabase/migrations/0001_init.sql` — `restaurants`, `staff_members`, `is_restaurant_member()`/`staff_role_for()` RLS helpers, hardened per Supabase's security/performance advisors (see "Fixes found via live testing" below)
- [x] `lib/supabase/{client,server}.ts` (`@supabase/ssr`), `proxy.ts` (Next 16's rename of `middleware.ts`) gating unauthenticated access
- [x] Auth: signup, login, logout Server Actions; email-confirmation callback route (`app/auth/confirm`)
- [x] Onboarding: restaurant creation (name → slug, owner `staff_members` row)
- [x] Tenant shell: `app/[restaurantSlug]/layout.tsx` resolves restaurant + membership; sidebar nav matching the mockup's hover-expand icon rail
- [x] `app/[restaurantSlug]/floor/page.tsx` — placeholder only
- [x] CI: `.github/workflows/ci.yml` (lint/typecheck/test), Vitest with passing tests
- [x] **Live-verified**: real signup → email confirm → login → create restaurant → land on `/the-cedar-room/floor` with correct sidebar/membership state, against the actual "rev" Supabase project. Test data cleaned up afterward.

**Fixes found via live testing against the real Supabase project (2026-07-16):**
- Restaurant creation was silently broken: `INSERT ... RETURNING` on `restaurants` failed RLS because the SELECT policy (`is_restaurant_member`) can't be true until the *next* insert (the owner's `staff_members` row) exists — a bootstrap chicken-and-egg. Fixed by generating the restaurant's UUID client-side in `lib/actions/onboarding.ts` and skipping the read-back instead of requesting `RETURNING`.
- `anon` could call the `is_restaurant_member`/`staff_role_for` SECURITY DEFINER helpers despite an explicit `revoke ... from public` in the migration — Supabase grants `EXECUTE` to `anon` directly at function-creation time, not just via `PUBLIC`. Fixed with an explicit `revoke ... from anon`.
- Redundant overlapping SELECT policy on `staff_members` (perf advisor). Split the old `for all` "owners and admins" policy into separate INSERT/UPDATE/DELETE policies so it no longer duplicates the SELECT already granted by the membership policy.
- All three fixes applied live via the Supabase MCP and folded back into `supabase/migrations/0001_init.sql` so a fresh `db push` reproduces the same, correct state.

**Not started:**
- [ ] Floor plan visualization (read-only) — tables via `pos_x`/`pos_y`, colored by status
- [ ] Floor plan admin editor — add/move tables, assign sections
- [ ] Menu management — categories, items, modifier groups CRUD
- [ ] Order entry — pick table/session, browse menu, add items + modifiers, "send to kitchen"
- [ ] Kitchen display — realtime tickets grouped by order/table, tap to advance status
- [ ] Delivery/completion tracking — server sees "ready" items live, marks delivered
- [ ] Realtime wiring (Supabase Realtime on `order_items`/`tables`/`table_sessions`)
- [ ] Responsive/tablet polish pass
- [ ] Migrations for `floor_sections`, `tables`, `table_sessions`, `menu_categories`, `menu_items`, `modifier_groups`, `modifiers`, `orders`, `order_items`, `order_item_modifiers` (schema designed in the original plan, not yet migrated)
- [ ] Demo-restaurant seed script
- [ ] Playwright E2E smoke test (seat table → order → kitchen → deliver)

### Phase B — billing fast-follow (not started)
- [ ] Stripe Connect Express account onboarding per restaurant
- [ ] Check generation from a session's `order_items`
- [ ] Payment collection (destination charges, `application_fee_amount`)
- [ ] Split billing (even / by-seat / by-item)
- [ ] Tips, receipts, transaction history/reporting
- [ ] `checks`, `check_items`, `payments`, `stripe_webhook_events` migrations

## Repo Structure (as built)

```
nosh/                          (repo root; product name is "rev", folder name unchanged)
  README.md
  .github/workflows/ci.yml
  ios/, android/                (empty — future native clients)
  web/
    app/
      (auth pages: login/, signup/, auth/confirm, auth/auth-code-error)
      onboarding/restaurant/
      [restaurantSlug]/         (layout.tsx = tenant shell; floor/ = placeholder)
      page.tsx                  (redirects to last restaurant or onboarding)
    components/{ui,auth,nav}/
    lib/
      supabase/{client,server}.ts
      actions/{auth,onboarding}.ts
      validations/{auth,onboarding}.ts
      data/restaurant.ts
      slug.ts (+ slug.test.ts)
    proxy.ts
    supabase/
      migrations/0001_init.sql
      README.md
    stitch-export/                (Stitch mockups — design reference, already landed)
    vitest.config.ts
```

## Next Steps (suggested order)

1. Migrations for the remaining Phase A tables (floor plan, menu, orders) — designed already in the original plan's data model, just not yet written as SQL.
2. Floor plan visualization + admin editor (`app/[restaurantSlug]/floor`), replacing the current placeholder.
3. Menu management CRUD.
4. Order entry screen.
5. Kitchen display + Supabase Realtime wiring.
6. Delivery/completion tracking to close the Phase A loop.
7. Seed script + Playwright smoke test once the loop is end-to-end.

## Verification

Local: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (all passing as of 2026-07-16). Manual: exercise each new screen against the real Supabase project via `pnpm dev`, using the Supabase MCP (`get_advisors`, `execute_sql`) to check RLS/policy correctness after any schema change — this is how the three bugs above were caught, since `next build` and Vitest alone didn't surface them.
