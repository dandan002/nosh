"use server";

import { redirect } from "next/navigation";

import { slugify } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";
import { RestaurantProfileSchema } from "@/lib/validations/onboarding";

export type OnboardingFormState =
  | {
      error?: string;
      fieldErrors?: Record<string, string[]>;
    }
  | undefined;

const MAX_SLUG_ATTEMPTS = 5;

export async function createRestaurant(
  _prevState: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const validated = RestaurantProfileSchema.safeParse({
    name: formData.get("name"),
  });

  if (!validated.success) {
    return { fieldErrors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { name } = validated.data;
  const baseSlug = slugify(name) || "restaurant";

  let slug = baseSlug;
  let restaurantId: string | null = null;

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;

    const { data: restaurant, error } = await supabase
      .from("restaurants")
      .insert({ name, slug })
      .select("id")
      .single();

    if (!error) {
      restaurantId = restaurant.id;
      break;
    }

    // 23505 = unique_violation; retry with a different slug suffix.
    if (error.code !== "23505") {
      return { error: error.message };
    }
  }

  if (!restaurantId) {
    return { error: "Could not generate a unique restaurant URL. Try a different name." };
  }

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    "Owner";

  const { error: staffError } = await supabase.from("staff_members").insert({
    restaurant_id: restaurantId,
    user_id: user.id,
    role: "owner",
    display_name: displayName,
  });

  if (staffError) {
    return { error: staffError.message };
  }

  redirect(`/${slug}/floor`);
}
