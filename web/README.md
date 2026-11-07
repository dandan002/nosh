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

### Billing / Stripe (Phase B)

Billing needs the extra variables in `.env.example`:
`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, and optionally
`PLATFORM_FEE_BPS` (default 100 = 1%). Apply
`supabase/migrations/0005_billing.sql` first. The order-entry, billing and
settings pages read its new columns and tables.

1. In the Stripe dashboard (test mode), enable **Connect** on the platform
   account.
2. Webhooks: point an endpoint at `/api/stripe/webhook` for
   `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `payment_intent.canceled`, `payment_intent.processing` and
   `charge.refunded`. Add a second **Connect** endpoint, also pointing at
   `/api/stripe/webhook`, for `account.updated`. Put both signing secrets
   in `STRIPE_WEBHOOK_SECRET`, comma-separated. Locally:
   `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
3. As an owner/admin, open **Settings → Payments → Set up payments with
   Stripe** and finish Stripe's hosted Express onboarding. In test mode you
   can use Stripe's test data. Card payments unlock once
   `charges_enabled` is true.
4. Set the sales tax rate under **Settings → Tax**.

Service flow: seat a table and fire orders, then use **Check** in the order
header or the **Billing** page. Optionally split the check (evenly, by seat
or by item). Each portion is paid with a tip through Stripe's Payment
Element, using test card `4242 4242 4242 4242`. Once every portion is paid,
the check closes, the table session ends, and the table is marked for
bussing. **Mark clean** on the Orders page frees the table for the next
party. Receipts are printable from the check. Stripe emails a receipt when
a receipt email is entered. **Analytics** shows the transaction history
with CSV export.

### Test login

A persistent `owner`-role account on the "rev" Supabase project:

- Email: `test@rev.dev`
- Password: `RevTest123!`
- Restaurant: `test-kitchen` (lands on `/test-kitchen/floor` after login)

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
- `lib/actions/` — Server Actions (auth, onboarding, floor, menu, orders,
  kitchen, billing).
- `lib/billing/` — pure split/tax/tip math (`split.ts`, unit-tested) and
  server-only payment settlement (`finalize.ts`).
- `lib/stripe/server.ts`, `lib/supabase/admin.ts` — server-only Stripe and
  service-role Supabase clients.
- `app/api/stripe/webhook/` — signature-verified, idempotent Stripe webhook.
- `lib/validations/` — Zod schemas shared by forms and Server Actions.
- `supabase/migrations/` — schema, source of truth (never hand-edit via the
  Supabase dashboard).
- `proxy.ts` — Next.js 16's replacement for `middleware.ts`; refreshes the
  Supabase session and gates unauthenticated access.
