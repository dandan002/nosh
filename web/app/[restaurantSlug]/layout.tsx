import type { ReactNode } from "react";

import { getRestaurantForSlug } from "@/lib/data/restaurant";
import { Sidebar } from "@/components/nav/sidebar";

export default async function RestaurantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ restaurantSlug: string }>;
}) {
  const { restaurantSlug } = await params;
  const { restaurant, staffMember } = await getRestaurantForSlug(restaurantSlug);

  return (
    // Below md the sidebar renders a top bar (in flow) plus an off-canvas
    // drawer, so the shell stacks vertically; at md+ it's the fixed w-20 rail.
    <div className="flex flex-col md:flex-row min-h-dvh bg-background">
      <Sidebar
        restaurantSlug={restaurant.slug}
        restaurantName={restaurant.name}
        staffDisplayName={staffMember.display_name}
      />
      <div className="flex-1 min-w-0 md:ml-20">{children}</div>
    </div>
  );
}
