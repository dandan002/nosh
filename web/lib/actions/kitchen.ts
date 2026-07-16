"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { MoveItemStatusSchema } from "@/lib/validations/kitchen";

export type KitchenActionState = { error?: string } | undefined;

// RLS (is_kitchen_or_above, which already includes the server tier) is the
// real enforcement, same convention as the other lib/actions/*.ts files —
// kitchen and server staff get the same set of moves. The
// .eq("status", fromStatus) below is an optimistic-concurrency guard, not a
// security check: it stops a double-tap (or two staff acting on the same
// ticket) from moving the same item twice off of a status that already
// changed underneath them.
//
// extraRevalidatePath lets a caller outside /kitchen (namely the order
// entry ticket, which shows the same fired items read-only) revalidate its
// own route too — the kitchen board itself doesn't need this since it's
// wired to Supabase Realtime directly.
export async function moveOrderItemStatus(
  orderItemId: string,
  restaurantSlug: string,
  fromStatus: string,
  toStatus: string,
  extraRevalidatePath?: string,
): Promise<KitchenActionState> {
  const validated = MoveItemStatusSchema.safeParse({ fromStatus, toStatus });

  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Invalid status transition." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_items")
    .update({ status: validated.data.toStatus })
    .eq("id", orderItemId)
    .eq("status", validated.data.fromStatus)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!data || data.length === 0) {
    return { error: "This item already changed — refresh and try again." };
  }

  revalidatePath(`/${restaurantSlug}/kitchen`);
  if (extraRevalidatePath) {
    revalidatePath(extraRevalidatePath);
  }
}
