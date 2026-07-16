"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { AdvanceItemStatusSchema } from "@/lib/validations/kitchen";

export type KitchenActionState = { error?: string } | undefined;

// RLS (is_kitchen_or_above) is the real enforcement, same convention as the
// other lib/actions/*.ts files. The .eq("status", fromStatus) below is an
// optimistic-concurrency guard, not a security check: it stops a
// double-tap (or two kitchen staff tapping the same ticket) from advancing
// the same item twice in a row.
export async function advanceItemStatus(
  orderItemId: string,
  restaurantSlug: string,
  fromStatus: string,
  toStatus: string,
): Promise<KitchenActionState> {
  const validated = AdvanceItemStatusSchema.safeParse({ fromStatus, toStatus });

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
}
