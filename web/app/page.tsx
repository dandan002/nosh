import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("staff_members")
    .select("restaurants(slug)")
    .eq("user_id", user.id)
    .maybeSingle();

  const restaurant = membership?.restaurants as
    | { slug: string }
    | { slug: string }[]
    | null;
  const slug = Array.isArray(restaurant) ? restaurant[0]?.slug : restaurant?.slug;

  redirect(slug ? `/${slug}/floor` : "/onboarding/restaurant");
}
