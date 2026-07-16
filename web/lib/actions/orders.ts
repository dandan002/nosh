"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { FireOrderSchema, SeatTableSchema, type DraftOrderItemInput } from "@/lib/validations/orders";

export type OrdersActionState =
  | {
      error?: string;
      fieldErrors?: Record<string, string[]>;
    }
  | undefined;

// Same convention as lib/actions/floor.ts and lib/actions/menu.ts: RLS
// (is_server_or_above / is_kitchen_or_above) is the real enforcement.

export async function seatTable(
  restaurantId: string,
  tableId: string,
  restaurantSlug: string,
  staffMemberId: string,
  _prevState: OrdersActionState,
  formData: FormData,
): Promise<OrdersActionState> {
  const validated = SeatTableSchema.safeParse({ partySize: formData.get("partySize") });

  if (!validated.success) {
    return { fieldErrors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  const { data: session, error } = await supabase
    .from("table_sessions")
    .insert({
      restaurant_id: restaurantId,
      table_id: tableId,
      server_id: staffMemberId,
      party_size: validated.data.partySize,
    })
    .select("id")
    .single();

  if (error) {
    // The partial unique index (one active session per table) turns "someone
    // already seated this table" into a conflict here rather than silently
    // overwriting it.
    return { error: "This table already has an active session — refresh and try again." };
  }

  await supabase.from("tables").update({ status: "occupied" }).eq("id", tableId);

  revalidatePath(`/${restaurantSlug}/orders`);
  revalidatePath(`/${restaurantSlug}/floor`);
  redirect(`/${restaurantSlug}/orders/${session.id}`);
}

// Called directly from the client (not bound to a <form>) since the draft
// ticket is a nested client-side structure rather than flat form fields.
export async function fireOrder(
  restaurantId: string,
  sessionId: string,
  restaurantSlug: string,
  staffMemberId: string,
  items: DraftOrderItemInput[],
): Promise<OrdersActionState> {
  const validated = FireOrderSchema.safeParse({ items });

  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Invalid order." };
  }

  const supabase = await createClient();

  const menuItemIds = [...new Set(validated.data.items.map((item) => item.menuItemId))];
  const modifierIds = [
    ...new Set(validated.data.items.flatMap((item) => item.modifierIds)),
  ];

  // Prices are re-read from the DB rather than trusted from the client, and
  // snapshotted onto order_items/order_item_modifiers here — the same
  // reasoning documented in supabase/migrations/0002_floor_menu_orders.sql
  // for unit_price_cents/price_delta_cents.
  const [{ data: menuItems, error: menuItemsError }, { data: modifiers, error: modifiersError }] =
    await Promise.all([
      supabase
        .from("menu_items")
        .select("id, price_cents")
        .eq("restaurant_id", restaurantId)
        .in("id", menuItemIds),
      modifierIds.length > 0
        ? supabase
            .from("modifiers")
            .select("id, price_delta_cents")
            .eq("restaurant_id", restaurantId)
            .in("id", modifierIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (menuItemsError || modifiersError) {
    return { error: (menuItemsError ?? modifiersError)!.message };
  }

  const priceByMenuItem = new Map(menuItems.map((item) => [item.id, item.price_cents]));
  const priceDeltaByModifier = new Map(modifiers.map((m) => [m.id, m.price_delta_cents]));

  if (menuItemIds.some((id) => !priceByMenuItem.has(id))) {
    return { error: "One of these items is no longer on the menu — refresh and try again." };
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      restaurant_id: restaurantId,
      table_session_id: sessionId,
      created_by: staffMemberId,
      status: "fired",
    })
    .select("id")
    .single();

  if (orderError) {
    return { error: orderError.message };
  }

  for (const item of validated.data.items) {
    const { data: orderItem, error: orderItemError } = await supabase
      .from("order_items")
      .insert({
        restaurant_id: restaurantId,
        order_id: order.id,
        menu_item_id: item.menuItemId,
        quantity: item.quantity,
        unit_price_cents: priceByMenuItem.get(item.menuItemId)!,
        status: "fired",
        notes: item.notes || null,
      })
      .select("id")
      .single();

    if (orderItemError) {
      return { error: orderItemError.message };
    }

    if (item.modifierIds.length > 0) {
      const { error: modifiersInsertError } = await supabase.from("order_item_modifiers").insert(
        item.modifierIds.map((modifierId) => ({
          restaurant_id: restaurantId,
          order_item_id: orderItem.id,
          modifier_id: modifierId,
          price_delta_cents: priceDeltaByModifier.get(modifierId) ?? 0,
        })),
      );

      if (modifiersInsertError) {
        return { error: modifiersInsertError.message };
      }
    }
  }

  revalidatePath(`/${restaurantSlug}/orders/${sessionId}`);
}
