"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { LoginSchema, SignupSchema } from "@/lib/validations/auth";

export type AuthFormState =
  | {
      error?: string;
      fieldErrors?: Record<string, string[]>;
      info?: string;
    }
  | undefined;

export async function signup(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const validated = SignupSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { fieldErrors: validated.error.flatten().fieldErrors };
  }

  const { fullName, email, password } = validated.data;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) {
    return { error: error.message };
  }

  if (!data.session) {
    return {
      info: "Check your email to confirm your account, then log in to continue.",
    };
  }

  redirect("/onboarding/restaurant");
}

export async function login(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const validated = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { fieldErrors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(
    validated.data,
  );

  if (error) {
    return { error: "Invalid email or password." };
  }

  const { data: membership } = await supabase
    .from("staff_members")
    .select("restaurants(slug)")
    .eq("user_id", data.user.id)
    .maybeSingle();

  const restaurant = membership?.restaurants as
    | { slug: string }
    | { slug: string }[]
    | null;
  const slug = Array.isArray(restaurant) ? restaurant[0]?.slug : restaurant?.slug;

  redirect(slug ? `/${slug}/floor` : "/onboarding/restaurant");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
