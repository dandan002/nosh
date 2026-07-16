import { z } from "zod";

// The only two forward transitions the kitchen display drives itself.
// "ready" -> "delivered" belongs to the server-facing delivery tracking
// screen (a separate phase), not the kitchen.
export const AdvanceItemStatusSchema = z
  .object({
    fromStatus: z.enum(["fired", "preparing"]),
    toStatus: z.enum(["preparing", "ready"]),
  })
  .refine(
    (value) =>
      (value.fromStatus === "fired" && value.toStatus === "preparing") ||
      (value.fromStatus === "preparing" && value.toStatus === "ready"),
    { message: "Invalid status transition." },
  );
