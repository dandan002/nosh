import { z } from "zod";

// Every transition the kitchen board and the order-entry ticket are allowed
// to drive directly (both kitchen and server staff get the same moves —
// RLS doesn't distinguish who's doing it, see is_kitchen_or_above() in
// supabase/migrations/0002_floor_menu_orders.sql, which already includes
// the server tier). "ready" -> "delivered" is deliberately excluded: that
// belongs to the server-facing delivery tracking screen (a separate
// phase), not this move/undo mechanism.
const VALID_TRANSITIONS = [
  // forward ("move to the next station")
  ["fired", "preparing"],
  ["preparing", "ready"],
  // backward ("undo" / "move back a station")
  ["preparing", "fired"],
  ["ready", "preparing"],
  // "unsend" — pull back a ticket before the kitchen has touched it
  ["fired", "cancelled"],
] as const;

export const MoveItemStatusSchema = z
  .object({
    fromStatus: z.enum(["fired", "preparing", "ready"]),
    toStatus: z.enum(["preparing", "ready", "fired", "cancelled"]),
  })
  .refine(
    (value) =>
      VALID_TRANSITIONS.some(
        ([from, to]) => from === value.fromStatus && to === value.toStatus,
      ),
    { message: "Invalid status transition." },
  );
