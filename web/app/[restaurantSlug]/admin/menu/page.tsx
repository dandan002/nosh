import { getRestaurantForSlug, isManagerOrAbove } from "@/lib/data/restaurant";
import { getMenu } from "@/lib/data/menu";
import { MenuWorkspace } from "@/components/menu/menu-workspace";

export default async function MenuPage({
  params,
}: {
  params: Promise<{ restaurantSlug: string }>;
}) {
  const { restaurantSlug } = await params;
  const { restaurant, staffMember } = await getRestaurantForSlug(restaurantSlug);
  const categories = await getMenu(restaurant.id);

  return (
    <div className="flex flex-col h-screen">
      <header className="h-16 border-b border-outline-variant flex items-center px-6 shrink-0">
        <h1 className="font-headline-sm text-headline-sm text-on-surface">
          {restaurant.name} &middot; Menu
        </h1>
      </header>

      <MenuWorkspace
        restaurantId={restaurant.id}
        restaurantSlug={restaurantSlug}
        categories={categories}
        canEdit={isManagerOrAbove(staffMember.role)}
      />
    </div>
  );
}
