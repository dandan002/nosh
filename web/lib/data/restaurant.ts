import "server-only";

import { cache } from "react";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type StaffRole = "owner" | "admin" | "manager" | "server" | "kitchen";

// Wrapped in React's cache() so the tenant-shell layout and every page under
// it can each call this without re-running auth.getUser() plus two Supabase
// queries per request — cache() dedupes calls with the same arguments within
// a single render pass.
export const getRestaurantForSlug = cache(async (slug: string) => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!restaurant) {
    notFound();
  }

  const { data: staffMember } = await supabase
    .from("staff_members")
    .select("id, role, display_name")
    .eq("restaurant_id", restaurant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  // RLS already prevents this query from returning another restaurant's
  // rows, but a signed-in user with no membership row here means they
  // don't belong to this restaurant at all.
  if (!staffMember) {
    notFound();
  }

  return {
    restaurant,
    staffMember: staffMember as {
      id: string;
      role: StaffRole;
      display_name: string;
    },
  };
});
