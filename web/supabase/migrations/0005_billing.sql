-- Phase B billing: checks, check_items, payments, stripe_webhook_events, plus
-- per-restaurant tax config and Stripe Connect account state. Same tenancy
-- conventions as 0001/0002: restaurant_id denormalized onto every tenant
-- table, RLS default-deny, role tiers via the existing is_*_or_above()
-- helpers. The same accepted risk documented at the top of
-- 0002_floor_menu_orders.sql applies (nothing verifies a child row's
-- restaurant_id matches its parent's — Server Actions set it consistently).
--
-- Money-moving state (payments.status, checks.status = 'paid',
-- restaurant_stripe_accounts) is deliberately NOT writable by the
-- authenticated role. Those rows are only written server-side with the
-- service-role key, after the Stripe API (or a signature-verified Stripe
-- webhook) confirms what happened — otherwise any server-tier staff member
-- could "mark as paid" straight through PostgREST, which is exactly what
-- the real-Stripe decision in PLAN.md is meant to rule out.

-- Restaurant config ---------------------------------------------------------

-- Basis points (825 = 8.25%). Owners/admins can already update their
-- restaurant row (0001), so no new policy is needed for this column.
alter table restaurants
  add column tax_rate_bps integer not null default 0
    check (tax_rate_bps >= 0 and tax_rate_bps <= 5000);

-- Kept out of `restaurants` on purpose: owners/admins can UPDATE their
-- restaurant row, and we don't want them able to repoint payouts at an
-- arbitrary Stripe account or flip charges_enabled by hand. Members can
-- read it (to know whether payments are available); only the service role
-- writes it (onboarding Server Action + account.updated webhook).
create table restaurant_stripe_accounts (
  restaurant_id uuid primary key references restaurants (id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Checks ----------------------------------------------------------------------

create type check_status as enum ('open', 'paid', 'void');
create type check_split_mode as enum ('none', 'even', 'by_seat', 'by_item');
create type payment_status as enum ('pending', 'succeeded', 'failed', 'canceled', 'refunded');

-- A check is generated from a table_session's non-cancelled order_items.
-- Totals and the tax rate are snapshotted at generation time (same
-- reasoning as order_items.unit_price_cents) so a later tax-rate change
-- doesn't rewrite a check that's mid-payment.
--
-- split_count is the number of portions the check is paid in (1 when
-- split_mode = 'none'). Portions are numbered 1..split_count; for
-- 'by_seat'/'by_item' the portion an item belongs to is
-- check_items.split_group. Portion amounts are always recomputed
-- server-side from the items (lib/billing/split.ts), never stored or
-- trusted from the client.
create table checks (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  table_session_id uuid not null references table_sessions (id) on delete cascade,
  created_by uuid references staff_members (id) on delete set null,
  status check_status not null default 'open',
  split_mode check_split_mode not null default 'none',
  split_count integer not null default 1 check (split_count between 1 and 30),
  tax_rate_bps integer not null default 0,
  subtotal_cents integer not null default 0,
  tax_cents integer not null default 0,
  total_cents integer not null default 0,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index checks_restaurant_id_idx on checks (restaurant_id);
create index checks_table_session_id_idx on checks (table_session_id);
create index checks_created_by_idx on checks (created_by);

-- At most one open check per session (regenerating voids the old one
-- first), same pattern as table_sessions_one_active_per_table_idx.
create unique index checks_one_open_per_session_idx
  on checks (table_session_id)
  where status = 'open';

-- One row per *unit* (an order_item with quantity 3 becomes three
-- check_items) so by-item / by-seat splits can put each unit on a
-- different portion.
create table check_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  check_id uuid not null references checks (id) on delete cascade,
  order_item_id uuid references order_items (id) on delete set null,
  description text not null,
  modifiers_summary text,
  amount_cents integer not null,
  split_group integer check (split_group is null or split_group between 1 and 30),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index check_items_restaurant_id_idx on check_items (restaurant_id);
create index check_items_check_id_idx on check_items (check_id);
create index check_items_order_item_id_idx on check_items (order_item_id);

-- Payments --------------------------------------------------------------------

-- amount_cents is the portion being paid (subtotal share + tax share);
-- tip_cents is on top; total_cents = amount_cents + tip_cents is what the
-- PaymentIntent charges. application_fee_cents is the platform's cut
-- (computed on amount_cents only — tips pass through to the restaurant).
create table payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  check_id uuid not null references checks (id) on delete cascade,
  split_group integer not null default 1,
  amount_cents integer not null check (amount_cents >= 0),
  tip_cents integer not null default 0 check (tip_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  application_fee_cents integer not null default 0,
  currency text not null default 'usd',
  status payment_status not null default 'pending',
  stripe_payment_intent_id text unique,
  card_brand text,
  card_last4 text,
  receipt_email text,
  created_by uuid references staff_members (id) on delete set null,
  created_at timestamptz not null default now(),
  succeeded_at timestamptz
);

create index payments_restaurant_id_idx on payments (restaurant_id);
create index payments_check_id_idx on payments (check_id);
create index payments_created_by_idx on payments (created_by);
create index payments_restaurant_succeeded_at_idx on payments (restaurant_id, succeeded_at);

-- A portion can only be successfully paid once.
create unique index payments_one_success_per_portion_idx
  on payments (check_id, split_group)
  where status = 'succeeded';

-- Idempotent webhook processing log. A row is inserted (keyed by Stripe's
-- event id) before processing and processed_at is set once processing
-- finishes, so a retried delivery of an already-processed event is a
-- no-op while a delivery that failed mid-processing is retried. Platform
-- level (not every event maps to a restaurant), so restaurant_id is
-- nullable and there are no authenticated policies at all — service role
-- only.
create table stripe_webhook_events (
  id text primary key,
  type text not null,
  restaurant_id uuid references restaurants (id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index stripe_webhook_events_restaurant_id_idx on stripe_webhook_events (restaurant_id);

-- RLS -------------------------------------------------------------------------

alter table restaurant_stripe_accounts enable row level security;
alter table checks enable row level security;
alter table check_items enable row level security;
alter table payments enable row level security;
alter table stripe_webhook_events enable row level security;

create policy "members can read their stripe account state"
  on restaurant_stripe_accounts for select
  to authenticated
  using (is_restaurant_member(restaurant_id));

create policy "members can read checks"
  on checks for select
  to authenticated
  using (is_restaurant_member(restaurant_id));

create policy "servers can create checks"
  on checks for insert
  to authenticated
  with check (is_server_or_above(restaurant_id) and status = 'open');

-- Servers can reconfigure a split or void a check, but can never set it to
-- 'paid' — that only happens server-side once Stripe confirms payment.
create policy "servers can update checks"
  on checks for update
  to authenticated
  using (is_server_or_above(restaurant_id))
  with check (is_server_or_above(restaurant_id) and status in ('open', 'void'));

create policy "members can read check items"
  on check_items for select
  to authenticated
  using (is_restaurant_member(restaurant_id));

create policy "servers can create check items"
  on check_items for insert
  to authenticated
  with check (is_server_or_above(restaurant_id));

create policy "servers can update check items"
  on check_items for update
  to authenticated
  using (is_server_or_above(restaurant_id))
  with check (is_server_or_above(restaurant_id));

create policy "servers can delete check items"
  on check_items for delete
  to authenticated
  using (is_server_or_above(restaurant_id));

create policy "members can read payments"
  on payments for select
  to authenticated
  using (is_restaurant_member(restaurant_id));

-- No insert/update/delete policies on payments, restaurant_stripe_accounts
-- or stripe_webhook_events: see the header comment.

-- Table service status ----------------------------------------------------------

-- tables' UPDATE policy (0002) is manager-only because it also covers the
-- floor-plan layout (label/position/shape). But the service loop needs
-- servers to flip a table's *status*: seating it (occupied) and bussing it
-- after the check closes (dirty -> available). Before this, seatTable's
-- status update silently matched zero rows for server-role staff. This
-- narrowly-scoped SECURITY DEFINER function lets server-or-above staff
-- change status only, for tables in a restaurant they belong to.
create function set_table_service_status(target_table_id uuid, new_status table_status)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  table_restaurant_id uuid;
begin
  select restaurant_id into table_restaurant_id from tables where id = target_table_id;
  if table_restaurant_id is null or not is_server_or_above(table_restaurant_id) then
    return false;
  end if;
  update tables set status = new_status where id = target_table_id;
  return true;
end;
$$;

revoke all on function set_table_service_status(uuid, table_status) from public;
revoke execute on function set_table_service_status(uuid, table_status) from anon;
grant execute on function set_table_service_status(uuid, table_status) to authenticated;

-- Realtime --------------------------------------------------------------------

-- The check screen refreshes when a webhook marks a payment succeeded or
-- the check paid, or another staff member changes the split / item
-- assignments (lib/hooks/use-realtime-refresh.ts), same as 0003/0004.
alter publication supabase_realtime add table checks;
alter publication supabase_realtime add table check_items;
alter publication supabase_realtime add table payments;
