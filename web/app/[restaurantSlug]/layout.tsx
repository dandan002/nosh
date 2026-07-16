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
    <div className="flex min-h-screen bg-background">
      <Sidebar
        restaurantSlug={restaurant.slug}
        restaurantName={restaurant.name}
        staffDisplayName={staffMember.display_name}
      />
      <div className="flex-1 ml-20">{children}</div>
    </div>
  );
}
