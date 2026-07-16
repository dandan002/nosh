import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ModifierSelectionType = "single" | "multiple";

export type Modifier = {
  id: string;
  name: string;
  priceDeltaCents: number;
  active: boolean;
};

export type ModifierGroup = {
  id: string;
  name: string;
  selectionType: ModifierSelectionType;
  required: boolean;
  modifiers: Modifier[];
};

export type MenuItem = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  priceCents: number;
  active: boolean;
  modifierGroups: ModifierGroup[];
};

export type MenuCategory = {
  id: string;
  name: string;
  items: MenuItem[];
};

export async function getMenu(restaurantId: string): Promise<MenuCategory[]> {
  const supabase = await createClient();

  const { data: categories, error } = await supabase
    .from("menu_categories")
    .select(
      `id, name, sort_order,
       menu_items (
         id, category_id, name, description, price_cents, sort_order, active,
         modifier_groups (
           id, name, selection_type, required, sort_order,
           modifiers ( id, name, price_delta_cents, sort_order, active )
         )
       )`,
    )
    .eq("restaurant_id", restaurantId)
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

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    items: category.menu_items.map((item) => ({
      id: item.id,
      categoryId: item.category_id,
      name: item.name,
      description: item.description,
      priceCents: item.price_cents,
      active: item.active,
      modifierGroups: item.modifier_groups.map((group) => ({
        id: group.id,
        name: group.name,
        selectionType: group.selection_type as ModifierSelectionType,
        required: group.required,
        modifiers: group.modifiers.map((modifier: {
          id: string;
          name: string;
          price_delta_cents: number;
          active: boolean;
        }) => ({
          id: modifier.id,
          name: modifier.name,
          priceDeltaCents: modifier.price_delta_cents,
          active: modifier.active,
        })),
      })),
    })),
  }));
}
