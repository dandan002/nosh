import { z } from "zod";

export const MenuCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required.").max(60),
});

export const MenuItemSchema = z.object({
  name: z.string().trim().min(1, "Item name is required.").max(80),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  price: z.coerce
    .number()
    .min(0, "Price can't be negative.")
    .max(9999, "Price is too high."),
});

export const ModifierGroupSchema = z.object({
  name: z.string().trim().min(1, "Group name is required.").max(60),
  selectionType: z.enum(["single", "multiple"]),
  required: z.coerce.boolean(),
});

export const ModifierSchema = z.object({
  name: z.string().trim().min(1, "Modifier name is required.").max(60),
  priceDelta: z.coerce.number().min(-9999).max(9999),
});
