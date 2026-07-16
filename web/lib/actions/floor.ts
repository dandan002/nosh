"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { FloorSectionSchema, TableSchema } from "@/lib/validations/floor";

export type FloorActionState =
  | {
      error?: string;
      fieldErrors?: Record<string, string[]>;
    }
  | undefined;

// RLS (is_manager_or_above, see supabase/migrations/0002) is the real
// enforcement for every mutation below — the UI only hides these controls
// from non-managers for a cleaner experience. A tampered restaurantId/
// sectionId in a form field fails the RLS check rather than succeeding
// against the wrong tenant.
//
// UPDATE/DELETE calls also .select() the affected row and check for zero
// results: an RLS-blocked UPDATE/DELETE doesn't raise a Postgres error, it
// just matches zero rows, so `error` alone can't distinguish "blocked" from
// "succeeded."

const NOT_FOUND_ERROR = "Not found, or you don't have permission for this change.";

export async function createFloorSection(
  restaurantId: string,
  restaurantSlug: string,
  _prevState: FloorActionState,
  formData: FormData,
): Promise<FloorActionState> {
  const validated = FloorSectionSchema.safeParse({ name: formData.get("name") });

  if (!validated.success) {
    return { fieldErrors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  const { count } = await supabase
    .from("floor_sections")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId);

  const { error } = await supabase.from("floor_sections").insert({
    restaurant_id: restaurantId,
    name: validated.data.name,
    sort_order: count ?? 0,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/${restaurantSlug}/floor`);
}

export async function renameFloorSection(
  sectionId: string,
  restaurantSlug: string,
  _prevState: FloorActionState,
  formData: FormData,
): Promise<FloorActionState> {
  const validated = FloorSectionSchema.safeParse({ name: formData.get("name") });

  if (!validated.success) {
    return { fieldErrors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("floor_sections")
    .update({ name: validated.data.name })
    .eq("id", sectionId)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!data || data.length === 0) {
    return { error: NOT_FOUND_ERROR };
  }

  revalidatePath(`/${restaurantSlug}/floor`);
}

export async function deleteFloorSection(
  sectionId: string,
  restaurantSlug: string,
): Promise<FloorActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("floor_sections")
    .delete()
    .eq("id", sectionId)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!data || data.length === 0) {
    return { error: NOT_FOUND_ERROR };
  }

  revalidatePath(`/${restaurantSlug}/floor`);
}

export async function createTable(
  restaurantId: string,
  floorSectionId: string,
  restaurantSlug: string,
  _prevState: FloorActionState,
  formData: FormData,
): Promise<FloorActionState> {
  const validated = TableSchema.safeParse({
    label: formData.get("label"),
    seats: formData.get("seats"),
    shape: formData.get("shape"),
  });

  if (!validated.success) {
    return { fieldErrors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  // Computed server-side (rather than passed from the client) so adding
  // several tables in a row without closing the form still spreads them out
  // instead of stacking every new table at the same client-computed spot.
  const { count } = await supabase
    .from("tables")
    .select("id", { count: "exact", head: true })
    .eq("floor_section_id", floorSectionId);
  const tableCount = count ?? 0;

  const { error } = await supabase.from("tables").insert({
    restaurant_id: restaurantId,
    floor_section_id: floorSectionId,
    label: validated.data.label,
    seats: validated.data.seats,
    shape: validated.data.shape,
    pos_x: 40 + (tableCount % 6) * 120,
    pos_y: 40 + Math.floor(tableCount / 6) * 120,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/${restaurantSlug}/floor`);
}

export async function updateTablePosition(
  tableId: string,
  restaurantSlug: string,
  posX: number,
  posY: number,
): Promise<FloorActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tables")
    .update({ pos_x: posX, pos_y: posY })
    .eq("id", tableId)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!data || data.length === 0) {
    return { error: NOT_FOUND_ERROR };
  }

  revalidatePath(`/${restaurantSlug}/floor`);
}

export async function deleteTable(
  tableId: string,
  restaurantSlug: string,
): Promise<FloorActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tables")
    .delete()
    .eq("id", tableId)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!data || data.length === 0) {
    return { error: NOT_FOUND_ERROR };
  }

  revalidatePath(`/${restaurantSlug}/floor`);
}
