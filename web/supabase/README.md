# Supabase setup

Schema changes only ever go through `supabase/migrations/*.sql` — never hand-edit
the schema via the Supabase dashboard. This keeps the migration history the
single source of truth and makes it possible to move to a local Docker stack
or per-branch preview databases later without rework.

## First-time setup

1. Create a project at supabase.com (or reuse an existing one for this repo).
2. Install the Supabase CLI (`brew install supabase/tap/supabase` or see
   https://supabase.com/docs/guides/cli).
3. `supabase login`, then from `web/`: `supabase link --project-ref <your-project-ref>`.
4. `supabase db push` to apply `supabase/migrations/0001_init.sql`.
5. `supabase gen types typescript --linked > lib/types/supabase.ts` to generate
   TS types matching the live schema.
6. Copy `.env.example` to `.env.local` and fill in the project URL / anon key /
   service role key from the Supabase dashboard (Project Settings → API).

## Tenancy model

Every tenant table has a non-null `restaurant_id`, RLS enabled, default deny.
Policies check membership via `is_restaurant_member(restaurant_id)`, a
`SECURITY DEFINER` helper that bypasses RLS on `staff_members` itself to avoid
recursive-policy issues. See `0001_init.sql` for the full pattern — every
future migration adding a tenant table should follow it.
