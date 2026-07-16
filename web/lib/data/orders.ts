import "server-only";

import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { ModifierSelectionType } from "@/lib/data/menu";

// -- Menu, filtered to what a server can actually put on a ticket right now --

export type OrderableModifier = {
  id: string;
  name: string;
  priceDeltaCents: number;
};

export type OrderableModifierGroup = {
  id: string;
  name: string;
  selectionType: ModifierSelectionType;
  required: boolean;
  modifiers: OrderableModifier[];
};

export type OrderableItem = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  modifierGroups: OrderableModifierGroup[];
};

export type OrderableCategory = {
  id: string;
  name: string;
  items: OrderableItem[];
};

export async function getOrderableMenu(restaurantId: string): Promise<OrderableCategory[]> {
  const supabase = await createClient();

  const { data: categories, error } = await supabase
    .from("menu_categories")
    .select(
      `id, name, sort_order,
       menu_items!inner (
         id, name, description, price_cents, sort_order, active,
         modifier_groups (
           id, name, selection_type, required, sort_order,
           modifiers ( id, name, price_delta_cents, sort_order, active )
         )
       )`,
    )
    .eq("restaurant_id", restaurantId)
    .eq("menu_items.active", true)
    .order("sort_order", { ascending: true })
    .order("sort_order", { ascending: true, referencedTable: "menu_items" })
    .order("sort_order", {
      ascending: true,
      referencedTable: "menu_items.modifier_groups",
    })
    .order("sort_order", {
      ascending: true,
      referencedTable: "menu_items.modifier_groups.modifiers",
    });

  if (error) {
    throw new Error(`Failed to load menu: ${error.message}`);
  }

  return categories
    .map((category) => ({
      id: category.id,
      name: category.name,
      items: category.menu_items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        priceCents: item.price_cents,
        modifierGroups: item.modifier_groups.map((group) => ({
          id: group.id,
          name: group.name,
          selectionType: group.selection_type as ModifierSelectionType,
          required: group.required,
          modifiers: group.modifiers
            .filter((modifier: { active: boolean }) => modifier.active)
            .map((modifier: { id: string; name: string; price_delta_cents: number }) => ({
              id: modifier.id,
              name: modifier.name,
              priceDeltaCents: modifier.price_delta_cents,
            })),
        })),
      })),
    }))
    .filter((category) => category.items.length > 0);
}

// -- Table / session picker ---------------------------------------------

export type OrderableTable = {
  id: string;
  label: string;
  seats: number;
  status: "available" | "occupied" | "reserved" | "dirty";
  activeSessionId: string | null;
};

export type OrderableFloorSection = {
  id: string;
  name: string;
  tables: OrderableTable[];
};

export async function getTablesForOrderEntry(
  restaurantId: string,
): Promise<OrderableFloorSection[]> {
  const supabase = await createClient();

  const { data: sections, error } = await supabase
    .from("floor_sections")
    .select(
      `id, name, sort_order,
       tables ( id, label, seats, status, table_sessions ( id, status ) )`,
    )
    .eq("restaurant_id", restaurantId)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Failed to load tables: ${error.message}`);
  }

  return sections.map((section) => ({
    id: section.id,
    name: section.name,
    tables: section.tables
      .map((table) => {
        const activeSession = table.table_sessions.find(
          (session: { id: string; status: string }) => session.status === "active",
        );
        return {
          id: table.id,
          label: table.label,
          seats: table.seats,
          status: table.status,
          activeSessionId: activeSession?.id ?? null,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label)),
  }));
}

// -- Session detail (order entry screen) ---------------------------------

export type FiredOrderItemModifier = {
  id: string;
  name: string;
  priceDeltaCents: number;
};

export type FiredOrderItem = {
  id: string;
  menuItemName: string;
  quantity: number;
  unitPriceCents: number;
  status: string;
  notes: string | null;
  modifiers: FiredOrderItemModifier[];
};

export type FiredOrder = {
  id: string;
  status: string;
  createdAt: string;
  items: FiredOrderItem[];
};

export type SessionDetail = {
  id: string;
  partySize: number;
  status: string;
  table: {
    id: string;
    label: string;
  };
  orders: FiredOrder[];
};

export async function getSessionDetail(sessionId: string): Promise<SessionDetail> {
  const supabase = await createClient();

  const { data: session, error } = await supabase
    .from("table_sessions")
    .select(
      `id, party_size, status,
       tables ( id, label ),
       orders (
         id, status, created_at,
         order_items (
           id, quantity, unit_price_cents, status, notes,
           menu_items ( name ),
           order_item_modifiers ( id, price_delta_cents, modifiers ( name ) )
         )
       )`,
    )
    .eq("id", sessionId)
    .order("created_at", { referencedTable: "orders", ascending: false })
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load session: ${error.message}`);
  }
  if (!session) {
    notFound();
  }

  const table = session.tables as unknown as { id: string; label: string };

  return {
    id: session.id,
    partySize: session.party_size,
    status: session.status,
    table: { id: table.id, label: table.label },
    orders: session.orders.map((order) => ({
      id: order.id,
      status: order.status,
      createdAt: order.created_at,
      items: order.order_items.map((item) => ({
        id: item.id,
        menuItemName: (item.menu_items as unknown as { name: string }).name,
        quantity: item.quantity,
        unitPriceCents: item.unit_price_cents,
        status: item.status,
        notes: item.notes,
        modifiers: item.order_item_modifiers.map(
          (modifier: { id: string; price_delta_cents: number; modifiers: unknown }) => ({
            id: modifier.id,
            name: (modifier.modifiers as { name: string }).name,
            priceDeltaCents: modifier.price_delta_cents,
          }),
        ),
      })),
    })),
  };
}
