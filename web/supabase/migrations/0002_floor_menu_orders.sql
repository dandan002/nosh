-- Phase A core service loop: floor plan, menu, and order tables. Builds on
-- the tenancy model from 0001_init.sql — every table carries restaurant_id
-- directly (rather than requiring RLS policies to walk joins) so each
-- policy stays a single is_restaurant_member()/staff_role_for() check.
--
-- Accepted risk: restaurant_id is denormalized onto every table below rather
-- than derived through the FK chain (e.g. order_item_modifiers -> order_items
-- -> orders -> table_sessions -> tables -> restaurants), and nothing here
-- (no composite FK, no trigger) verifies a child row's restaurant_id matches
-- its parent's. This mirrors the same tradeoff already made for
-- staff_members in 0001. Application code (Server Actions) is responsible
-- for always setting restaurant_id consistently with the parent chain;
-- revisit with composite FKs or a validating trigger if that ever proves
-- insufficient.

create type table_shape as enum ('round', 'square', 'rectangle');
create type table_status as enum ('available', 'occupied', 'reserved', 'dirty');
create type table_session_status as enum ('active', 'closed');
create type modifier_selection_type as enum ('single', 'multiple');
create type order_status as enum ('open', 'fired', 'completed', 'cancelled');
create type order_item_status as enum ('pending', 'fired', 'preparing', 'ready', 'delivered', 'cancelled');

-- Floor plan --------------------------------------------------------------

create table floor_sections (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index floor_sections_restaurant_id_idx on floor_sections (restaurant_id);

create table tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  floor_section_id uuid not null references floor_sections (id) on delete cascade,
  label text not null,
  seats integer not null default 2,
  shape table_shape not null default 'round',
  pos_x real not null default 0,
  pos_y real not null default 0,
  status table_status not null default 'available',
  created_at timestamptz not null default now()
);

create index tables_restaurant_id_idx on tables (restaurant_id);
create index tables_floor_section_id_idx on tables (floor_section_id);

create table table_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  table_id uuid not null references tables (id) on delete cascade,
  server_id uuid references staff_members (id) on delete set null,
  party_size integer not null default 1,
  status table_session_status not null default 'active',
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create index table_sessions_restaurant_id_idx on table_sessions (restaurant_id);
create index table_sessions_server_id_idx on table_sessions (server_id);

-- Partial unique index rather than a plain one: enforces at most one active
-- session per table (two servers seating the same table concurrently can't
-- both succeed) and doubles as the lookup index for "find the active
-- session for this table."
create unique index table_sessions_one_active_per_table_idx
  on table_sessions (table_id)
  where status = 'active';

-- Menu ----------------------------------------------------------------------

create table menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index menu_categories_restaurant_id_idx on menu_categories (restaurant_id);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  category_id uuid not null references menu_categories (id) on delete cascade,
  name text not null,
  description text,
  price_cents integer not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index menu_items_restaurant_id_idx on menu_items (restaurant_id);
create index menu_items_category_id_idx on menu_items (category_id);

create table modifier_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  menu_item_id uuid not null references menu_items (id) on delete cascade,
  name text not null,
  selection_type modifier_selection_type not null default 'single',
  required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index modifier_groups_restaurant_id_idx on modifier_groups (restaurant_id);
create index modifier_groups_menu_item_id_idx on modifier_groups (menu_item_id);

-- active mirrors menu_items.active: a modifier referenced by any historical
-- order_item_modifiers row can't be hard-deleted (see the `on delete
-- restrict` below), so this is the only way to retire it from the menu.
create table modifiers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  modifier_group_id uuid not null references modifier_groups (id) on delete cascade,
  name text not null,
  price_delta_cents integer not null default 0,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index modifiers_restaurant_id_idx on modifiers (restaurant_id);
create index modifiers_modifier_group_id_idx on modifiers (modifier_group_id);

-- Orders ----------------------------------------------------------------------

create table orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  table_session_id uuid not null references table_sessions (id) on delete cascade,
  created_by uuid references staff_members (id) on delete set null,
  status order_status not null default 'open',
  created_at timestamptz not null default now()
);

create index orders_restaurant_id_idx on orders (restaurant_id);
create index orders_table_session_id_idx on orders (table_session_id);
create index orders_created_by_idx on orders (created_by);

-- unit_price_cents snapshots menu_items.price_cents at order time so a
-- later menu price change doesn't rewrite the price on historical tickets.
create table order_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  order_id uuid not null references orders (id) on delete cascade,
  menu_item_id uuid not null references menu_items (id) on delete restrict,
  quantity integer not null default 1,
  unit_price_cents integer not null,
  status order_item_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now()
);

create index order_items_restaurant_id_idx on order_items (restaurant_id);
create index order_items_order_id_idx on order_items (order_id);
create index order_items_menu_item_id_idx on order_items (menu_item_id);

-- price_delta_cents likewise snapshots modifiers.price_delta_cents at order
-- time, for the same reason as order_items.unit_price_cents above.
create table order_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  order_item_id uuid not null references order_items (id) on delete cascade,
  modifier_id uuid not null references modifiers (id) on delete restrict,
  price_delta_cents integer not null,
  created_at timestamptz not null default now()
);

create index order_item_modifiers_restaurant_id_idx on order_item_modifiers (restaurant_id);
create index order_item_modifiers_order_item_id_idx on order_item_modifiers (order_item_id);
create index order_item_modifiers_modifier_id_idx on order_item_modifiers (modifier_id);

-- RLS -------------------------------------------------------------------

-- Role-tier helpers built on staff_role_for(), same convention as
-- is_restaurant_member()/staff_role_for() in 0001. Written once here instead
-- of repeating the same role list literal in every policy below (~40
-- occurrences across the two tiers) — a role-tier change now only needs to
-- happen in one place instead of being kept in sync by hand everywhere.
create function is_manager_or_above(target_restaurant_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select staff_role_for(target_restaurant_id) in ('owner', 'admin', 'manager');
$$;

create function is_server_or_above(target_restaurant_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select staff_role_for(target_restaurant_id) in ('owner', 'admin', 'manager', 'server');
$$;

-- Only order_items.update needs this wider tier (kitchen staff advance
-- ticket status without being able to create or delete tickets).
create function is_kitchen_or_above(target_restaurant_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select staff_role_for(target_restaurant_id) in ('owner', 'admin', 'manager', 'server', 'kitchen');
$$;

revoke all on function is_manager_or_above(uuid) from public;
revoke execute on function is_manager_or_above(uuid) from anon;
grant execute on function is_manager_or_above(uuid) to authenticated;
revoke all on function is_server_or_above(uuid) from public;
revoke execute on function is_server_or_above(uuid) from anon;
grant execute on function is_server_or_above(uuid) to authenticated;
revoke all on function is_kitchen_or_above(uuid) from public;
revoke execute on function is_kitchen_or_above(uuid) from anon;
grant execute on function is_kitchen_or_above(uuid) to authenticated;

alter table floor_sections enable row level security;
alter table tables enable row level security;
alter table table_sessions enable row level security;
alter table menu_categories enable row level security;
alter table menu_items enable row level security;
alter table modifier_groups enable row level security;
alter table modifiers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_item_modifiers enable row level security;

-- Floor plan and menu are structural/back-of-house config: any member can
-- read, but only owner/admin/manager can write.

create policy "members can read floor sections"
  on floor_sections for select
  to authenticated
  using (is_restaurant_member(restaurant_id));

-- Split by command rather than "for all": a "for all" policy here would
-- duplicate the SELECT policy above on every read, which the RLS
-- performance linter flags (same fix applied to staff_members in 0001).
create policy "managers can insert floor sections"
  on floor_sections for insert
  to authenticated
  with check (is_manager_or_above(restaurant_id));

create policy "managers can update floor sections"
  on floor_sections for update
  to authenticated
  using (is_manager_or_above(restaurant_id))
  with check (is_manager_or_above(restaurant_id));

create policy "managers can delete floor sections"
  on floor_sections for delete
  to authenticated
  using (is_manager_or_above(restaurant_id));

create policy "members can read tables"
  on tables for select
  to authenticated
  using (is_restaurant_member(restaurant_id));

create policy "managers can insert tables"
  on tables for insert
  to authenticated
  with check (is_manager_or_above(restaurant_id));

create policy "managers can update tables"
  on tables for update
  to authenticated
  using (is_manager_or_above(restaurant_id))
  with check (is_manager_or_above(restaurant_id));

create policy "managers can delete tables"
  on tables for delete
  to authenticated
  using (is_manager_or_above(restaurant_id));

create policy "members can read menu categories"
  on menu_categories for select
  to authenticated
  using (is_restaurant_member(restaurant_id));

create policy "managers can insert menu categories"
  on menu_categories for insert
  to authenticated
  with check (is_manager_or_above(restaurant_id));

create policy "managers can update menu categories"
  on menu_categories for update
  to authenticated
  using (is_manager_or_above(restaurant_id))
  with check (is_manager_or_above(restaurant_id));

create policy "managers can delete menu categories"
  on menu_categories for delete
  to authenticated
  using (is_manager_or_above(restaurant_id));

create policy "members can read menu items"
  on menu_items for select
  to authenticated
  using (is_restaurant_member(restaurant_id));

create policy "managers can insert menu items"
  on menu_items for insert
  to authenticated
  with check (is_manager_or_above(restaurant_id));

create policy "managers can update menu items"
  on menu_items for update
  to authenticated
  using (is_manager_or_above(restaurant_id))
  with check (is_manager_or_above(restaurant_id));

create policy "managers can delete menu items"
  on menu_items for delete
  to authenticated
  using (is_manager_or_above(restaurant_id));

create policy "members can read modifier groups"
  on modifier_groups for select
  to authenticated
  using (is_restaurant_member(restaurant_id));

create policy "managers can insert modifier groups"
  on modifier_groups for insert
  to authenticated
  with check (is_manager_or_above(restaurant_id));

create policy "managers can update modifier groups"
  on modifier_groups for update
  to authenticated
  using (is_manager_or_above(restaurant_id))
  with check (is_manager_or_above(restaurant_id));

create policy "managers can delete modifier groups"
  on modifier_groups for delete
  to authenticated
  using (is_manager_or_above(restaurant_id));

create policy "members can read modifiers"
  on modifiers for select
  to authenticated
  using (is_restaurant_member(restaurant_id));

create policy "managers can insert modifiers"
  on modifiers for insert
  to authenticated
  with check (is_manager_or_above(restaurant_id));

create policy "managers can update modifiers"
  on modifiers for update
  to authenticated
  using (is_manager_or_above(restaurant_id))
  with check (is_manager_or_above(restaurant_id));

create policy "managers can delete modifiers"
  on modifiers for delete
  to authenticated
  using (is_manager_or_above(restaurant_id));

-- Table sessions and orders are the operational service loop: any active
-- staff member (including servers) can read and write them day-to-day.

create policy "members can read table sessions"
  on table_sessions for select
  to authenticated
  using (is_restaurant_member(restaurant_id));

create policy "servers can insert table sessions"
  on table_sessions for insert
  to authenticated
  with check (is_server_or_above(restaurant_id));

create policy "servers can update table sessions"
  on table_sessions for update
  to authenticated
  using (is_server_or_above(restaurant_id))
  with check (is_server_or_above(restaurant_id));

create policy "servers can delete table sessions"
  on table_sessions for delete
  to authenticated
  using (is_server_or_above(restaurant_id));

create policy "members can read orders"
  on orders for select
  to authenticated
  using (is_restaurant_member(restaurant_id));

create policy "servers can insert orders"
  on orders for insert
  to authenticated
  with check (is_server_or_above(restaurant_id));

create policy "servers can update orders"
  on orders for update
  to authenticated
  using (is_server_or_above(restaurant_id))
  with check (is_server_or_above(restaurant_id));

create policy "servers can delete orders"
  on orders for delete
  to authenticated
  using (is_server_or_above(restaurant_id));

create policy "members can read order items"
  on order_items for select
  to authenticated
  using (is_restaurant_member(restaurant_id));

create policy "servers can create order items"
  on order_items for insert
  to authenticated
  with check (is_server_or_above(restaurant_id));

-- Split from insert: kitchen staff need to advance order_items.status
-- (pending -> fired -> preparing -> ready -> delivered) without otherwise
-- being able to create tickets themselves.
create policy "servers and kitchen can update order items"
  on order_items for update
  to authenticated
  using (is_kitchen_or_above(restaurant_id))
  with check (is_kitchen_or_above(restaurant_id));

create policy "servers can delete order items"
  on order_items for delete
  to authenticated
  using (is_server_or_above(restaurant_id));

create policy "members can read order item modifiers"
  on order_item_modifiers for select
  to authenticated
  using (is_restaurant_member(restaurant_id));

create policy "servers can insert order item modifiers"
  on order_item_modifiers for insert
  to authenticated
  with check (is_server_or_above(restaurant_id));

create policy "servers can update order item modifiers"
  on order_item_modifiers for update
  to authenticated
  using (is_server_or_above(restaurant_id))
  with check (is_server_or_above(restaurant_id));

create policy "servers can delete order item modifiers"
  on order_item_modifiers for delete
  to authenticated
  using (is_server_or_above(restaurant_id));
