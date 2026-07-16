import "server-only";

import { createClient } from "@/lib/supabase/server";

export type KitchenItemStatus = "fired" | "preparing" | "ready";

export type KitchenTicketItem = {
  id: string;
  orderId: string;
  tableLabel: string;
  serverName: string | null;
  firedAt: string;
  menuItemName: string;
  quantity: number;
  status: KitchenItemStatus;
  notes: string | null;
  modifiers: string[];
};

const ACTIVE_STATUSES: KitchenItemStatus[] = ["fired", "preparing", "ready"];

export async function getKitchenTickets(restaurantId: string): Promise<KitchenTicketItem[]> {
  const supabase = await createClient();

  const { data: items, error } = await supabase
    .from("order_items")
    .select(
      `id, order_id, quantity, status, notes, created_at,
       menu_items ( name ),
       order_item_modifiers ( modifiers ( name ) ),
       orders!inner (
         id, created_at,
         table_sessions ( tables ( label ) ),
         staff_members ( display_name )
       )`,
    )
    .eq("restaurant_id", restaurantId)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load kitchen tickets: ${error.message}`);
  }

  return items.map((item) => {
    const order = item.orders as unknown as {
      id: string;
      created_at: string;
      table_sessions: { tables: { label: string } } | null;
      staff_members: { display_name: string } | null;
    };

    return {
      id: item.id,
      orderId: order.id,
      tableLabel: order.table_sessions?.tables.label ?? "?",
      serverName: order.staff_members?.display_name ?? null,
      firedAt: order.created_at,
      menuItemName: (item.menu_items as unknown as { name: string }).name,
      quantity: item.quantity,
      status: item.status as KitchenItemStatus,
      notes: item.notes,
      modifiers: item.order_item_modifiers.map(
        (m: { modifiers: unknown }) => (m.modifiers as { name: string }).name,
      ),
    };
  });
}
