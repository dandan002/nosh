import { z } from "zod";

export const RestaurantProfileSchema = z.object({
  name: z.string().trim().min(2, "Restaurant name must be at least 2 characters."),
});
