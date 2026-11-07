import { getRestaurantForSlug, isKitchenOrAbove } from "@/lib/data/restaurant";
import { getKitchenTickets } from "@/lib/data/kitchen";
import { KitchenBoard } from "@/components/kitchen/kitchen-board";

export default async function KitchenPage({
  params,
}: {
  params: Promise<{ restaurantSlug: string }>;
}) {
  const { restaurantSlug } = await params;
  const { restaurant, staffMember } = await getRestaurantForSlug(restaurantSlug);
  const items = await getKitchenTickets(restaurant.id);

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)] md:h-dvh">
      <header className="h-16 border-b border-outline-variant flex items-center px-4 md:px-6 shrink-0">
        <h1 className="font-headline-sm text-headline-sm text-on-surface truncate">
          {restaurant.name} &middot; Kitchen
        </h1>
      </header>

      <KitchenBoard
        restaurantId={restaurant.id}
        restaurantSlug={restaurantSlug}
        items={items}
        canAdvance={isKitchenOrAbove(staffMember.role)}
      />
    </div>
  );
}
