import "server-only";

import { createClient } from "@/lib/supabase/server";

export type TableShape = "round" | "square" | "rectangle";
export type TableStatus = "available" | "occupied" | "reserved" | "dirty";

export type FloorTable = {
  id: string;
  label: string;
  seats: number;
  shape: TableShape;
  posX: number;
  posY: number;
  status: TableStatus;
};

export type FloorSection = {
  id: string;
  name: string;
  tables: FloorTable[];
};

export async function getFloorPlan(restaurantId: string): Promise<FloorSection[]> {
  const supabase = await createClient();

  const { data: sections, error } = await supabase
    .from("floor_sections")
    .select(
      "id, name, sort_order, tables (id, label, seats, shape, pos_x, pos_y, status)",
    )
    .eq("restaurant_id", restaurantId)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Failed to load floor plan: ${error.message}`);
  }

  return sections.map((section) => ({
    id: section.id,
    name: section.name,
    tables: section.tables
      .map((table) => ({
        id: table.id,
        label: table.label,
        seats: table.seats,
        shape: table.shape as TableShape,
        posX: table.pos_x,
        posY: table.pos_y,
        status: table.status as TableStatus,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  }));
}
