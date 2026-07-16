import { z } from "zod";

export const FloorSectionSchema = z.object({
  name: z.string().trim().min(1, "Section name is required.").max(60),
});

export const TableSchema = z.object({
  label: z.string().trim().min(1, "Table label is required.").max(20),
  seats: z.coerce
    .number()
    .int("Seats must be a whole number.")
    .min(1, "At least 1 seat.")
    .max(30, "30 seats max."),
  shape: z.enum(["round", "square", "rectangle"]),
});
