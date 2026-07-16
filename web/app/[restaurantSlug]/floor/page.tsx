import { getRestaurantForSlug } from "@/lib/data/restaurant";

export default async function FloorPage({
  params,
}: {
  params: Promise<{ restaurantSlug: string }>;
}) {
  const { restaurantSlug } = await params;
  const { restaurant } = await getRestaurantForSlug(restaurantSlug);

  return (
    <div className="flex flex-col h-screen">
      <header className="h-16 border-b border-outline-variant flex items-center px-6 shrink-0">
        <h1 className="font-headline-sm text-headline-sm text-on-surface">
          {restaurant.name} &middot; Seating
        </h1>
      </header>
      <div className="flex-1 flex items-center justify-center text-on-surface-variant font-body-md text-body-md">
        Floor plan editor coming soon.
      </div>
    </div>
  );
}
