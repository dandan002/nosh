-- Phase A foundation: restaurants, staff membership, and the RLS tenancy
-- model every other table will build on. See supabase/README.md for the
-- overall migration strategy and how to apply this locally / remotely.

create extension if not exists "pgcrypto";

create type staff_role as enum ('owner', 'admin', 'manager', 'server', 'kitchen');

create table restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'UTC',
  currency text not null default 'USD',
  stripe_account_id text,
  stripe_charges_enabled boolean not null default false,
  stripe_payouts_enabled boolean not null default false,
  onboarding_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table staff_members (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  -- unique on user_id alone (not composite with restaurant_id): a staff
  -- member belongs to exactly one restaurant today. Dropping this
  -- constraint later is all that's needed to allow multi-org staff.
  user_id uuid not null unique references auth.users (id) on delete cascade,
  role staff_role not null,
  display_name text not null,
  pin_hash text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index staff_members_restaurant_id_idx on staff_members (restaurant_id);

-- SECURITY DEFINER + STABLE: bypasses RLS on staff_members when called from
-- another table's policy, which avoids the classic recursive-RLS bug that
-- happens when a policy on staff_members would otherwise need to query
-- staff_members itself.
create function is_restaurant_member(target_restaurant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from staff_members
    where staff_members.restaurant_id = target_restaurant_id
      and staff_members.user_id = (select auth.uid())
      and staff_members.active
  );
$$;

-- Role helper used by policies/actions that need to gate on more than mere
-- membership (e.g. only owner/admin may edit pricing or see Stripe fields).
create function staff_role_for(target_restaurant_id uuid)
returns staff_role
language sql
security definer
stable
set search_path = public
as $$
  select role
  from staff_members
  where staff_members.restaurant_id = target_restaurant_id
    and staff_members.user_id = (select auth.uid())
    and staff_members.active
  limit 1;
$$;

-- SECURITY DEFINER functions are granted EXECUTE to PUBLIC by default, and
-- Supabase's default privileges additionally grant EXECUTE directly to anon
-- at creation time (a direct grant, not just inherited via PUBLIC) — so
-- revoking from PUBLIC alone leaves anon still able to call these. Revoke
-- from both explicitly. These only expose a boolean/enum scoped to the
-- caller's own auth.uid(), but there's no reason for a signed-out request
-- to reach them at all.
revoke all on function is_restaurant_member(uuid) from public;
revoke execute on function is_restaurant_member(uuid) from anon;
grant execute on function is_restaurant_member(uuid) to authenticated;
revoke all on function staff_role_for(uuid) from public;
revoke execute on function staff_role_for(uuid) from anon;
grant execute on function staff_role_for(uuid) to authenticated;

alter table restaurants enable row level security;
alter table staff_members enable row level security;

create policy "members can read their restaurant"
  on restaurants for select
  to authenticated
  using (is_restaurant_member(id));

create policy "owners and admins can update their restaurant"
  on restaurants for update
  to authenticated
  using (staff_role_for(id) in ('owner', 'admin'))
  with check (staff_role_for(id) in ('owner', 'admin'));

-- Restaurant creation happens via a Server Action running with the
-- authenticated user's session; any authenticated user may create a
-- restaurant (they become its owner in the same transaction).
create policy "authenticated users can create a restaurant"
  on restaurants for insert
  to authenticated
  with check (true);

create policy "members can read staff in their restaurant"
  on staff_members for select
  to authenticated
  using (is_restaurant_member(restaurant_id));

-- Split by command rather than "for all": a SELECT policy here would be
-- pure overlap with "members can read staff in their restaurant" above
-- (owners/admins are already members), which the RLS performance linter
-- flags as a redundant extra policy evaluation on every read.
create policy "owners and admins can add staff to their restaurant"
  on staff_members for insert
  to authenticated
  with check (staff_role_for(restaurant_id) in ('owner', 'admin'));

create policy "owners and admins can update staff in their restaurant"
  on staff_members for update
  to authenticated
  using (staff_role_for(restaurant_id) in ('owner', 'admin'))
  with check (staff_role_for(restaurant_id) in ('owner', 'admin'));

create policy "owners and admins can remove staff from their restaurant"
  on staff_members for delete
  to authenticated
  using (staff_role_for(restaurant_id) in ('owner', 'admin'));

-- A user creating a brand-new restaurant needs to insert their own owner
-- row before any staff_members rows for that restaurant exist (so the
-- "owners and admins can add staff" policy above can't apply yet). This
-- necessarily overlaps with that policy on INSERT (self-bootstrap vs.
-- admin-invites-staff are two distinct valid paths) — an accepted, low-cost
-- exception to the "no redundant policies" rule since staff_members INSERT
-- is infrequent.
create policy "users can insert their own owner membership"
  on staff_members for insert
  to authenticated
  with check (user_id = (select auth.uid()) and role = 'owner');
