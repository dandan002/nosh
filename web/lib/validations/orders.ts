import { z } from "zod";

export const SeatTableSchema = z.object({
  partySize: z.coerce
    .number()
    .int("Party size must be a whole number.")
    .min(1, "At least 1 guest.")
    .max(30, "30 guests max."),
});

const DraftOrderItemSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(50),
  notes: z.string().trim().max(300).optional(),
  modifierIds: z.array(z.string().uuid()),
});

export const FireOrderSchema = z.object({
  items: z.array(DraftOrderItemSchema).min(1, "Add at least one item before firing."),
});

export type DraftOrderItemInput = z.infer<typeof DraftOrderItemSchema>;
