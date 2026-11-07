import { z } from "zod";

import { MAX_SPLIT_COUNT, SPLIT_MODES } from "@/lib/billing/split";

// Entered as a percentage ("8.25") in the settings form, stored as basis
// points (825).
export const TaxRateSchema = z.object({
  taxRatePercent: z.coerce
    .number({ message: "Enter a number." })
    .min(0, "Tax rate can't be negative.")
    .max(50, "Tax rate can't exceed 50%.")
    .refine((value) => Number.isInteger(Math.round(value * 100 * 1e6) / 1e6), {
      message: "At most two decimal places.",
    }),
});

export const SplitConfigSchema = z
  .object({
    splitMode: z.enum(SPLIT_MODES as [string, ...string[]]),
    splitCount: z.number().int().min(1).max(MAX_SPLIT_COUNT),
  })
  .refine((value) => value.splitMode === "none" || value.splitCount >= 2, {
    message: "Split between at least 2.",
  });

export const AssignItemSchema = z.object({
  checkItemId: z.string().uuid(),
  splitGroup: z.number().int().min(1).max(MAX_SPLIT_COUNT).nullable(),
});

export const CreatePaymentSchema = z.object({
  checkId: z.string().uuid(),
  splitGroup: z.number().int().min(1).max(MAX_SPLIT_COUNT),
  tipCents: z.number().int().min(0).max(1_000_000),
  receiptEmail: z
    .string()
    .trim()
    .email("Enter a valid email or leave it blank.")
    .optional()
    .or(z.literal("")),
});
