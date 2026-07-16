"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  MenuCategorySchema,
  MenuItemSchema,
  ModifierGroupSchema,
  ModifierSchema,
} from "@/lib/validations/menu";

export type MenuActionState =
  | {
      error?: string;
      fieldErrors?: Record<string, string[]>;
    }
  | undefined;

// Same convention as lib/actions/floor.ts: RLS (is_manager_or_above) is the
// real enforcement for every mutation below, and UPDATE/DELETE calls
// .select() the affected row because an RLS-blocked UPDATE/DELETE doesn't
// raise a Postgres error, it just matches zero rows.

const NOT_FOUND_ERROR = "Not found, or you don't have permission for this change.";

function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

// -- Categories --------------------------------------------------------------

export async function createMenuCategory(
  restaurantId: string,
  restaurantSlug: string,
  _prevState: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const validated = MenuCategorySchema.safeParse({ name: formData.get("name") });

  if (!validated.success) {
    return { fieldErrors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  const { count } = await supabase
    .from("menu_categories")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId);

  const { error } = await supabase.from("menu_categories").insert({
    restaurant_id: restaurantId,
    name: validated.data.name,
    sort_order: count ?? 0,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/${restaurantSlug}/admin/menu`);
}

export async function renameMenuCategory(
  categoryId: string,
  restaurantSlug: string,
  _prevState: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const validated = MenuCategorySchema.safeParse({ name: formData.get("name") });

  if (!validated.success) {
    return { fieldErrors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_categories")
    .update({ name: validated.data.name })
    .eq("id", categoryId)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!data || data.length === 0) {
    return { error: NOT_FOUND_ERROR };
  }

  revalidatePath(`/${restaurantSlug}/admin/menu`);
}

export async function deleteMenuCategory(
  categoryId: string,
  restaurantSlug: string,
): Promise<MenuActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_categories")
    .delete()
    .eq("id", categoryId)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!data || data.length === 0) {
    return { error: NOT_FOUND_ERROR };
  }

  revalidatePath(`/${restaurantSlug}/admin/menu`);
}

// -- Items ---------------------------------------------------------------

export async function createMenuItem(
  restaurantId: string,
  categoryId: string,
  restaurantSlug: string,
  _prevState: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const validated = MenuItemSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    price: formData.get("price"),
  });

  if (!validated.success) {
    return { fieldErrors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  const { count } = await supabase
    .from("menu_items")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId);

  const { error } = await supabase.from("menu_items").insert({
    restaurant_id: restaurantId,
    category_id: categoryId,
    name: validated.data.name,
    description: validated.data.description || null,
    price_cents: dollarsToCents(validated.data.price),
    sort_order: count ?? 0,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/${restaurantSlug}/admin/menu`);
}

export async function updateMenuItem(
  itemId: string,
  restaurantSlug: string,
  _prevState: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const validated = MenuItemSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    price: formData.get("price"),
  });

  if (!validated.success) {
    return { fieldErrors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_items")
    .update({
      name: validated.data.name,
      description: validated.data.description || null,
      price_cents: dollarsToCents(validated.data.price),
    })
    .eq("id", itemId)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!data || data.length === 0) {
    return { error: NOT_FOUND_ERROR };
  }

  revalidatePath(`/${restaurantSlug}/admin/menu`);
}

export async function deleteMenuItem(
  itemId: string,
  restaurantSlug: string,
): Promise<MenuActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_items")
    .delete()
    .eq("id", itemId)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!data || data.length === 0) {
    return { error: NOT_FOUND_ERROR };
  }

  revalidatePath(`/${restaurantSlug}/admin/menu`);
}

export async function setMenuItemActive(
  itemId: string,
  restaurantSlug: string,
  active: boolean,
): Promise<MenuActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_items")
    .update({ active })
    .eq("id", itemId)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!data || data.length === 0) {
    return { error: NOT_FOUND_ERROR };
  }

  revalidatePath(`/${restaurantSlug}/admin/menu`);
}

// -- Modifier groups -------------------------------------------------------

export async function createModifierGroup(
  restaurantId: string,
  menuItemId: string,
  restaurantSlug: string,
  _prevState: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const validated = ModifierGroupSchema.safeParse({
    name: formData.get("name"),
    selectionType: formData.get("selectionType"),
    required: formData.get("required") === "on",
  });

  if (!validated.success) {
    return { fieldErrors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  const { count } = await supabase
    .from("modifier_groups")
    .select("id", { count: "exact", head: true })
    .eq("menu_item_id", menuItemId);

  const { error } = await supabase.from("modifier_groups").insert({
    restaurant_id: restaurantId,
    menu_item_id: menuItemId,
    name: validated.data.name,
    selection_type: validated.data.selectionType,
    required: validated.data.required,
    sort_order: count ?? 0,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/${restaurantSlug}/admin/menu`);
}

export async function deleteModifierGroup(
  groupId: string,
  restaurantSlug: string,
): Promise<MenuActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("modifier_groups")
    .delete()
    .eq("id", groupId)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!data || data.length === 0) {
    return { error: NOT_FOUND_ERROR };
  }

  revalidatePath(`/${restaurantSlug}/admin/menu`);
}

// -- Modifiers -------------------------------------------------------------

export async function createModifier(
  restaurantId: string,
  modifierGroupId: string,
  restaurantSlug: string,
  _prevState: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const validated = ModifierSchema.safeParse({
    name: formData.get("name"),
    priceDelta: formData.get("priceDelta"),
  });

  if (!validated.success) {
    return { fieldErrors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  const { count } = await supabase
    .from("modifiers")
    .select("id", { count: "exact", head: true })
    .eq("modifier_group_id", modifierGroupId);

  const { error } = await supabase.from("modifiers").insert({
    restaurant_id: restaurantId,
    modifier_group_id: modifierGroupId,
    name: validated.data.name,
    price_delta_cents: dollarsToCents(validated.data.priceDelta),
    sort_order: count ?? 0,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/${restaurantSlug}/admin/menu`);
}

export async function deleteModifier(
  modifierId: string,
  restaurantSlug: string,
): Promise<MenuActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("modifiers")
    .delete()
    .eq("id", modifierId)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!data || data.length === 0) {
    return { error: NOT_FOUND_ERROR };
  }

  revalidatePath(`/${restaurantSlug}/admin/menu`);
}

export async function setModifierActive(
  modifierId: string,
  restaurantSlug: string,
  active: boolean,
): Promise<MenuActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("modifiers")
    .update({ active })
    .eq("id", modifierId)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!data || data.length === 0) {
    return { error: NOT_FOUND_ERROR };
  }

  revalidatePath(`/${restaurantSlug}/admin/menu`);
}
