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

**Done (schema, 2026-07-16):**
- [x] `supabase/migrations/0002_floor_menu_orders.sql` — `floor_sections`, `tables`, `table_sessions`, `menu_categories`, `menu_items`, `modifier_groups`, `modifiers`, `orders`, `order_items`, `order_item_modifiers`, all with `restaurant_id` + RLS (members read; owner/admin/manager write floor plan & menu; owner/admin/manager/server write sessions/orders; kitchen role can additionally advance `order_items.status`). Applied live to the "rev" Supabase project and verified clean against `get_advisors` (no new WARNs; the only remaining security/performance WARNs are the pre-existing ones already accepted in 0001).

**Fixes found via code review (2026-07-16):**
- `table_sessions` had no constraint stopping two concurrent "seat this table" writes from both creating an `active` session for the same table. Fixed with a partial unique index, `table_sessions_one_active_per_table_idx` on `(table_id) where status = 'active'`, replacing the old plain index.
- `modifiers` had no soft-delete flag, but `order_item_modifiers.modifier_id` uses `on delete restrict` — once a modifier had ever been ordered it could never be removed. Added `modifiers.active`, mirroring `menu_items.active`.
- The `staff_role_for(restaurant_id) in (...)` role-tier check was hand-copied ~40 times across the write policies. Factored into `is_manager_or_above()` / `is_server_or_above()` / `is_kitchen_or_above()` helper functions (same convention as `is_restaurant_member`/`staff_role_for` from 0001) so a role-tier change only needs to happen in one place.
- Accepted risk (not fixed): `restaurant_id` is denormalized onto every table with nothing (no composite FK, no trigger) verifying a child row's `restaurant_id` matches its parent's. Same tradeoff already made for `staff_members` in 0001 — documented in a comment at the top of `0002_floor_menu_orders.sql`; revisit with composite FKs or a validating trigger if it ever proves insufficient.
- All fixes applied live via the Supabase MCP and folded back into `supabase/migrations/0002_floor_menu_orders.sql` so a fresh `db push` reproduces the same, correct state.

**Done (floor plan visualization, 2026-07-16):**
- [x] `app/[restaurantSlug]/floor/page.tsx` — read-only floor plan view, replacing the placeholder. Server Component; `lib/data/floor.ts` fetches `floor_sections` with nested `tables` from Supabase; section switcher via `?section=<id>` search param; status legend (available/occupied/reserved/dirty) with live counts; tables rendered absolutely-positioned via `pos_x`/`pos_y`, styled by shape (round/square/rectangle) and status, matching the `seating-manager` Stitch mockup. Empty states for "no floor plan yet" and "no tables in this section yet."
- [x] `lib/floor-plan-styles.ts` — status/shape → Tailwind class maps, factored out of the page so the upcoming admin editor and order-entry table picker can reuse the same vocabulary instead of copy-pasting it.
- [x] **Live-verified** against the real Supabase project: created a test restaurant via the actual signup → onboarding flow, inserted floor plan data via the Supabase MCP, confirmed rendering (multi-section switching, all 4 status styles, empty states) via Playwright screenshots. Test data cleaned up afterward.

**Fixes found via code review (2026-07-16):**
- `getFloorPlan` discarded the Supabase query error and silently rendered "no floor plan" on any failure (RLS bug, transient error), unlike `lib/data/restaurant.ts`'s pattern of surfacing failures. Now throws on error.
- `getRestaurantForSlug` was called once in `[restaurantSlug]/layout.tsx` and again in `floor/page.tsx`, doubling auth + Supabase round-trips per request. Wrapped in React's `cache()` to dedupe within a render pass.
- `.floorplan-bg`'s grid lines used `--color-outline-variant` (#c2c8c2) instead of the mockup's actual #e4e2dd (`--color-surface-variant`) — visibly darker than spec. Fixed the token.
- All fixes verified against a fresh `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, plus a second live Playwright pass confirming the corrected grid color.

**Done (floor plan admin editor, 2026-07-16):**
- [x] `components/floor/{floor-workspace,add-table-form,section-manager}.tsx` — manager-only "Edit Layout" mode on the floor page: add/rename/delete floor sections, add/delete tables, drag tables to reposition (plain pointer events, no drag library). `lib/actions/floor.ts` — Server Actions for all six mutations; `lib/validations/floor.ts` — Zod schemas. Gated by `isManagerOrAbove()` (new helper in `lib/data/restaurant.ts`, mirrors the SQL `is_manager_or_above()` role tier) — non-managers see the existing read-only view with no edit affordances.
- [x] **Live-verified** against the real Supabase project: logged in as an owner, added/renamed/dragged/deleted sections and tables through the actual UI, confirmed persistence via direct DB queries; logged in as a `server`-role account and confirmed edit controls are correctly hidden.

**Fixes found via code review (2026-07-16):**
- Dragging a table set a local `dragOverrides` position that was never cleared after the drag finished, so a dragged table's on-screen position permanently ignored the server's actual data (including masking a failed save). Now cleared unconditionally in `handleDragEnd`, regardless of outcome.
- `updateTablePosition`/`deleteTable`/`deleteFloorSection`/`renameFloorSection` only checked for a Postgres *error*, but an RLS-blocked UPDATE/DELETE doesn't error — it just matches zero rows. All four now `.select()` the affected row and treat zero rows as an explicit "not found or not permitted" error.
- `deleteTable`/`deleteFloorSection` returned `{error}` but no caller read it — failures were silently swallowed. Both components now surface the error (a dismissible banner in the workspace, inline text in the section list).
- The rename-section form closed back to read-view immediately on submit regardless of success/failure, so a validation/RLS error was never visible. Now watches the `pending` true→false transition and only closes on success.
- `MANAGER_ROLES` was an inline array literal in `page.tsx` duplicating the SQL role tier; menu management (next up) would have likely reimplemented it. Factored into `isManagerOrAbove()` in `lib/data/restaurant.ts`.
- Adding two tables without closing the form stacked them at the same client-computed position. Position is now computed server-side in `createTable` from the current table count, so sequential adds land at different spots.
- All fixes verified with `pnpm lint/typecheck/test/build` plus a live Playwright pass: confirmed rapid-add no longer overlaps (checked via DB), confirmed a whitespace-only rename is rejected server-side and the form stays open (checked the name was unchanged in the DB).

**Bug fix (user-reported, 2026-07-16):** Table delete ("x" button) silently did nothing. Root cause: the button sits inside the table marker's draggable `div`; pressing it bubbled a `pointerdown` up to the drag handler, which called `setPointerCapture` on the marker and redirected the browser's click-event targeting, so the button's `onClick` (the actual delete) often never fired. Fixed with `onPointerDown={(e) => e.stopPropagation()}` on the button. Live-verified: reproduced the confirm dialog firing, deleted a table through the real UI, confirmed via direct DB query it was gone.

**Done (menu management, 2026-07-16):**
- [x] `app/[restaurantSlug]/admin/menu/page.tsx` + `components/menu/{menu-workspace,category-manager,item-form,item-row,modifier-panel}.tsx` — manager-only CRUD for menu categories, items (name/description/price/active), modifier groups (single/multiple selection, required flag), and modifiers (name + price delta). Non-managers get a read-only view (no sidebar, no edit affordances, modifier groups rendered as plain text) — same `isManagerOrAbove()` gate as the floor plan editor. `lib/data/menu.ts`, `lib/actions/menu.ts`, `lib/validations/menu.ts` follow the same conventions as their `floor.ts` counterparts (RLS is the real enforcement; UPDATE/DELETE `.select()`s the affected row since an RLS-blocked mutation matches zero rows rather than erroring). Sidebar's "Menu" nav item flipped from `available: false` to `true`.
- [x] **Live-verified** against the real Supabase project: created a test restaurant via the actual signup → onboarding flow, added a category, item (with price/description), modifier group, and modifier through the real UI, edited the item's price, toggled it unavailable — confirmed each via direct DB query. Logged in as a second `server`-role test account and confirmed the read-only view (no sidebar, no edit controls, unavailable item shown struck through, modifiers as plain text) via a Playwright screenshot. `get_advisors` showed no new WARNs. Test data cleaned up afterward.

**Done (order entry, 2026-07-16):**
- [x] `app/[restaurantSlug]/orders/page.tsx` — table picker (`components/orders/table-picker.tsx`): grid of tables per floor section, reusing `floor-plan-styles.ts`; `server`-or-above staff can seat an available table (party size form → `seatTable` creates a `table_sessions` row, sets the table `occupied`, redirects into the session) or jump back into an occupied table's session via "View Order."
- [x] `app/[restaurantSlug]/orders/[sessionId]/page.tsx` — order entry screen (`components/orders/order-entry-workspace.tsx`): category tabs over `getOrderableMenu()` (active items only), click-to-add; items with modifier groups open `modifier-picker.tsx` (single/multiple selection, required-group validation blocks "Add to order," quantity stepper, optional notes). `components/orders/ticket.tsx` renders the client-side draft (editable quantity/remove) above the read-only history of already-fired orders (with per-item status), plus a subtotal/tax-estimate/total and "Fire to Kitchen."
- [x] `fireOrder` (`lib/actions/orders.ts`) re-reads `menu_items.price_cents`/`modifiers.price_delta_cents` from the DB rather than trusting the client, then inserts one `orders` row (`status: 'fired'`) plus `order_items`/`order_item_modifiers` snapshotting those prices — mirrors the snapshot rationale already documented in `0002_floor_menu_orders.sql`. Not wrapped in a DB transaction (sequential inserts, same accepted-risk tradeoff as elsewhere in this codebase); a mid-loop failure can leave a partial ticket, worth revisiting if it ever bites.
- [x] Displayed tax on the ticket is a hardcoded 8% placeholder for the running total shown while building an order — not wired to any real config; Phase B billing owns the actual tax/check calculation.
- [x] Sidebar's "Orders" nav item flipped from `available: false` to `true`.
- [x] **Live-verified** against the real Supabase project: seeded one floor section/table and one menu item with a required modifier group directly via SQL (menu/floor CRUD itself was already verified in prior phases), then drove the actual UI end-to-end as `test@rev.dev` — seated the table, opened the modifier picker, confirmed "Add to order" stays disabled until the required group has a selection, added a line with a modifier + notes, bumped quantity, fired to kitchen, and confirmed via direct DB query that the order/order_item/order_item_modifier rows persisted with the correct snapshotted price, quantity, and notes. Confirmed the floor/orders table picker correctly flips the table to "Occupied" with a working "View Order" link back into the session. `get_advisors` showed no new WARNs. This seed data was left in place in the persistent `test-kitchen` restaurant (see README "Test login") as a ready-made fixture for testing the next phase (kitchen display).

**Not started** (tracked as GitHub issues, milestone [Phase A — core service loop](https://github.com/dandan002/nosh/milestone/1)):
- [ ] Kitchen display — realtime tickets grouped by order/table, tap to advance status ([#2](https://github.com/dandan002/nosh/issues/2))
- [ ] Wire Supabase Realtime on `order_items`/`tables`/`table_sessions` ([#3](https://github.com/dandan002/nosh/issues/3))
- [ ] Delivery/completion tracking — server sees "ready" items live, marks delivered ([#4](https://github.com/dandan002/nosh/issues/4))
- [ ] Responsive/tablet polish pass ([#5](https://github.com/dandan002/nosh/issues/5))
- [ ] Demo-restaurant seed script ([#6](https://github.com/dandan002/nosh/issues/6))
- [ ] Playwright E2E smoke test (seat table → order → kitchen → deliver) ([#7](https://github.com/dandan002/nosh/issues/7))

### Phase B — billing fast-follow (not started, milestone [Phase B — billing fast-follow](https://github.com/dandan002/nosh/milestone/2))
- [ ] `checks`, `check_items`, `payments`, `stripe_webhook_events` migrations ([#8](https://github.com/dandan002/nosh/issues/8))
- [ ] Stripe Connect Express account onboarding per restaurant ([#9](https://github.com/dandan002/nosh/issues/9))
- [ ] Check generation from a session's `order_items` ([#10](https://github.com/dandan002/nosh/issues/10))
- [ ] Payment collection (destination charges, `application_fee_amount`) ([#11](https://github.com/dandan002/nosh/issues/11))
- [ ] Split billing (even / by-seat / by-item) ([#12](https://github.com/dandan002/nosh/issues/12))
- [ ] Tips, receipts, transaction history/reporting ([#13](https://github.com/dandan002/nosh/issues/13))

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
      [restaurantSlug]/         (layout.tsx = tenant shell; floor/ = visualization + admin editor; admin/menu/ = menu management; orders/ = table picker + order entry)
      page.tsx                  (redirects to last restaurant or onboarding)
    components/{ui,auth,nav,floor,menu,orders}/
    lib/
      supabase/{client,server}.ts
      actions/{auth,onboarding,floor,menu,orders}.ts
      validations/{auth,onboarding,floor,menu,orders}.ts
      data/{restaurant,floor,menu,orders}.ts
      floor-plan-styles.ts
      slug.ts (+ slug.test.ts)
    proxy.ts
    supabase/
      migrations/{0001_init,0002_floor_menu_orders}.sql
      README.md
    stitch-export/                (Stitch mockups — design reference, already landed)
    vitest.config.ts
```

## Next Steps (suggested order)

1. ~~Migrations for the remaining Phase A tables~~ — done, `0002_floor_menu_orders.sql`.
2. ~~Floor plan visualization (read-only)~~ — done, `app/[restaurantSlug]/floor`.
3. ~~Floor plan admin editor~~ — done, `components/floor/`.
4. ~~Menu management CRUD~~ — done, `app/[restaurantSlug]/admin/menu`, `components/menu/`.
5. ~~Order entry screen~~ — done, `app/[restaurantSlug]/orders`, `components/orders/`.
6. Kitchen display + Supabase Realtime wiring.
7. Delivery/completion tracking to close the Phase A loop.
8. Seed script + Playwright smoke test once the loop is end-to-end.

## Verification

Local: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (all passing as of 2026-07-16). Manual: exercise each new screen against the real Supabase project via `pnpm dev`, using the Supabase MCP (`get_advisors`, `execute_sql`) to check RLS/policy correctness after any schema change — this is how the three bugs above were caught, since `next build` and Vitest alone didn't surface them.
